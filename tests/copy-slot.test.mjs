import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the real card payload builders without mounting their unrelated
// account editors. Clone/date state is supplied as it is at the Copy button.
function cardPayload(kind, clone, dateChanged = false) {
  const filename = kind === 'income' ? 'IncomePopup.vue' : 'ExpensePopup.vue';
  const source = readFileSync(new URL(`../src/components/${filename}`, import.meta.url), 'utf8');
  const functionName = kind === 'income' ? 'preparePayload' : 'processSave';
  const nextFunction = kind === 'income' ? 'const syncSelectedAccountOwner' : 'const handleSave';
  const start = source.indexOf(`const ${functionName} =`);
  const end = source.indexOf(nextFunction, start);
  assert.ok(start >= 0 && end > start);
  const ref = value => ({ value });
  let saved;
  const props = { cellIndex: 4, operationToEdit: { _id: 'source' } };
  const context = {
    props, isCloneMode: ref(clone), isDateChanged: ref(dateChanged),
    isEditMode: { get value() { return !clone; } },
    selectedOwner: ref(null), selectedContractorValue: ref(null),
    selectedAccountId: ref('account'), selectedCategoryId: ref('category'),
    selectedProjectIds: ref(['project']), primaryProjectId: ref('project'), defaultProjectId: ref(null),
    amount: ref('100'), editableDate: ref('2026-10-09'), description: ref('Копия'),
    normalizeId: value => value?._id || value,
    createSmartDate: value => new Date(`${value}T12:00:00`),
    isIncomeOffsetMode: ref(false), selectedIncomeOpId: ref(null),
    isSaving: ref(false), isCreditWarningVisible: ref(false),
    buildCounterpartyDefaultsPayload: () => null,
    emit: (_event, payload) => { saved = payload; },
  };
  vm.runInNewContext(source.slice(start, end) + `\nglobalThis.buildPayload = ${functionName};`, context);
  const result = context.buildPayload(kind === 'income' ? {} : ['category']);
  return kind === 'income' ? result : saved.data;
}

for (const kind of ['income', 'expense']) {
  test(`${kind} copy on the same date requests a free slot instead of the source slot`, () => {
    assert.equal(cardPayload(kind, true).cellIndex, undefined);
  });
  test(`${kind} editing on the same date preserves the existing slot`, () => {
    assert.equal(cardPayload(kind, false).cellIndex, 4);
  });
  test(`${kind} copy on another date also requests a free slot`, () => {
    assert.equal(cardPayload(kind, true, true).cellIndex, undefined);
  });
}
