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
  const self = {
    location: { origin },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  runInNewContext(source, {
    self,
    URL,
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
      postMessage: (m) => messages.push(m),
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
    url: origin + "/?teamChat=" + workspace + "&task=" + taskId + "&message=" + taskId,
    focus: async () => {}, postMessage: m => messages.push(m),
  }];
  handlers.notificationclick({notification:{data:{...shown[0].data,taskId,messageId:taskId},close(){}},waitUntil:p=>{waiting=p;}});
  await waiting;
  assert.equal(opened.length,1,"task notifications reuse the open chat window");
  assert.equal(messages.at(-1).taskId,taskId);
  assert.equal(messages.at(-1).messageId,taskId);
});
