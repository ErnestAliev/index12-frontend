import {
  cloneAppearance,
  defaultTheme,
  parsePreferences,
  sanitizeTheme,
} from "./appearance.js";

export const DEVICE_LABELS = {
  desktop: "Десктоп",
  tablet: "Планшет",
  mobile: "Мобилка",
};
export const appearanceTemplateStorageKey = (id) =>
  `index12-appearance-v2:${encodeURIComponent(String(id))}`;
export const defaultPair = () => ({
  light: defaultTheme("light"),
  dark: defaultTheme("dark"),
});
export const defaultTemplate = () => ({
  schema: 3,
  devices: {
    desktop: defaultPair(),
    tablet: { light: {}, dark: {} },
    mobile: { light: {}, dark: {} },
  },
});
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, patch, depth = 0) {
  const out = cloneAppearance(base);
  if (!plain(patch) || depth > 5) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (value === null) delete out[key];
    else
      out[key] = plain(value)
        ? merge(plain(out[key]) ? out[key] : {}, value, depth + 1)
        : value;
  }
  return out;
}
function diff(base, next) {
  const out = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (!Object.hasOwn(next, key)) out[key] = null;
    else if (plain(next[key]) && plain(base[key])) {
      const change = diff(base[key], next[key]);
      if (Object.keys(change).length) out[key] = change;
    } else if (JSON.stringify(base[key]) !== JSON.stringify(next[key]))
      out[key] = next[key];
  }
  return out;
}
export function sanitizeTemplate(input) {
  const out = defaultTemplate();
  for (const mode of ["light", "dark"]) {
    const base = sanitizeTheme(input?.devices?.desktop?.[mode], mode);
    out.devices.desktop[mode] = base;
    for (const device of ["tablet", "mobile"])
      out.devices[device][mode] = diff(
        base,
        sanitizeTheme(merge(base, input?.devices?.[device]?.[mode]), mode),
      );
  }
  return out;
}
export function resolveTemplate(config, device, mode) {
  const base = config.devices.desktop[mode];
  return device === "desktop"
    ? cloneAppearance(base)
    : sanitizeTheme(merge(base, config.devices[device][mode]), mode);
}
export function setTemplateMode(config, device, mode, theme) {
  const next = cloneAppearance(config),
    clean = sanitizeTheme(theme, mode);
  next.devices[device][mode] =
    device === "desktop" ? clean : diff(next.devices.desktop[mode], clean);
  return next;
}
export function templateFromLegacy(item, fallback = defaultPair()) {
  const config = defaultTemplate();
  config.devices.desktop = cloneAppearance(fallback);
  if (item?.theme)
    config.devices.desktop[item.mode === "dark" ? "dark" : "light"] =
      sanitizeTheme(item.theme, item.mode);
  return sanitizeTemplate(config);
}
export function sanitizeSavedTemplate(item) {
  if (
    !item ||
    typeof item.id !== "string" ||
    !/^[\w-]{1,100}$/.test(item.id) ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 1 ||
    item.config?.schema !== 3
  )
    return null;
  return {
    id: item.id,
    name: item.name.trim().slice(0, 48),
    config: sanitizeTemplate(item.config),
    revision: item.revision,
    deviceRevisions: Object.fromEntries(
      Object.keys(DEVICE_LABELS).map((k) => [
        k,
        Number.isSafeInteger(item.deviceRevisions?.[k]) &&
        item.deviceRevisions[k] > 0
          ? item.deviceRevisions[k]
          : 1,
      ]),
    ),
  };
}
export function defaultTemplatePreferences() {
  return {
    version: 2,
    mode: "dark",
    config: defaultTemplate(),
    selectedId: null,
    base: null,
    saved: [],
    legacySaved: [],
  };
}
export function parseTemplatePreferences(raw, legacyRaw) {
  const out = defaultTemplatePreferences();
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data?.version === 2) {
      out.mode = data.mode === "light" ? "light" : "dark";
      out.config = sanitizeTemplate(data.config);
      out.selectedId =
        typeof data.selectedId === "string" ? data.selectedId : null;
      out.base = sanitizeSavedTemplate(data.base);
      out.saved = (Array.isArray(data.saved) ? data.saved : [])
        .map(sanitizeSavedTemplate)
        .filter(Boolean)
        .slice(0, 40);
      out.legacySaved = parsePreferences({
        version: 1,
        saved: data.legacySaved,
      }).saved;
      return out;
    }
    const old = parsePreferences(legacyRaw);
    out.mode = old.mode;
    out.config.devices.desktop = old.themes;
    out.legacySaved = old.saved;
  } catch {
    /* Keep the current screen usable even with a damaged cache. */
  }
  return out;
}
export function detectAppearanceDevice({
  userAgent = "",
  maxTouchPoints = 0,
  width = 1440,
} = {}) {
  if (
    /iPad/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) ||
    (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))
  )
    return "tablet";
  if (/iPhone|iPod|Android|IEMobile|Opera Mini/i.test(userAgent) || width < 700)
    return "mobile";
  if (maxTouchPoints > 1 && width <= 1366) return "tablet";
  return "desktop";
}
