export function nationalPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (
    /^\s*\+7/.test(String(value)) ||
    (digits.length > 10 && /^[78]/.test(digits))
  )
    digits = digits.slice(1);
  return digits.slice(0, 10);
}
export function formatPhone(value) {
  const digits = nationalPhone(value);
  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ]
    .filter(Boolean)
    .join(" ");
}
export function phoneInput(event) {
  const field = event.target;
  const raw = field.value,
    end = field.selectionStart ?? raw.length;
  let count = raw.slice(0, end).replace(/\D/g, "").length;
  if (
    raw.replace(/\D/g, "").length > 10 &&
    /^[78]/.test(raw.replace(/\D/g, ""))
  )
    count--;
  const formatted = formatPhone(raw);
  field.value = formatted;
  let caret = 0,
    seen = 0;
  while (caret < formatted.length && seen < count)
    if (/\d/.test(formatted[caret++])) seen++;
  field.setSelectionRange(caret, caret);
  return formatted;
}

export function phoneBeforeInput(event) {
  const field = event.target,
    start = field.selectionStart;
  if (
    event.inputType === "deleteContentBackward" &&
    start === field.selectionEnd &&
    field.value[start - 1] === " "
  ) {
    event.preventDefault();
    field.setRangeText("", Math.max(0, start - 2), start, "end");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
