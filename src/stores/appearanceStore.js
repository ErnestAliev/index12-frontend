import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { CHIP_COLOR_FIELDS, appearanceStorageKey, appearanceTokens, cloneAppearance, defaultPreferences,
  defaultTheme, parsePreferences, presetTheme, resolveAppearance, sanitizeTheme } from '@/utils/appearance.js';

export const useAppearanceStore = defineStore('appearance', () => {
  const preferences = ref(defaultPreferences());
  const storageError = ref('');
  const syncError = ref('');
  const syncing = ref(false);
  const libraryBusy = ref(false);
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  let generation = 0, refreshPromise = null;
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
    generation++; refreshPromise = null; syncing.value = false; libraryBusy.value = false; syncError.value = '';
    userId = next;
    storageError.value = '';
    let raw = null, legacyMode = 'dark';
    try { raw = userId ? localStorage.getItem(appearanceStorageKey(userId)) : null; legacyMode = localStorage.getItem('theme'); } catch { /* Default palette still works. */ }
    preferences.value = parsePreferences(raw);
    if (!raw) preferences.value.mode = legacyMode === 'light' ? 'light' : 'dark';
    apply();
    if (userId) void refreshLibrary();
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
  async function requestLibrary(path = '', method = 'GET', body) {
    const response = await fetch(`${apiBase}/user/appearance-themes${path}`, {
      method, credentials:'include', headers:body ? {'Content-Type':'application/json'} : {},
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить темы аккаунта.');
    return data;
  }
  function checkedItem(item) {
    if (!item?.id || !Number.isSafeInteger(item.revision) || item.revision<1) throw new Error('Не удалось загрузить темы аккаунта.');
    const parsed = parsePreferences({version:1,saved:[item]}).saved[0];
    if (!parsed) throw new Error('Не удалось загрузить темы аккаунта.');
    return parsed;
  }
  async function refreshLibrary() {
    if (!userId || libraryBusy.value) return;
    if (refreshPromise) return refreshPromise;
    const ticket = generation;
    syncing.value = true;
    refreshPromise = (async () => {
      try {
        const data = await requestLibrary();
        if (!Array.isArray(data.themes)) throw new Error('Не удалось загрузить темы аккаунта.');
        const remote = data.themes.map(checkedItem);
        if (ticket!==generation) return;
        // Only unsynchronized legacy entries are imported. Cached shared themes are never resurrected.
        const legacy = savedThemes.value.filter(t=>!t.revision);
        for (const item of legacy) {
          const imported = checkedItem((await requestLibrary('', 'POST', item)).theme);
          if (ticket!==generation) return;
          const index = remote.findIndex(t=>t.id===imported.id);
          if (index<0) remote.push(imported); else remote[index] = imported;
          preferences.value.saved = [...remote,...legacy.filter(t=>!remote.some(r=>r.id===t.id))];
          persist();
        }
        if (ticket!==generation) return;
        preferences.value.saved = remote;
        syncError.value = ''; persist();
      } catch (error) {
        if (ticket===generation) syncError.value = error.message || 'Нет связи с библиотекой тем.';
      } finally {
        if (ticket===generation) { syncing.value = false; refreshPromise = null; }
      }
    })();
    return refreshPromise;
  }
  async function saveTheme(name, updateId = null, revision = null) {
    const clean = name.trim().slice(0, 48);
    if (!clean) return { error:'Укажите название темы.' };
    if (!userId) return { error:'Войдите в аккаунт для сохранения темы.' };
    if (libraryBusy.value) return {error:'Дождитесь сохранения темы.'};
    const ticket = generation;
    // Capture local edits before awaiting network; refreshing only changes the library.
    const item = {id:updateId || crypto.randomUUID(),name:clean,mode:mode.value,theme:cloneAppearance(theme.value)};
    await refreshPromise;
    if (ticket!==generation) return {};
    if (libraryBusy.value) return {error:'Дождитесь сохранения темы.'};
    if (savedThemes.value.some(t=>t.id!==updateId && t.name.toLocaleLowerCase()===clean.toLocaleLowerCase())) return {error:'Тема с таким названием уже есть.'};
    libraryBusy.value = true;
    try {
      const data = await requestLibrary(updateId ? `/${encodeURIComponent(updateId)}` : '', updateId ? 'PUT':'POST', {...item,...(updateId ? {revision} : {})});
      if (ticket!==generation) return {};
      const saved = checkedItem(data.theme);
      preferences.value.saved = [...savedThemes.value.filter(t=>t.id!==saved.id),saved];
      syncError.value = ''; persist();
      return {id:saved.id,revision:saved.revision};
    } catch (error) { return {error:error.message || 'Не удалось сохранить тему в аккаунте.'}; }
    finally { if (ticket===generation) libraryBusy.value = false; }
  }
  function selectSaved(id) {
    const item = savedThemes.value.find(t => t.id === id);
    if (!item) return;
    preferences.value.mode = item.mode;
    preferences.value.themes[item.mode] = cloneAppearance(item.theme); commit();
  }
  async function deleteSaved(id, revision) {
    if (libraryBusy.value) return false;
    const ticket = generation;
    await refreshPromise;
    if (ticket!==generation || libraryBusy.value) return false;
    libraryBusy.value = true;
    try {
      await requestLibrary(`/${encodeURIComponent(id)}`, 'DELETE', {revision});
      if (ticket!==generation) return false;
      preferences.value.saved = savedThemes.value.filter(t=>t.id!==id);
      syncError.value = ''; persist(); return true;
    } catch (error) { if (ticket===generation) syncError.value = error.message || 'Не удалось удалить тему.'; return false; }
    finally { if (ticket===generation) libraryBusy.value = false; }
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
    const refresh = () => { if (document.visibilityState !== 'hidden') void refreshLibrary(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('storage', sync);
    return () => { observer.disconnect(); window.removeEventListener('storage', sync); window.removeEventListener('focus',refresh); window.removeEventListener('online',refresh); };
  }
  return { preferences, mode, theme, savedThemes, storageError, syncError, syncing, libraryBusy, refreshLibrary, resolved, loadUser, setMode, setField,
    inheritField, resetScope, choosePreset, restore, saveTheme, selectSaved, deleteSaved, connect };
});
