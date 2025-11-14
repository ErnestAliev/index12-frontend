// Эта функция будет доступна всему приложению
// Она принимает число, убирает десятичную часть и добавляет пробелы
export const formatNumber = (num) => {
  const numAsInt = Math.floor(num);
  return String(numAsInt).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// (Позже мы можем добавить сюда formatCurrency, formatDate и т.д.)