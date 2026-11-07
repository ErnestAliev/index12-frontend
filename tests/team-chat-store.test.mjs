import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "vite";
import { createPinia, setActivePinia, disposePinia } from "pinia";
let server, useTeamChatStore, teamApi, store, pinia;
const tick = () => new Promise((r) => setImmediate(r)),
  settle = () => new Promise((r) => setTimeout(r, 120));
const empty = () => ({
  messages: [],
  tasks: [],
  members: [],
  people: [],
});
before(async () => {
  globalThis.window = Object.assign(new EventTarget(), {
    location: { origin: "http://localhost:5173" },
  });
  globalThis.document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  globalThis.EventSource = class extends EventTarget {
    static sources = [];
    constructor() {
      super();
      this.closed = false;
      EventSource.sources.push(this);
    }
    close() {
      this.closed = true;
    }
  };
  server = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
  });
  ({ useTeamChatStore, teamApi } = await server.ssrLoadModule(
    "/src/stores/teamChatStore.js",
  ));
});
after(async () => {
  store?.stop();
  if (pinia) disposePinia(pinia);
  await server.close();
  for (const key of ["window", "document", "EventSource"])
    delete globalThis[key];
});
function fixture() {
  store?.stop();
  if (pinia) disposePinia(pinia);
  pinia = createPinia();
  setActivePinia(pinia);
  store = useTeamChatStore();
  return store;
}
test("a workspace switch discards old member identity and never reveals its cached messages", async () => {
  const s = fixture(),
    requests = [];
  teamApi.defaults.adapter = (config) =>
    new Promise((resolve) =>
      requests.push({
        config,
        resolve: (data) => resolve({ data, status: 200 }),
      }),
    );
  const old = s.start("old");
  await tick();
  const next = s.start("new");
  await tick();
  requests[1].resolve({
    workspaceId: "new",
    status: "active",
    role: "manager",
  });
  await tick();
  requests[2].resolve(empty());
  await next;
  requests[0].resolve({ workspaceId: "old", status: "active" });
  await old;
  assert.equal(s.me.workspaceId, "new");
  assert.deepEqual(s.state.messages, []);
  s.stop();
});
test("switching while a live update is debounced cannot permanently stop chat synchronization", async () => {
  const s = fixture();
  let calls = 0;
  teamApi.defaults.adapter = async (config) => {
    if (config.url === "/state") calls++;
    return {
      status: 200,
      data:
        config.url === "/me"
          ? { workspaceId: "workspace", status: "active", role: "manager" }
          : empty(),
    };
  };
  await s.start("workspace");
  EventSource.sources.at(-1).dispatchEvent(new Event("changed"));
  s.stop();
  await s.start("workspace");
  const baseline = calls;
  EventSource.sources.at(-1).dispatchEvent(new Event("changed"));
  await settle();
  assert.equal(calls, baseline + 1);
  s.stop();
  assert.equal(EventSource.sources.at(-1).closed, true);
});
test("the first new message gets an unread badge, and revocation clears cached messages", async () => {
  const s = fixture();
  let messages = [],
    revoked = false;
  teamApi.defaults.adapter = async (config) => {
    if (config.url === "/me")
      return {
        status: 200,
        data: { workspaceId: "workspace", status: "active", role: "employee" },
      };
    if (revoked)
      throw Object.assign(new Error("revoked"), {
        response: { status: 403, data: { message: "Доступ закрыт" } },
      });
    return { status: 200, data: { ...empty(), messages } };
  };
  await s.start("workspace");
  messages = [{ _id: "message", text: "Private" }];
  EventSource.sources.at(-1).dispatchEvent(new Event("changed"));
  await settle();
  assert.equal(s.unread, 1);
  s.show();
  assert.equal(s.unread, 0);
  revoked = true;
  await s.refresh();
  assert.deepEqual(s.state.messages, []);
  assert.equal(s.me.status, "revoked");
  assert.equal(EventSource.sources.at(-1).closed, true);
  s.stop();
});

