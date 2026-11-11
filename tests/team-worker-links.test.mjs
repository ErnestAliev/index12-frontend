import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(
  new URL("../public/team-sw.js", import.meta.url),
  "utf8",
);
test("chat push opens scoped owner entry or staff invitation and rejects external or malformed destinations", async () => {
  const handlers = {},
    shown = [],
    opened = [],
    messages = [];
  const origin = "https://index12.test",
    workspace = "a".repeat(24);
  let persisted, sequence=0;
  const self = {
    location: { origin },
    crypto: { randomUUID: () => 'click-' + (++sequence) },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => { assert.equal(persisted.url,url,'commit clicked destination before iOS opens the app');opened.push(url); },
    },
  };
  runInNewContext(source, {
    self,
    URL,
    importScripts: path => {
      assert.equal(path,'/team-click-store.js');
      self.index12TeamClickStore={write:async value=>{persisted=value;},read:async()=>persisted};
    },
    MessageChannel, setTimeout, clearTimeout,
    fetch: () => {
      throw Error("No network expected");
    },
  });
  async function push(url) {
    let waiting;
    handlers.push({
      data: { json: () => ({ title: "Test", url, workspaceId: workspace }) },
      waitUntil: (p) => {
        waiting = p;
      },
    });
    await waiting;
  }
  await push("/?teamChat=" + workspace);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].data.url, origin + "/?teamChat=" + workspace);
  let waiting;
  handlers.notificationclick({
    notification: { data: shown[0].data, close() {} },
    waitUntil: (p) => {
      waiting = p;
    },
  });
  await waiting;
  assert.equal(opened[0], origin + "/?teamChat=" + workspace);
  const token = "fixture-invite-00000000000";
  await push("/team/" + token);
  assert.equal(shown.length, 2);
  for (const bad of [
    "https://external.test/?teamChat=" + workspace,
    "/?teamChat=" + workspace + "&redirect=elsewhere",
    "/?teamChat=invalid",
    "/other",
    "http://[",
    "/team/" + token + "#extra",
  ])
    await push(bad);
  assert.equal(shown.length, 2);
  self.clients.matchAll = async () => [
    {
      url: origin + "/?teamChat=" + workspace,
      focus: async () => {},
      postMessage: (m, ports) => { messages.push(m); ports[0].postMessage({received:true}); },
    },
  ];
  handlers.notificationclick({
    notification: { data: shown[0].data, close() {} },
    waitUntil: (p) => {
      waiting = p;
    },
  });
  await waiting;
  assert.equal(opened.length, 1);
  assert.equal(messages[0].workspaceId, workspace);
  const taskId = "11111111-1111-4111-8111-111111111111";
  self.clients.matchAll = async () => [{
    url: origin + "/mobile?teamChat=" + workspace + "&task=" + taskId + "&message=" + taskId,
    focus: async () => {}, postMessage: (m, ports) => { messages.push(m); ports[0].postMessage({received:true}); },
  }];
  handlers.notificationclick({notification:{data:{...shown[0].data,taskId,messageId:taskId},close(){}},waitUntil:p=>{waiting=p;}});
  await waiting;
  assert.equal(opened.length,1,"task notifications reuse the open chat window");
  assert.equal(messages.at(-1).taskId,taskId);
  assert.equal(messages.at(-1).messageId,taskId);
  assert.equal(messages.at(-1).url,origin+'/?teamChat='+workspace+'&task='+taskId+'&message='+taskId);
  // An old/suspended app accepts focus but does not acknowledge routing.
  const navigated=[];
  self.clients.matchAll=async()=>[{url:origin+'/mobile?teamChat='+workspace,focus:async()=>{},postMessage(){},navigate:async url=>{navigated.push(url);return {};}}];
  handlers.notificationclick({notification:{data:{...shown[0].data,taskId,messageId:taskId},close(){}},waitUntil:p=>{waiting=p;}});
  await waiting;
  assert.deepEqual(navigated,[origin+'/?teamChat='+workspace+'&task='+taskId+'&message='+taskId]);
  self.clients.matchAll=async()=>[];
  handlers.notificationclick({notification:{data:{...shown[0].data,taskId,messageId:taskId},close(){}},waitUntil:p=>{waiting=p;}});
  await waiting;
  assert.equal(opened.at(-1),navigated[0],'cold launch carries the same complete destination');
  // iOS opens / and drops the query; the fresh page requests the committed click.
  const recovered=[];
  handlers.message({data:{type:'team:client-ready'},source:{url:origin+'/',postMessage:message=>recovered.push(message)},waitUntil:p=>{waiting=p;}});
  await waiting;
  assert.equal(recovered[0].url,navigated[0]);assert.equal(recovered[0].clickId,persisted.id);
  handlers.message({data:{type:'team:client-ready'},source:{url:origin+'/team/other-invitation-000000000',postMessage:message=>recovered.push(message)},waitUntil:p=>{waiting=p;}});
  await waiting;assert.equal(recovered.length,1,'owner click is not forwarded into a staff invitation');
});
