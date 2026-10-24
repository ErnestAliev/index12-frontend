// Editing must preserve tiyn even when compact widgets display whole tenge.
export function formatAmountInput(value) {
  const source = typeof value === 'number'
    ? Math.abs(value).toFixed(2).replace(/\.?0+$/, '')
    : String(value ?? '');
  const cleaned = source.replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const [whole, ...fractions] = cleaned.split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fractions.length ? `${grouped}.${fractions.join('').slice(0, 2)}` : grouped;
}