test("outgoing messages appear immediately, send in order, and do not lock the composer or reload identity", async () => {
  const s = fixture(),
    posts = [];
  let meReads = 0;
  teamApi.defaults.adapter = (config) => {
    if (config.url === "/me") {
      meReads++;
      return Promise.resolve({
        status: 200,
        data: {
          workspaceId: "workspace",
          actorId: "author",
          displayName: "Author",
          status: "active",
        },
      });
    }
    if (config.url === "/state")
      return Promise.resolve({ status: 200, data: empty() });
    return new Promise((resolve) =>
      posts.push({
        body: JSON.parse(config.data),
        resolve: (data) => resolve({ status: 200, data }),
      }),
    );
  };
  await s.start("workspace");
  const first = s.send("First"),
    second = s.send("Second");
  assert.equal(s.outbox.length, 2);
  assert.equal(s.busy, false);
  await tick();
  assert.equal(posts.length, 1);
  posts[0].resolve({
    message: {
      _id: first,
      text: "First",
      createdAt: "2026-11-06T06:00:00Z",
      attachments: [],
      version: 0,
    },
  });
  await tick();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.id, second);
  assert.equal(s.outbox[0]._id, second);
  posts[1].resolve({
    message: {
      _id: second,
      text: "Second",
      createdAt: "2026-11-06T06:00:01Z",
      attachments: [],
      version: 0,
    },
  });
  await tick();
  assert.equal(s.outbox.length, 0);
  assert.deepEqual(
    s.state.messages.map((m) => m._id),
    [first, second],
  );
  assert.equal(meReads, 1);
  s.stop();
});
test("a failed send retries the same ID and an earlier live confirmation wins over a late POST response", async () => {
  const s = fixture(),
    posts = [];
  let messages = [];
  teamApi.defaults.adapter = (config) => {
    if (config.url === "/me")
      return Promise.resolve({
        status: 200,
        data: {
          workspaceId: "workspace",
          actorId: "author",
          displayName: "Author",
          status: "active",
        },
      });
    if (config.url === "/state")
      return Promise.resolve({ status: 200, data: { ...empty(), messages } });
    return new Promise((resolve, reject) =>
      posts.push({
        body: JSON.parse(config.data),
        resolve: (data) => resolve({ status: 200, data }),
        reject,
      }),
    );
  };
  await s.start("workspace");
  const id = s.send("Retry");
  await tick();
  posts[0].reject(new Error("offline"));
  await tick();
  assert.equal(s.outbox[0]._delivery, "failed");
  s.retryMessage(id);
  s.retryMessage(id);
  await tick();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.id, id);
  messages = [
    {
      _id: id,
      text: "Retry",
      createdAt: "2026-11-06T06:00:00Z",
      version: 2,
      approval: { state: "approved" },
      attachments: [],
    },
  ];
  await s.refresh();
  assert.equal(s.outbox.length, 0);
  posts[1].resolve({
    message: { ...messages[0], version: 0, approval: undefined },
  });
  await tick();
  assert.equal(s.state.messages.length, 1);
  assert.equal(s.state.messages[0].approval.state, "approved");
  s.stop();
});
test("a workspace switch clears outgoing messages and ignores an old send acknowledgement", async () => {
  const s = fixture();
  let complete;
  teamApi.defaults.adapter = (config) => {
    if (config.url === "/me")
      return Promise.resolve({
        status: 200,
        data: {
          workspaceId: config.headers["x-index12-workspace-id"],
          actorId: "author",
          displayName: "Author",
          status: "active",
        },
      });
    if (config.url === "/state")
      return Promise.resolve({ status: 200, data: empty() });
    return new Promise(
      (resolve) => (complete = (data) => resolve({ status: 200, data })),
    );
  };
  await s.start("old");
  const id = s.send("Private old draft");
  await tick();
  await s.start("new");
  assert.equal(s.outbox.length, 0);
  complete({
    message: { _id: id, text: "Private old draft", attachments: [] },
  });
  await tick();
  assert.equal(s.state.messages.length, 0);
  assert.equal(s.me.workspaceId, "new");
  s.stop();
});

test("initial history has a retryable loader, and refresh watches current-page deletion IDs with bounded older IDs", async () => {
  const s = fixture();
  let release;
  const first = new Promise((r) => (release = r));
  const messages = Array.from({ length: 50 }, (_, i) => ({
    _id: `current-${i}`,
  }));
  let reads = 0,
    params;
  teamApi.defaults.adapter = async (config) => {
    if (config.url === "/me")
      return {
        status: 200,
        data: { workspaceId: "history", status: "active" },
      };
    if (++reads === 1) await first;
    params = config.params;
    return { status: 200, data: { ...empty(), messages } };
  };
  const started = s.start("history");
  await tick();
  assert.equal(s.historyLoading, true);
  assert.equal(s.historyReady, false);
  release();
  await started;
  assert.equal(s.historyLoading, false);
  assert.equal(s.historyReady, true);
  s.olderMessageIds = Array.from({ length: 1000 }, (_, i) => `older-${i}`);
  await s.refresh();
  assert.equal(params.messageIds.split(",").length, 150);
  assert.ok(
    messages.every((m) => params.messageIds.split(",").includes(m._id)),
  );
  s.stop();
  assert.equal(s.historyReady, false);
  assert.equal(s.historyLoading, false);
});

