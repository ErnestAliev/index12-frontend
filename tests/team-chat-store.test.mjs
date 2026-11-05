import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer } from "vite";
import { createPinia, setActivePinia, disposePinia } from "pinia";
let server, useTeamChatStore, teamApi, store, pinia;
const tick = () => new Promise((r) => setImmediate(r)),
  settle = () => new Promise((r) => setTimeout(r, 120));
const empty = () => ({
  messages: [],
  requests: [],
  members: [],
  companies: [],
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
