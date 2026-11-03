export const CALENDAR_TZ = 'Asia/Almaty';
export const statusLabels = { planned: 'Запланировано', today: 'На сегодня', done: 'Исполнено', overdue: 'Просрочено' };
export function localParts(value = Date.now()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: CALENDAR_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
export function dayAt(value = Date.now()) { const p = localParts(value); return `${p.year}-${p.month}-${p.day}`; }
export function timeAt(value) { if (!value) return ''; const p = localParts(value); return `${p.hour}:${p.minute}`; }
export function localInstant(date, time) {
  const naive = Date.parse(`${date}T${time}:00Z`), p = localParts(naive);
  return new Date(naive - (Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - naive)).toISOString();
}
export function addDays(date, count) { return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10); }
export function monthDays(month) {
  const first = `${month}-01`, offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length: Math.ceil((last + offset) / 7) * 7 }, (_, i) => addDays(first, i - offset));
}
export function defaultSlot(date = dayAt(), now = Date.now()) {
  const next = Math.ceil((now + 1) / 3600000) * 3600000;
  const slotDate = date === dayAt(now) ? dayAt(next) : date;
  const startsAt = localInstant(slotDate, `${localParts(next).hour}:00`);
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + 3600000).toISOString(), dueDate: slotDate, allDay: false };
}
export function taskState(task, now = Date.now()) {
  if (task.status === 'done') return 'done';
  const deadline = task.endsAt ? Date.parse(task.endsAt) : task.dueDate ? Date.parse(localInstant(addDays(task.dueDate, 1), '00:00')) : null;
  if (deadline !== null && deadline <= now) return 'overdue';
  return (task.startsAt ? dayAt(task.startsAt) : task.dueDate) === dayAt(now) ? 'today' : 'planned';
}
export function taskOnDay(task, date) { const first = task.startsAt ? dayAt(task.startsAt) : task.dueDate; const last = task.endsAt ? dayAt(Date.parse(task.endsAt) - 1) : first; return first && date >= first && date <= last; }
export function shiftTask(task, date) {
  if (!task.startsAt) return { dueDate: date, allDay: true };
  const delta = Date.parse(date) - Date.parse(dayAt(task.startsAt));
  return { dueDate: date, startsAt: new Date(Date.parse(task.startsAt) + delta).toISOString(), endsAt: new Date(Date.parse(task.endsAt) + delta).toISOString(), allDay: false };
}
export function oneHourEnd(date, time) {
  const end = new Date(Date.parse(localInstant(date, time)) + 3600000).toISOString();
  return { date: dayAt(end), time: timeAt(end) };
}
