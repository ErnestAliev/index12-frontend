export const profileFields = [
  ['name', 'Название в INDEX12'], ['legalName', 'Полное наименование'], ['identificationNumber', 'БИН/ИИН'],
  ['legalAddress', 'Юридический адрес'], ['postalAddress', 'Почтовый адрес'], ['director', 'Руководитель'], ['chiefAccountant', 'Главный бухгалтер'],
  ['registrationDate', 'Дата регистрации', 'date'], ['activity', 'Вид деятельности / ОКЭД'], ['registrationStatus', 'Статус регистрации'], ['kbe', 'КБе'],
  ['phone', 'Телефон'], ['email', 'Электронная почта'], ['website', 'Сайт'], ['vatNumber', 'Свидетельство по НДС'], ['vatRegistrationDate', 'Дата учёта по НДС', 'date']
];
export function profileDraft(value) {
  return { ...Object.fromEntries(profileFields.map(([key]) => [key, value?.[key] || ''])), notes: value?.notes || '',
    bankAccounts: (value?.bankAccounts || []).map(row => ({ iban: row.iban || '', bankName: row.bankName || '', bic: row.bic || '', currency: row.currency || '' })),
    externalLinks: (value?.externalLinks || []).map(row => ({ title: row.title || '', url: row.url || '', purpose: row.purpose || 'documents' })) };
}
export function profileText(value) {
  const rows = profileFields.map(([key, label]) => `${label}: ${value[key] || '—'}`);
  for (const bank of value.bankAccounts || []) rows.push('', `ИИК: ${bank.iban || '—'}`, `Банк: ${bank.bankName || '—'}`, `БИК: ${bank.bic || '—'}`, `Валюта: ${bank.currency || '—'}`);
  for (const link of value.externalLinks || []) rows.push('', `${link.title || 'Документы'}: ${link.url}`);
  if (value.notes) rows.push('', `Примечания: ${value.notes}`);
  return rows.join('\n');
}
export function downloadProfile(value, format = 'txt') {
  const blob = new Blob([format === 'json' ? JSON.stringify(value, null, 2) : profileText(value)], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${(value.name || 'Реквизиты').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100)}.${format}`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
