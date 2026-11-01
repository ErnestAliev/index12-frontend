import {
  COLOR_FIELDS,
  METRIC_FIELDS,
  APPEARANCE_SCOPE_LABELS,
  FONT_OPTIONS,
} from "./appearance.js";
import { DEVICE_LABELS } from "./appearanceTemplates.js";

export const operationNames = {
  income: "Доход",
  expense: "Расход",
  transfer: "Перевод",
  withdrawal: "Вывод средств",
};
const fields = {
  date: "Дата",
  amount: "Сумма",
  category: "Категория",
  account: "Счёт",
  route: "Маршрут",
  contractor: "Контрагент",
  project: "Проект",
  description: "Описание",
  recipient: "Получатель",
  reason: "Основание",
  status: "Закрытие",
  salary: "Зарплата",
  offset: "Связанная операция",
  type: "Тип",
  cellIndex: "Ячейка",
};
const preferences = {
  appearance: "Оформление",
  theme: "Режим темы",
  dashboardLayout: "Виджеты: расположение",
  dashboardForecastState: "Виджеты: прогноз",
  accountVisibilityMode: "Видимость счетов",
  universalEditModalTabOrder: "Порядок вкладок",
  codexWindow: "Окно Codex",
  homeWindow: "Основное окно",
  mobileWindow: "Мобильное окно",
  journalWindow: "Журнал операций",
};
const parts = {
  accounts: "Счета/Кассы",
  companies: "Владельцы счетов",
  contractors: "Контрагенты",
  projects: "Проекты",
  individuals: "Физлица",
  categories: "Категории",
  all: "Все",
  open: "Открытые",
  hidden: "Скрытые",
  none: "Ничего",
  name: "Название",
  headerHeight: "Высота виджетов",
  timelineHeight: "Высота таблицы",
  chartsExpanded: "Графики открыты",
  width: "Ширина",
  height: "Высота",
  collapsed: "Свёрнут",
  light: "Светлая тема",
  dark: "Тёмная тема",
  enabled: "Настройка включена",
  preset: "Палитра",
  isClosed: "Закрыта",
  fontFamily: "Шрифт",
  mode: "Режим",
};
export const money = (value) =>
  Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export function dateText(value, time = false) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(
        "ru-RU",
        time
          ? {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          : { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : String(value);
}
export function historyTitle(row) {
  return row.kind === "operation"
    ? operationNames[row.operationType] || "Операция"
    : row.target === "preference"
      ? preferences[row.key] || "Настройки"
      : row.label || "Тема";
}
function valueText(value, row, key) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value))
    return value.map((v) => valueText(v, row, key)).join(", ") || "—";
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${parts[k] || k}: ${valueText(v, row, k)}`)
      .join(", ");
  return (
    row?.entities?.[String(value)] ||
    FONT_OPTIONS[value]?.label ||
    operationNames[value] ||
    parts[value] ||
    String(value)
  );
}
export function settingPath(path) {
  const operationField = path.includes("operations")
    ? {
        text: "Цвет суммы",
        muted: "Цвет категории",
        fontSize: "Размер суммы",
        textWeight: "Жирность суммы",
        secondarySize: "Размер категории",
        secondaryWeight: "Жирность категории",
      }
    : {};
  return path
    .filter(
      (p) =>
        ![
          "config",
          "devices",
          "global",
          "overrides",
          "colors",
          "metrics",
        ].includes(p),
    )
    .map(
      (p) =>
        operationField[p] ||
        DEVICE_LABELS[p] ||
        parts[p] ||
        APPEARANCE_SCOPE_LABELS[p] ||
        COLOR_FIELDS[p] ||
        METRIC_FIELDS[p]?.label ||
        p,
    )
    .join(" / ");
}
export function historyLines(row) {
  if (row.action !== "updated")
    return [
      {
        label: "",
        before: row.action === "created" ? "Создана" : "Удалена",
        after: "",
        color: null,
      },
    ];
  if (row.kind === "operation") {
    const { field, before, after } = row.change;
    const value = (side) =>
      field === "amount"
        ? money(side.amount)
        : field === "date"
          ? before.dateKey === after.dateKey
            ? `Ячейка ${(side.cellIndex || 0) + 1}`
            : dateText(side.date)
          : field === "category"
            ? valueText(
                side.categoryIds?.length ? side.categoryIds : side.categoryId,
                row,
              )
            : field === "project"
              ? side.projectScope === "all"
                ? "Все проекты"
                : valueText(
                    side.splitMeta?.length
                      ? side.splitMeta.map((s) => s.projectId)
                      : side.projectId,
                    row,
                  )
              : Object.values(side)
                  .filter((v) => v !== null)
                  .map((v) => valueText(v, row))
                  .join(" / ") || "—";
    return [
      {
        label: fields[field] || "Изменение",
        before: value(before),
        after: value(after),
      },
    ];
  }
  if (row.target === "activeTemplate")
    return [
      {
        label: "Выбранная тема",
        before: row.beforeName || "По умолчанию",
        after: row.afterName || row.label || "По умолчанию",
      },
    ];
  return (row.changes || []).map((c) => ({
    label: settingPath(c.path) || "Значение",
    before: c.before.exists ? valueText(c.before.value, row) : "Наследуется",
    after: c.after.exists ? valueText(c.after.value, row) : "Наследуется",
    color: /^#[0-9a-f]{6}$/i.test(c.after.value) ? c.after.value : null,
  }));
}
