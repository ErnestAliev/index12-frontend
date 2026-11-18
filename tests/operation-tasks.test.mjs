import assert from "node:assert/strict";
import { test } from "node:test";
import {
  operationTaskIds,
  operationTaskUrl,
} from "../src/utils/operationTasks.js";
const id = "9ead7032-0016-4238-b512-6ee172424366",
  ws = "aaaaaaaaaaaaaaaaaaaaaaaa";
test("task references from descriptions, comments, structured fields and trusted links", () => {
  assert.deepEqual(
    operationTaskIds({
      description: `Lounge One — коммунальные платежи. По задаче ${id}.`,
    }),
    [id],
  );
  assert.deepEqual(
    operationTaskIds({
      sourceTaskId: "chat:" + id,
      description: `Исходная задача: ${id}`,
    }),
    [id],
  );
  assert.deepEqual(
    operationTaskIds({
      comment: `https://www.index12.com/?teamChat=${ws}&task=${id}`,
    }),
    [id],
  );
  assert.deepEqual(operationTaskIds({ description: `Счёт ${id}` }), []);
  assert.deepEqual(
    operationTaskIds({ description: `https://evil.invalid/?task=${id}` }),
    [],
  );
  assert.equal(operationTaskUrl(id, ws), `/?teamChat=${ws}&task=${id}`);
  assert.equal(
    operationTaskUrl(id, ws, "/team/own-invitation"),
    `/team/own-invitation?task=${id}`,
  );
  assert.equal(operationTaskUrl("javascript:alert(1)", ws), "");
});
