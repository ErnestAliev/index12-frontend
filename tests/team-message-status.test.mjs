import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decisionStatus,
} from "../src/utils/teamMessageStatus.js";
test("decision status uses the actual actor recorded at that stage", () => {
  const history = [
    { action: "approve", role: "manager", name: "Эрнест Алиев" },
    { action: "enrich", role: "manager", name: "Другой" },
  ];
  assert.equal(
    decisionStatus(history),
    "Согласовано Управляющим (Эрнест Алиев)",
  );
  assert.equal(decisionStatus([...history, { action: "recall" }]), "");
  assert.equal(
    decisionStatus([
      ...history,
      { action: "reject", role: "director", name: "Анна" },
    ]),
    "Отклонено Директором (Анна)",
  );
});
