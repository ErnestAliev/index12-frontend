import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nationalPhone,
  formatPhone,
  phoneInput,
} from "../src/utils/teamPhone.js";
test("fixed +7 field accepts national digits and pasted country/trunk prefix without duplication", () => {
  for (const value of ["7054886698", "+7 (705) 488-66-98", "87054886698"]) {
    assert.equal(nationalPhone(value), "7054886698");
    assert.equal(formatPhone(value), "705 488 66 98");
  }
  assert.equal(formatPhone("7"), "7");
  assert.equal(formatPhone("70548"), "705 48");
  assert.equal(formatPhone("abc"), "");
});
test("formatting keeps the cursor next to the edited digits and permits clearing the field", () => {
  let caret;
  const field = {
    value: "7059486698",
    selectionStart: 4,
    setSelectionRange: (a) => (caret = a),
  };
  assert.equal(phoneInput({ target: field }), "705 948 66 98");
  assert.equal(caret, 5);
  field.value = "";
  field.selectionStart = 0;
  assert.equal(phoneInput({ target: field }), "");
  assert.equal(caret, 0);
});