test("member changes use one foreground request and apply the returned member without waiting for identity or full state", async () => {
  const s = fixture();
  teamApi.defaults.adapter = async (config) => ({
    status: 200,
    data:
      config.url === "/me"
        ? { workspaceId: "fast", status: "active", owner: true }
        : empty(),
  });
  await s.start("fast");
  s.state.members = [
    { _id: "member", role: "employee", status: "revoked", version: 1 },
  ];
  const calls = [];
  teamApi.defaults.adapter = async (config) => {
    calls.push(config.url);
    if (config.url !== "/members/member") return new Promise(() => {});
    return {
      status: 200,
      data: {
        member: {
          _id: "member",
          role: "manager",
          status: "active",
          version: 2,
        },
      },
    };
  };
  await s.action(
    "/members/member",
    { role: "manager", status: "active", expectedVersion: 1 },
    "patch",
  );
  assert.deepEqual(calls, ["/members/member"]);
  assert.equal(s.state.members[0].status, "active");
  assert.equal(s.busy, false);
  assert.equal(s.me.owner, true);
  s.stop();
});

test("task mutations merge immediately, preserve identity and discard session state on logout", async () => {
 const s=fixture();
 teamApi.defaults.adapter=async config=>({status:200,data:config.url==="/me"?{workspaceId:"tasks",actorId:"actor",status:"active"}:config.method==="patch"?{task:{_id:"task",status:"done",version:2}}:empty()});
 await s.start("tasks");
 s.state.tasks=[{_id:"task",status:"open",version:1}];
 await s.action("/tasks/task",{expectedVersion:1,status:"done"},"patch");
 assert.equal(s.state.tasks.length,1);
 assert.equal(s.state.tasks[0].status,"done");
 assert.equal(s.me.actorId,"actor");
 s.stop();
 assert.deepEqual(s.state.tasks,[]);
 assert.equal(s.requestedTaskId,null);
});

test('task comments use the shared outbox with task identity and never appear in the main feed', async()=>{
 const s=fixture();let posted;
 teamApi.defaults.adapter=async config=>{
  if(config.url==='/me')return {status:200,data:{workspaceId:'task-workspace',actorId:'actor',status:'active'}};
  if(config.url==='/messages'&&config.method==='post'){
   posted=JSON.parse(config.data);
   return {status:201,data:{message:{_id:posted.id,taskId:posted.taskId,authorId:'actor',text:posted.text,createdAt:new Date().toISOString(),attachments:[],version:0}}};
  }
  return {status:200,data:config.url==='/messages'?{messages:[],hasMore:false}:empty()};
 };
 await s.start('task-workspace');
 const id=s.send('Ответ внутри задачи',[],{taskId:'task'});
 await settle();
 assert.equal(posted.taskId,'task');assert.equal(posted.id,id);
 assert.equal(s.state.messages.length,0);assert.equal(s.threads.task.messages[0].text,'Ответ внутри задачи');assert.equal(s.outbox.length,0);
 s.stop();assert.deepEqual(s.threads,{});
});

test('task deletion removes its cover, cached discussion and pending comments without touching the main conversation',async()=>{
 const s=fixture();
 teamApi.defaults.adapter=async config=>({status:200,data:config.url==='/me'?{workspaceId:'tasks',actorId:'actor',status:'active'}:config.method==='delete'?{deletedTaskId:'task'}:empty()});
 await s.start('tasks');
 s.state.tasks=[{_id:'task'}];s.state.messages=[{_id:'cover',kind:'task',taskId:'task'},{_id:'normal',text:'Общий чат'}];
 s.threads.task={messages:[{_id:'comment',taskId:'task'}]};s.requestedTaskId='task';
 await s.action('/tasks/task',{expectedVersion:0},'delete');
 assert.deepEqual(s.state.tasks,[]);assert.equal(s.state.messages[0]._id,'normal');assert.equal(s.state.messages.length,1);assert.equal(s.threads.task,undefined);assert.equal(s.requestedTaskId,null);s.stop();
});
