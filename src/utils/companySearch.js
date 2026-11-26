export const normalizeCompanySearch = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export function companyLegalForm(company) {
  if (company.legalForm && company.legalForm !== 'other') return company.legalForm;
  const names = [company.name, company.legalName].map(normalizeCompanySearch);
  if (names.some(name => /^(ип|ip)( |$)/.test(name) || name.includes('индивидуальный предприниматель'))) return 'ip';
  if (names.some(name => /^(тоо|too)( |$)/.test(name) || name.includes('товарищество с ограниченной ответственностью'))) return 'too';
  if (names.some(name => /^(ао|ao)( |$)/.test(name) || name.includes('акционерное общество'))) return 'ao';
  if (names.some(name => /^(ооо|ooo)( |$)/.test(name))) return 'ooo';
  return 'other';
}
export function matchesCompanySearch(company, query = '', form = 'all') {
  const legalForm = companyLegalForm(company);
  if (form !== 'all' && form !== legalForm) return false;
  const source = normalizeCompanySearch(`${company.name || ''} ${company.legalName || ''}`);
  return normalizeCompanySearch(query).split(' ').filter(Boolean).every(term => {
    if (term === 'ип' || term === 'ip') return legalForm === 'ip';
    if (term === 'тоо' || term === 'too') return legalForm === 'too';
    return source.includes(term);
  });
}
