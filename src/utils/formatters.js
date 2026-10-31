// Эта функция будет доступна всему приложению
// Она принимает число, убирает десятичную часть и добавляет пробелы
export const formatNumber = (num) => {
  const numAsInt = Math.floor(num);
  return String(numAsInt).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// Compact display only; source amounts and form values retain their full precision.
export const formatShortNumber = (num) => {
  const value = Math.abs(Number(num));
  if (!Number.isFinite(value)) return '0';
  const compact = n => String(Math.round(n * 10) / 10);
  if (value >= 999950) return `${compact(value / 1000000)} M`;
  if (value >= 1000) return `${compact(value / 1000)} K`;
  return String(Math.floor(value));
};
