export function canSeeChatMessage(element, container) {
  if (
    !element ||
    !container ||
    !element.isConnected ||
    document.visibilityState !== "visible" ||
    !document.hasFocus()
  )
    return false;
  for (
    let node = element;
    node && node.nodeType === 1;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility !== "visible" ||
      Number(style.opacity) === 0
    )
      return false;
  }
  const rect = element.getBoundingClientRect(),
    box = container.getBoundingClientRect(),
    viewport = window.visualViewport;
  const left = Math.max(rect.left, box.left, viewport?.offsetLeft || 0),
    right = Math.min(
      rect.right,
      box.right,
      (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth),
    );
  const top = Math.max(rect.top, box.top, viewport?.offsetTop || 0),
    bottom = Math.min(
      rect.bottom,
      box.bottom,
      (viewport?.offsetTop || 0) + (viewport?.height || innerHeight),
    );
  if (
    right - left < Math.min(24, rect.width) ||
    bottom - top < Math.min(40, rect.height / 2) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return false;
  const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  return !!hit && element.contains(hit);
}
