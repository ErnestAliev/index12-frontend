import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
test("settings queue retries with the same id; undo preserves other fields and recovers a lost acknowledgement", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Desktop", maxTouchPoints: 0 },
    configurable: true,
  });
  const source = (
    await readFile(
      new URL("../src/utils/preferenceHistory.js", import.meta.url),
      "utf8",
    )
  ).replace("import.meta.env.VITE_API_BASE_URL", '"http://test/api"');
  const history = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  let fail = true,
    failComplete = false;
  const writes = [],
    receipts = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith("/preferences")) {
      writes.push(body);
      if (fail) throw Error("offline");
    } else {
      receipts.push(body);
      if (failComplete) throw Error("connection lost");
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  history.setHistoryIdentity("user");
  await history.flushPreferenceHistory();
  history.recordPreference(
    "homeWindow",
    { width: 25, height: 100 },
    { width: 30, height: 100 },
  );
  history.recordPreference(
    "homeWindow",
    { width: 30, height: 100 },
    { width: 40, height: 100 },
  );
  await history.flushPreferenceHistory();
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(values.get("index12-history-queue:user")).length, 1);
  fail = false;
  await history.flushPreferenceHistory();
  assert.equal(writes[0].id, writes[1].id);
  assert.deepEqual(writes[1].before, { width: 25, height: 100 });
  assert.equal(writes[1].after.width, 40);
  assert.deepEqual(JSON.parse(values.get("index12-history-queue:user")), []);
  let current = { width: 40, height: 200 };
  const stop = history.registerPreference(
    "homeWindow",
    () => current,
    (value) => {
      current = value;
      localStorage.setItem("index12-homeWindow", JSON.stringify(value));
      history.recordPreference("homeWindow", { width: 40, height: 200 }, value);
    },
  );
  const preference = {
    id: "entry",
    key: "homeWindow",
    requestId: "receipt",
    changes: [
      {
        path: ["width"],
        before: { exists: true, value: 25 },
        after: { exists: true, value: 40 },
      },
    ],
  };
  failComplete = true;
  await assert.rejects(
    history.applyPreferenceUndo(preference),
    /connection lost/,
  );
  assert.deepEqual(current, { width: 25, height: 200 });
  assert.equal(
    JSON.parse(values.get("index12-history-receipt:user")).applied,
    true,
  );
  failComplete = false;
  await history.recoverPreferenceUndo();
  assert.equal(receipts.at(-1).applied, true);
  assert.equal(values.has("index12-history-receipt:user"), false);
  await history.flushPreferenceHistory();
  assert.equal(writes.length, 2, "undo never records a second settings change");
  await assert.rejects(
    history.applyPreferenceUndo({ ...preference, requestId: "stale" }),
    /уже изменён/,
  );
  assert.equal(receipts.at(-1).applied, false);
  assert.deepEqual(current, { width: 25, height: 200 });
  stop();
  assert.deepEqual(
    history.preferenceValue("homeWindow"),
    { width: 25, height: 200 },
    "unmounted window falls back to its stored preference",
  );
  history.setHistoryIdentity(null);
});
