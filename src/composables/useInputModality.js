import { readonly, ref } from "vue";

// Capture the opening gesture too, before a dialog has mounted.
const keyboardNavigation = ref(false);
function pointer() {
  keyboardNavigation.value = false;
}
function keyboard(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // Typing after pointer autofocus is text entry, not keyboard navigation.
  const editing = event.target?.closest?.(
    'input,textarea,[contenteditable="true"]',
  );
  if (event.key === "Tab" || !editing) keyboardNavigation.value = true;
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", pointer, true);
  window.addEventListener("keydown", keyboard, true);
  import.meta.hot?.dispose(() => {
    window.removeEventListener("pointerdown", pointer, true);
    window.removeEventListener("keydown", keyboard, true);
  });
}
export function useInputModality() {
  return readonly(keyboardNavigation);
}
