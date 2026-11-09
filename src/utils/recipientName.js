// Display-only dative forms. Directory names and IDs always remain unchanged.
const male = new Set('Александр Алексей Анатолий Андрей Антон Артем Артём Артур Борис Вадим Валентин Валерий Василий Виктор Виталий Владимир Владислав Вячеслав Георгий Глеб Григорий Давид Даниил Данил Денис Дмитрий Евгений Егор Ержан Ерлан Захар Иван Игорь Илья Кирилл Константин Лев Леонид Максим Марат Марк Михаил Назар Никита Николай Олег Павел Петр Пётр Ринат Роман Руслан Сергей Станислав Степан Султан Тимур Федор Фёдор Шерхан Эдуард Эмиль Эрнест Юрий Ярослав'.toLocaleLowerCase('ru-RU').split(' '));
const female = new Set('Александра Алина Алла Анастасия Ангелина Анна Антонина Валентина Валерия Варвара Вера Вероника Виктория Галина Дарья Диана Евгения Екатерина Елена Елизавета Жанна Зинаида Зоя Инна Ирина Ксения Лариса Лидия Любовь Людмила Маргарита Марина Мария Надежда Наталья Нина Оксана Олеся Ольга Полина Раиса Регина Римма Светлана София Софья Таисия Тамара Татьяна Ульяна Эльвира Юлия Яна'.toLocaleLowerCase('ru-RU').split(' '));
const exceptions = { павел: 'павлу', лев: 'льву', петр: 'петру', пётр: 'петру' };
function preserveCase(source, value) {
  if (source === source.toLocaleUpperCase('ru-RU')) return value.toLocaleUpperCase('ru-RU');
  return source[0] === source[0].toLocaleUpperCase('ru-RU') ? value[0].toLocaleUpperCase('ru-RU') + value.slice(1) : value;
}
function decline(word, gender) {
  const lower = word.toLocaleLowerCase('ru-RU');
  if (!/^[а-яё]+$/i.test(word)) return word;
  const given = male.has(lower) || female.has(lower);
  let value = lower;
  if (given && exceptions[lower]) value = exceptions[lower];
  else if (!given && /(?:ко|их|ых|уа|иа)$/.test(lower)) return word;
  else if (!given && gender === 'female' && /(?:ова|ева|ёва|ина|ына)$/.test(lower)) value = lower.slice(0, -1) + 'ой';
  else if (!given && gender === 'female' && /ая$/.test(lower)) value = lower.slice(0, -2) + 'ой';
  else if (!given && gender === 'male' && /(?:ый|ой)$/.test(lower)) value = lower.slice(0, -2) + 'ому';
  else if (!given && gender === 'male' && /ий$/.test(lower)) value = lower.slice(0, -2) + 'ему';
  else if (/ия$/.test(lower)) value = lower.slice(0, -1) + 'и';
  else if (/[ая]$/.test(lower)) value = lower.slice(0, -1) + 'е';
  else if (gender === 'male' && /[йь]$/.test(lower)) value = lower.slice(0, -1) + 'ю';
  else if (gender === 'male' && /[бвгджзклмнпрстфхцчшщ]$/.test(lower)) value = lower + 'у';
  else if (gender === 'female' && given && /ь$/.test(lower)) value = lower.slice(0, -1) + 'и';
  return preserveCase(word, value);
}
export function recipientName(name) {
  if (typeof name !== 'string' || !name.trim()) return name || '';
  const words = name.split(/([\s-]+)/), names = words.map(word => word.toLocaleLowerCase('ru-RU'));
  const given = names.find(word => male.has(word) || female.has(word));
  // Unrecognised names, nicknames, initials and organisations stay as entered.
  if (!given) return name;
  const gender = male.has(given) ? 'male' : 'female';
  return words.map(word => decline(word, gender)).join('');
}
