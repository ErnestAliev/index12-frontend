const TOO_PATTERN = /(^|[^a-zA-Zа-яА-Я0-9])т\.?\s*о\.?\s*о([^a-zA-Zа-яА-Я0-9]|$)/i;
const IP_PATTERN = /(^|[^a-zA-Zа-яА-Я0-9])и\.?\s*п([^a-zA-Zа-яА-Я0-9]|$)/i;

export const normalizeTaxRegime = (regime) => (regime === 'our' ? 'our' : 'simplified');

export const detectCompanyLegalForm = (name = '') => {
    const source = String(name || '').trim();
    if (!source) return 'other';
    if (TOO_PATTERN.test(source)) return 'too';
    if (IP_PATTERN.test(source)) return 'ip';
    return 'other';
};

export const getDefaultTaxPercentByName = (name = '', taxRegime = 'simplified') => {
    const regime = normalizeTaxRegime(taxRegime);
    if (regime === 'our') {
        const form = detectCompanyLegalForm(name);
        return form === 'ip' ? 10 : 20;
    }
    return 3;
};

export const getTaxRegimeLabel = (regime = 'simplified') => (
    normalizeTaxRegime(regime) === 'our' ? 'ОУР' : 'Упрощенка'
);
