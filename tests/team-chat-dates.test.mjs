import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chatDateKey, chatDateLabel } from "../src/utils/teamChatDates.js";

test("messages share the viewer's day across timestamp formats", () => {
  const date = new Date(2026, 10, 8, 14, 30);
  assert.equal(chatDateKey(date), "2026-11-08");
  assert.equal(chatDateKey(date.toISOString()), chatDateKey(date));
  assert.equal(chatDateKey(new Date(2026, 10, 9)), "2026-11-09");
});
test("day labels distinguish today, yesterday, older dates and another year", () => {
  const now = new Date(2026, 10, 8, 12);
  assert.equal(chatDateLabel(new Date(2026, 10, 8, 1), now), "Сегодня");
  assert.equal(chatDateLabel(new Date(2026, 10, 7, 23, 59), now), "Вчера");
  assert.equal(chatDateLabel(new Date(2026, 10, 6), now), "6 ноября");
  assert.match(chatDateLabel(new Date(2025, 11, 31), now), /31 декабря 2025/);
  assert.equal(chatDateLabel(new Date(2025, 11, 31), new Date(2026, 0, 1)), "Вчера");
  assert.equal(chatDateLabel("bad timestamp", now), "");
});
test("yesterday is a calendar day, including a 23-hour DST transition", () => {
  const moduleUrl = new URL("../src/utils/teamChatDates.js", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `import {chatDateLabel} from ${JSON.stringify(moduleUrl)}; console.log(chatDateLabel(new Date(2026,2,8,12),new Date(2026,2,9,0,30)));`], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
  assert.equal(output.trim(), "Вчера");
});
