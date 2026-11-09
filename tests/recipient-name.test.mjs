import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipientName } from '../src/utils/recipientName.js';
test('Кому uses dative forms without changing directory names', () => {
  for (const [name, expected] of Object.entries({ Давид: 'Давиду', Валентина: 'Валентине', Шерхан: 'Шерхану', Эрнест: 'Эрнесту', 'Эрнест Алиев': 'Эрнесту Алиеву', 'Валентина Иванова': 'Валентине Ивановой', 'Дмитрий Сергеевич Иванов': 'Дмитрию Сергеевичу Иванову', 'Павел Петров': 'Павлу Петрову', 'Любовь Петрова': 'Любови Петровой', Мария: 'Марии' })) assert.equal(recipientName(name), expected);
});
test('unrecognised names and initials retain their original spelling', () => {
  for (const name of ['Жанар', 'David Smith', 'А. Б.', 'Себе', 'Сотрудник', '']) assert.equal(recipientName(name), name);
});
