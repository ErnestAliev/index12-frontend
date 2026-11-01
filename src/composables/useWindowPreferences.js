import { ref, watch, onBeforeUnmount } from "vue";
import {
  registerPreference,
  recordPreference,
} from "@/utils/preferenceHistory.js";
export function useWindowPreferences(key, defaults) {
  const storageKey = `index12-${key}`;
  const clean = (value) =>
    Object.fromEntries(
      Object.entries(defaults).map(([k, v]) => [
        k,
        typeof value?.[k] === typeof v &&
        (typeof v !== "number" ||
          (Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 10000))
          ? value[k]
          : v,
      ]),
    );
  let initial;
  try {
    initial = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    /* Use window defaults. */
  }
  const state = ref(clean(initial));
  localStorage.setItem(storageKey, JSON.stringify(state.value));
  const stop = registerPreference(
    key,
    () => state.value,
    (value) => {
      state.value = clean(value);
    },
  );
  watch(
    state,
    (value) => {
      const old = JSON.parse(localStorage.getItem(storageKey) || "null");
      localStorage.setItem(storageKey, JSON.stringify(value));
      recordPreference(key, old, value);
    },
    { deep: true, flush: "sync" },
  );
  onBeforeUnmount(stop);
  return state;
}
