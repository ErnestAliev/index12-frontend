import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia, disposePinia } from "pinia";
import { useCodexDeliveryStore } from "../src/stores/codexDeliveryStore.js";
function fixture() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return { s: useCodexDeliveryStore(), close: () => disposePinia(pinia) };
}
test("Codex keeps failed delivery data across window closes, preserves the retry key, and clears other workspace data", () => {
  const { s, close } = fixture();
  s.setScope("actor:one");
  const row = s.add({
    id: "local",
    chatId: "chat",
    requestId: "same-request",
    text: "Private",
    delivery: "sending",
    knownIds: [],
    sourceFiles: [],
  });
  s.interrupt();
  assert.equal(row.delivery, "failed");
  s.setScope("actor:one");
  assert.equal(s.rows[0].requestId, "same-request");
  s.setScope("actor:two");
  assert.equal(s.rows.length, 0);
  close();
});
test("Codex reconciles only confirmed new messages, including duplicate text and distinct request IDs", () => {
  const { s, close } = fixture();
  s.setScope("actor:one");
  s.add({
    id: "local",
    chatId: "chat",
    requestId: "uuid",
    text: "Same text",
    accepted: true,
    knownIds: ["old"],
    sourceFiles: [],
    attachments: [],
  });
  s.reconcile("chat", [{ id: "old", role: "user", text: "Same text" }]);
  assert.equal(s.rows.length, 1);
  s.reconcile("chat", [{ id: "new", role: "user", text: "Same text" }], false);
  assert.equal(s.rows.length, 1);
  s.reconcile("chat", [{ id: "new", role: "user", text: "Same text" }]);
  assert.equal(s.rows.length, 0);
  s.add({
    id: "local",
    chatId: "chat",
    requestId: "uuid",
    text: "Same text",
    accepted: false,
    knownIds: [],
    sourceFiles: [],
    attachments: [],
  });
  s.reconcile(
    "chat",
    [{ id: "other:uuid:user", role: "user", text: "Same text" }],
    false,
  );
  assert.equal(s.rows.length, 0);
  close();
});
