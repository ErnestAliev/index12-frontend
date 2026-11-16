import { shallowRef, onMounted, onBeforeUnmount } from "vue";
const selection = shallowRef(null);
let users = 0;
function readSelection() {
  const value = window.getSelection();
  if (!value || value.isCollapsed || !value.rangeCount) {
    selection.value = null;
    return;
  }
  const range = value.getRangeAt(0);
  const element =
    range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
  const root = element?.closest("[data-fragment-source]");
  const text = value.toString().trim();
  if (!root || !root.contains(range.endContainer) || !text) {
    selection.value = null;
    return;
  }
  const bounds = range.getBoundingClientRect();
  selection.value = {
    root,
    text,
    rect: { left: bounds.left, top: bounds.top, bottom: bounds.bottom },
  };
}
export function clearMessageSelection() {
  window.getSelection()?.removeAllRanges();
  selection.value = null;
}
export function selectMessageText(root) {
  if (!root) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  const value = window.getSelection();
  value.removeAllRanges();
  value.addRange(range);
  readSelection();
}
export function useMessageSelection() {
  onMounted(() => {
    if (++users === 1)
      document.addEventListener("selectionchange", readSelection);
  });
  onBeforeUnmount(() => {
    if (--users === 0) {
      document.removeEventListener("selectionchange", readSelection);
      selection.value = null;
    }
  });
  return { selection, readSelection };
}
