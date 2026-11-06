import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reviewerLabel,
  decisionStatus,
} from "../src/utils/teamRequestStatus.js";
test("review queues show registered names without assigning an arbitrary director", () => {
  const people = [
    { owner: true, role: "employee", name: "Эрнест Алиев" },
    { role: "director", name: "Анна" },
    { role: "director", name: "Данияр" },
  ];
  assert.equal(reviewerLabel("manager", people), "Управляющий (Эрнест Алиев)");
  assert.equal(
    reviewerLabel("director", people),
    "Руководитель (Анна, Данияр)",
  );
  assert.equal(reviewerLabel("director", []), "Руководитель");
});
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
