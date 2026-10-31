import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { CHIP_COLOR_FIELDS, appearanceStorageKey, appearanceTokens, cloneAppearance, defaultPreferences,
  defaultTheme, parsePreferences, presetTheme, resolveAppearance, sanitizeTheme } from '@/utils/appearance.js';

export const useAppearanceStore = defineStore('appearance', () => {
  const preferences = ref(defaultPreferences());
  const storageError = ref('');
  let userId = null;
  const mode = computed(() => preferences.value.mode);
  const theme = computed(() => preferences.value.themes[mode.value]);
  const savedThemes = computed(() => preferences.value.saved);
  const resolved = scope => resolveAppearance(theme.value, scope);

  function apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode.value);
    let style = document.getElementById('index12-personal-theme');
    if (!style) { style = document.createElement('style'); style.id = 'index12-personal-theme'; document.head.append(style); }
    style.textContent = theme.value.enabled
      ? `:root[data-theme="${mode.value}"][data-appearance-custom] {\n${Object.entries(appearanceTokens(theme.value)).map(([key, value]) => `${key}: ${value};`).join('\n')}\n}` : '';
    root.toggleAttribute('data-appearance-custom', theme.value.enabled);
    // Canvas charts also need a signal when the mode itself has not changed.
    root.dataset.appearanceRevision = String(Number(root.dataset.appearanceRevision || 0) + 1);
  }
  function persist() {
    if (!userId) return false;
    try {
      localStorage.setItem(appearanceStorageKey(userId), JSON.stringify(preferences.value));
      localStorage.setItem('theme', mode.value);
      storageError.value = '';
      return true;
    } catch {
      storageError.value = 'Не удалось сохранить настройки в этом браузере.';
      return false;
    }
  }
  function commit() { apply(); return persist(); }
  function loadUser(id) {
    const next = id ? String(id) : null;
    if (next === userId && userId !== null) return;
    userId = next;
    storageError.value = '';
    let raw = null, legacyMode = 'dark';
    try { raw = userId ? localStorage.getItem(appearanceStorageKey(userId)) : null; legacyMode = localStorage.getItem('theme'); } catch { /* Default palette still works. */ }
    preferences.value = parsePreferences(raw);
    if (!raw) preferences.value.mode = legacyMode === 'light' ? 'light' : 'dark';
    apply();
  }
  function setMode(value) { preferences.value.mode = value === 'light' ? 'light' : 'dark'; commit(); }
  function setField(scope, group, key, value) {
    const next = cloneAppearance(theme.value);
    const target = scope === 'global' ? next.global : next.overrides[scope];
    if (!target || !['colors', 'metrics'].includes(group)) return;
    target[group][key] = value;
    next.enabled = true; next.preset = '';
    preferences.value.themes[mode.value] = sanitizeTheme(next, mode.value);
    commit();
  }
  function inheritField(scope, group, key) {
    if (scope === 'global') {
      if (group === 'colors' && Object.hasOwn(CHIP_COLOR_FIELDS, key)) { delete theme.value.global.colors[key]; commit(); }
      return;
    }
    delete theme.value.overrides[scope]?.[group]?.[key]; commit();
  }
  function resetScope(scope) {
    if (scope === 'global') preferences.value.themes[mode.value] = defaultTheme(mode.value);
    else theme.value.overrides[scope] = { colors: {}, metrics: {} };
    commit();
  }
  function choosePreset(id) { preferences.value.themes[mode.value] = presetTheme(id, mode.value); commit(); }
  function restore(snapshot) {
    for (const m of ['light', 'dark']) preferences.value.themes[m] = sanitizeTheme(snapshot.themes[m], m);
    preferences.value.mode = snapshot.mode; commit();
  }
  function saveTheme(name, updateId = null) {
    const clean = name.trim().slice(0, 48);
    if (!clean) return { error: 'Укажите название темы.' };
    if (savedThemes.value.some(t => t.id !== updateId && t.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) return { error: 'Тема с таким названием уже есть.' };
    if (!updateId && savedThemes.value.length >= 40) return { error: 'Сохранено 40 тем. Удалите ненужную тему.' };
    const item = { id: updateId || crypto.randomUUID(), name: clean, mode: mode.value, theme: cloneAppearance(theme.value) };
    const previous = cloneAppearance(savedThemes.value);
    preferences.value.saved = updateId ? previous.map(t => t.id === updateId ? item : t) : [...previous, item];
    if (!persist()) { preferences.value.saved = previous; return { error: storageError.value }; }
    return { id: item.id };
  }
  function selectSaved(id) {
    const item = savedThemes.value.find(t => t.id === id);
    if (!item) return;
    preferences.value.mode = item.mode;
    preferences.value.themes[item.mode] = cloneAppearance(item.theme); commit();
  }
  function deleteSaved(id) {
    const previous = cloneAppearance(savedThemes.value);
    preferences.value.saved = previous.filter(t => t.id !== id);
    if (!persist()) { preferences.value.saved = previous; return false; }
    return true;
  }
  function connect() {
    const observer = new MutationObserver(() => {
      const value = document.documentElement.getAttribute('data-theme');
      if (['light', 'dark'].includes(value) && value !== mode.value) setMode(value);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const sync = event => {
      if (userId && event.key === appearanceStorageKey(userId)) { preferences.value = parsePreferences(event.newValue); apply(); }
    };
    window.addEventListener('storage', sync);
    return () => { observer.disconnect(); window.removeEventListener('storage', sync); };
  }
  return { preferences, mode, theme, savedThemes, storageError, resolved, loadUser, setMode, setField,
    inheritField, resetScope, choosePreset, restore, saveTheme, selectSaved, deleteSaved, connect };
});
