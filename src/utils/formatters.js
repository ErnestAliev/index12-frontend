// Эта функция будет доступна всему приложению
// Она принимает число, убирает десятичную часть и добавляет пробелы
export const formatNumber = (num) => {
  const numAsInt = Math.floor(num);
  return String(numAsInt).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// Короткий формат для узких колонок (21д режим)
// 200 000 -> "200K", 1 500 000 -> "1.5M"
export const formatShortNumber = (num) => {
  const absNum = Math.abs(num);

  if (absNum >= 1000000) {
    // Миллионы
    const millions = absNum / 1000000;
    return millions >= 10
      ? `${Math.floor(millions)}M`
      : `${millions.toFixed(1)}M`;
  } else if (absNum >= 1000) {
    // Тысячи
    const thousands = absNum / 1000;
    return thousands >= 10
      ? `${Math.floor(thousands)}K`
      : `${thousands.toFixed(1)}K`;
  }

  // Меньше 1000 - показываем как есть
  return Math.floor(absNum).toString();
};

// (Позже мы можем добавить сюда formatCurrency, formatDate и т.д.)