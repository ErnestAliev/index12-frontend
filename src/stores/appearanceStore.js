import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  CHIP_COLOR_FIELDS,
  appearanceStorageKey,
  appearanceTokens,
  cloneAppearance,
  defaultTheme,
  presetTheme,
  resolveAppearance,
  sanitizeTheme,
} from "@/utils/appearance.js";
import {
  DEVICE_LABELS,
  appearanceTemplateStorageKey,
  defaultTemplate,
  defaultTemplatePreferences,
  detectAppearanceDevice,
  parseTemplatePreferences,
  resolveTemplate,
  sanitizeSavedTemplate,
  sanitizeTemplate,
  setTemplateMode,
  templateFromLegacy,
} from "@/utils/appearanceTemplates.js";

export const useAppearanceStore = defineStore("appearance", () => {
  const preferences = ref(defaultTemplatePreferences()),
    storageError = ref(""),
    syncError = ref(""),
    syncing = ref(false),
    libraryBusy = ref(false);
  const nativeDevice = detectAppearanceDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    width: window.innerWidth,
  });
  const editingDevice = ref(nativeDevice);
  const apiBase = (
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"
  ).replace(/\/$/, "");
  let userId = null,
    generation = 0,
    refreshPromise = null;
  const mode = computed(() => preferences.value.mode);
  const theme = computed(() =>
    resolveTemplate(preferences.value.config, editingDevice.value, mode.value),
  );
  const savedThemes = computed(() => preferences.value.saved);
  const selectedId = computed(() => preferences.value.selectedId);
  const dirty = computed(
    () =>
      JSON.stringify(preferences.value.config) !==
      JSON.stringify(preferences.value.base?.config || defaultTemplate()),
  );
  const deviceCustomized = computed(
    () =>
      editingDevice.value !== "desktop" &&
      ["light", "dark"].some(
        (m) =>
          Object.keys(preferences.value.config.devices[editingDevice.value][m])
            .length,
      ),
  );
  const resolved = (scope) => resolveAppearance(theme.value, scope);
  function apply() {
    const root = document.documentElement;
    root.setAttribute("data-theme", mode.value);
    let style = document.getElementById("index12-personal-theme");
    if (!style) {
      style = document.createElement("style");
      style.id = "index12-personal-theme";
      document.head.append(style);
    }
    style.textContent = theme.value.enabled
      ? `:root[data-theme="${mode.value}"][data-appearance-custom] {\n${Object.entries(
          appearanceTokens(theme.value),
        )
          .map(([k, v]) => `${k}: ${v};`)
          .join("\n")}\n}`
      : "";
    root.toggleAttribute("data-appearance-custom", theme.value.enabled);
    root.dataset.appearanceRevision = String(
      Number(root.dataset.appearanceRevision || 0) + 1,
    );
  }
  function persist() {
    if (!userId) return false;
    try {
      localStorage.setItem(
        appearanceTemplateStorageKey(userId),
        JSON.stringify(preferences.value),
      );
      localStorage.setItem("theme", mode.value);
      storageError.value = "";
      return true;
    } catch {
      storageError.value = "Не удалось сохранить настройки в этом браузере.";
      return false;
    }
  }
  function commit() {
    apply();
    return persist();
  }
  function adopt(item, config = item?.config || defaultTemplate()) {
    preferences.value.selectedId = item?.id || null;
    preferences.value.base = item ? cloneAppearance(item) : null;
    preferences.value.config = cloneAppearance(config);
    commit();
  }
  function loadUser(id) {
    const next = id ? String(id) : null;
    if (next === userId && userId !== null) return;
    generation++;
    refreshPromise = null;
    syncing.value = false;
    libraryBusy.value = false;
    syncError.value = "";
    storageError.value = "";
    userId = next;
    editingDevice.value = nativeDevice;
    let raw = null,
      legacy = null,
      legacyMode = "dark";
    try {
      raw = userId
        ? localStorage.getItem(appearanceTemplateStorageKey(userId))
        : null;
      legacy = userId
        ? localStorage.getItem(appearanceStorageKey(userId))
        : null;
      legacyMode = localStorage.getItem("theme");
    } catch {
      /* Use the stock palette. */
    }
    preferences.value = parseTemplatePreferences(raw, legacy);
    if (!raw && !legacy)
      preferences.value.mode = legacyMode === "light" ? "light" : "dark";
    apply();
    if (userId) void refreshLibrary();
  }
  function setMode(value) {
    preferences.value.mode = value === "light" ? "light" : "dark";
    commit();
  }
  function setEditingDevice(device) {
    if (Object.hasOwn(DEVICE_LABELS, device)) {
      editingDevice.value = device;
      apply();
    }
  }
  function replaceMode(value) {
    preferences.value.config = setTemplateMode(
      preferences.value.config,
      editingDevice.value,
      mode.value,
      value,
    );
    commit();
  }
  function setField(scope, group, key, value) {
    const next = cloneAppearance(theme.value),
      target = scope === "global" ? next.global : next.overrides[scope];
    if (!target || !["colors", "metrics"].includes(group)) return;
    target[group][key] = value;
    next.enabled = true;
    next.preset = "";
    replaceMode(sanitizeTheme(next, mode.value));
  }
  function isFieldInherited(scope, group, key) {
    const source =
      editingDevice.value === "desktop"
        ? theme.value
        : preferences.value.config.devices[editingDevice.value][mode.value];
    const section =
      scope === "global" ? source.global : source.overrides?.[scope];
    return !Object.hasOwn(section?.[group] || {}, key);
  }
  function inheritField(scope, group, key) {
    if (editingDevice.value !== "desktop") {
      const patch =
        preferences.value.config.devices[editingDevice.value][mode.value];
      const section =
        scope === "global" ? patch.global : patch.overrides?.[scope];
      if (section?.[group]) delete section[group][key];
      preferences.value.config = sanitizeTemplate(preferences.value.config);
      commit();
      return;
    }
    const next = cloneAppearance(theme.value);
    if (scope === "global") {
      if (group === "colors" && Object.hasOwn(CHIP_COLOR_FIELDS, key))
        delete next.global.colors[key];
      else return;
    } else delete next.overrides[scope]?.[group]?.[key];
    replaceMode(next);
  }
  function resetScope(scope) {
    if (editingDevice.value !== "desktop" && scope !== "global") {
      const patch =
        preferences.value.config.devices[editingDevice.value][mode.value];
      if (patch.overrides) delete patch.overrides[scope];
      preferences.value.config = sanitizeTemplate(preferences.value.config);
      commit();
      return;
    }
    if (scope === "global") replaceMode(defaultTheme(mode.value));
    else {
      const next = cloneAppearance(theme.value);
      next.overrides[scope] = { colors: {}, metrics: {} };
      replaceMode(next);
    }
  }
  function inheritDesktop() {
    if (editingDevice.value !== "desktop") {
      preferences.value.config.devices[editingDevice.value] = {
        light: {},
        dark: {},
      };
      commit();
    }
  }
  function choosePreset(id) {
    replaceMode(presetTheme(id, mode.value));
  }
  function restore(snapshot) {
    preferences.value.config = cloneAppearance(snapshot.config);
    preferences.value.selectedId = snapshot.selectedId;
    preferences.value.base = cloneAppearance(snapshot.base);
    preferences.value.mode = snapshot.mode;
    commit();
  }
  async function request(path = "", method = "GET", body) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(
        `${apiBase}/user/appearance-templates${path}`,
        {
          method,
          credentials: "include",
          signal: controller.signal,
          headers: body ? { "Content-Type": "application/json" } : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Не удалось загрузить шаблоны тем.");
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error("Сервер не ответил. Повторите сохранение темы.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  function checkedItem(item) {
    const clean = sanitizeSavedTemplate(item);
    if (!clean) throw new Error("Не удалось загрузить шаблоны тем.");
    return clean;
  }
  async function refreshLibrary() {
    if (!userId || libraryBusy.value) return;
    if (refreshPromise) return refreshPromise;
    const ticket = generation;
    syncing.value = true;
    refreshPromise = (async () => {
      try {
        const data = await request();
        if (!Array.isArray(data.themes))
          throw new Error("Не удалось загрузить шаблоны тем.");
        const remote = data.themes.map(checkedItem);
        let active = data.activeThemeId || null;
        if (ticket !== generation) return;
        const fallback = preferences.value.config.devices.desktop;
        const legacy = [
          ...new Map(
            [
              ...(data.legacyThemes || []),
              ...preferences.value.legacySaved,
            ].map((t) => [t.id, t]),
          ).values(),
        ]
          .filter(
            (t) =>
              /^[\w-]{1,100}$/.test(t.id) &&
              typeof t.name === "string" &&
              t.name.trim(),
          )
          .sort(
            (a, b) =>
              Number(
                JSON.stringify(sanitizeTheme(b.theme, b.mode)) ===
                  JSON.stringify(fallback[b.mode]),
              ) -
              Number(
                JSON.stringify(sanitizeTheme(a.theme, a.mode)) ===
                  JSON.stringify(fallback[a.mode]),
              ),
          );
        preferences.value.saved = remote;
        // A complete desktop pair is created once. Original single-mode records remain intact on the server.
        for (const old of legacy) {
          const imported = await request("/import", "POST", {
            id: old.id,
            name: old.name,
            config: templateFromLegacy(old, fallback),
            activate: !active,
          });
          if (ticket !== generation) return;
          if (imported.theme) {
            const item = checkedItem(imported.theme),
              i = remote.findIndex((t) => t.id === item.id);
            if (i < 0) remote.push(item);
            else remote[i] = item;
          }
          active = imported.activeThemeId || null;
          preferences.value.legacySaved = preferences.value.legacySaved.filter(
            (t) => t.id !== old.id,
          );
          preferences.value.saved = remote;
          persist();
        }
        if (ticket !== generation) return;
        preferences.value.saved = remote;
        const selected = remote.find((t) => t.id === active) || null;
        if (
          !dirty.value ||
          (selected &&
            JSON.stringify(selected.config) ===
              JSON.stringify(preferences.value.config))
        )
          adopt(selected);
        syncError.value = "";
        persist();
      } catch (error) {
        if (ticket === generation)
          syncError.value = error.message || "Нет связи с библиотекой тем.";
      } finally {
        if (ticket === generation) {
          syncing.value = false;
          refreshPromise = null;
        }
      }
    })();
    return refreshPromise;
  }
  async function selectSaved(id) {
    if (libraryBusy.value) return false;
    const ticket = generation;
    await refreshPromise;
    if (ticket !== generation || libraryBusy.value) return false;
    const item = id ? savedThemes.value.find((t) => t.id === id) : null;
    if (id && !item) return false;
    libraryBusy.value = true;
    try {
      await request("/active", "PUT", { id: item?.id || null });
      if (ticket !== generation) return false;
      adopt(item);
      syncError.value = "";
      return true;
    } catch (error) {
      if (ticket === generation)
        syncError.value = error.message || "Не удалось выбрать тему.";
      return false;
    } finally {
      if (ticket === generation) libraryBusy.value = false;
    }
  }
  async function saveTheme(name, asNew = false) {
    const clean = name.trim().slice(0, 48);
    if (!clean) return { error: "Укажите название темы." };
    if (!userId) return { error: "Войдите в аккаунт для сохранения темы." };
    if (libraryBusy.value) return { error: "Дождитесь сохранения темы." };
    const ticket = generation,
      captured = cloneAppearance(preferences.value.config),
      device = editingDevice.value,
      base = cloneAppearance(preferences.value.base);
    const creating = asNew || !selectedId.value;
    const id = creating ? crypto.randomUUID() : selectedId.value;
    await refreshPromise;
    if (ticket !== generation) return {};
    if (libraryBusy.value) return { error: "Дождитесь сохранения темы." };
    if (
      savedThemes.value.some(
        (t) =>
          t.id !== id &&
          t.name.toLocaleLowerCase() === clean.toLocaleLowerCase(),
      )
    )
      return { error: "Тема с таким названием уже есть." };
    if (!creating && !base)
      return { error: "Выберите сохранённую тему заново." };
    libraryBusy.value = true;
    try {
      const data = creating
        ? await request("", "POST", { id, name: clean, config: captured })
        : await request(
            `/${encodeURIComponent(id)}/devices/${device}`,
            "PATCH",
            {
              revision: base.deviceRevisions[device],
              values: captured.devices[device],
              ...(clean !== base.name
                ? { name: clean, templateRevision: base.revision }
                : {}),
            },
          );
      if (ticket !== generation) return {};
      const saved = checkedItem(data.theme),
        current = preferences.value.config,
        next = cloneAppearance(saved.config);
      for (const key of Object.keys(DEVICE_LABELS)) {
        const comparison =
          creating || key === device
            ? captured.devices[key]
            : (base?.config || defaultTemplate()).devices[key];
        if (JSON.stringify(current.devices[key]) !== JSON.stringify(comparison))
          next.devices[key] = cloneAppearance(current.devices[key]);
      }
      preferences.value.saved = [
        ...savedThemes.value.filter((t) => t.id !== saved.id),
        saved,
      ];
      adopt(saved, next);
      syncError.value = "";
      return { id: saved.id };
    } catch (error) {
      return { error: error.message || "Не удалось сохранить шаблон темы." };
    } finally {
      if (ticket === generation) libraryBusy.value = false;
    }
  }
  async function deleteSaved(id) {
    if (!id || libraryBusy.value) return false;
    const ticket = generation;
    await refreshPromise;
    if (ticket !== generation || libraryBusy.value) return false;
    const item = savedThemes.value.find((t) => t.id === id);
    if (!item) return false;
    libraryBusy.value = true;
    try {
      const data = await request(`/${encodeURIComponent(id)}`, "DELETE", {
        revision: item.revision,
      });
      if (ticket !== generation) return false;
      preferences.value.saved = savedThemes.value.filter((t) => t.id !== id);
      if (selectedId.value === id)
        adopt(
          preferences.value.saved.find((t) => t.id === data.activeThemeId) ||
            null,
        );
      syncError.value = "";
      persist();
      return true;
    } catch (error) {
      if (ticket === generation)
        syncError.value = error.message || "Не удалось удалить тему.";
      return false;
    } finally {
      if (ticket === generation) libraryBusy.value = false;
    }
  }
  function connect() {
    const observer = new MutationObserver(() => {
      const value = document.documentElement.getAttribute("data-theme");
      if (["light", "dark"].includes(value) && value !== mode.value)
        setMode(value);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const sync = (event) => {
      if (userId && event.key === appearanceTemplateStorageKey(userId)) {
        preferences.value = parseTemplatePreferences(event.newValue);
        apply();
      }
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void refreshLibrary();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", sync);
    return () => {
      clearInterval(timer);
      observer.disconnect();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", sync);
    };
  }
  return {
    preferences,
    mode,
    theme,
    savedThemes,
    selectedId,
    editingDevice,
    deviceCustomized,
    dirty,
    storageError,
    syncError,
    syncing,
    libraryBusy,
    refreshLibrary,
    resolved,
    loadUser,
    setMode,
    setEditingDevice,
    setField,
    isFieldInherited,
    inheritField,
    inheritDesktop,
    resetScope,
    choosePreset,
    restore,
    saveTheme,
    selectSaved,
    deleteSaved,
    connect,
  };
});
