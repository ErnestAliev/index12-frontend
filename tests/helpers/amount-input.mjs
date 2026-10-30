// Native text inputs move the caret to the end when their value is assigned.
export function amountInput(value, start = value.length, end = start, direction = 'none') {
  let currentValue = value;
  return {
    get value() { return currentValue; },
    set value(next) {
      currentValue = next;
      this.selectionStart = this.selectionEnd = next.length;
      this.selectionDirection = 'none';
    },
    selectionStart: start, selectionEnd: end, selectionDirection: direction,
    setSelectionRange(start, end, direction = 'none') {
      this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
    },
    edit(start, end, replacement, inputType = 'insertText') {
      currentValue = currentValue.slice(0, start) + replacement + currentValue.slice(end);
      this.setSelectionRange(start + replacement.length, start + replacement.length);
      return { target: this, inputType };
    },
  };
}
