// Editing must preserve tiyn even when compact widgets display whole tenge.
export function formatAmountInput(value) {
  const source = typeof value === 'number'
    ? Math.abs(value).toFixed(2).replace(/\.?0+$/, '')
    : String(value ?? '');
  const cleaned = source.replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const [whole, ...fractions] = cleaned.split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fractions.length ? `${grouped}.${fractions.join('').slice(0, 2)}` : grouped;
}

// Format the DOM value before Vue patches v-model, keeping the selection at
// the same numeric position when grouping spaces are inserted or removed.
export function formatAmountInputEvent(event, formatter = formatAmountInput) {
  const input = event.target;
  const source = input.value;
  if (event.isComposing || input.composing) return source;
  const formatted = formatter(source);
  if (formatted === source) return formatted;

  const { selectionStart, selectionEnd, selectionDirection } = input;
  const mapPosition = position => {
    const prefixLength = formatter(source.slice(0, position)).replace(/\s/g, '').length;
    let index = 0;
    let count = 0;
    while (index < formatted.length && count < prefixLength) {
      if (!/\s/.test(formatted[index])) count++;
      index++;
    }
    // Preserve the side of a grouping space. Forward Delete must advance past
    // a restored separator so pressing it again can reach the next digit.
    if ((position > 0 && /\s/.test(source[position - 1])) || event.inputType === 'deleteContentForward') {
      while (index < formatted.length && /\s/.test(formatted[index])) index++;
    }
    return index;
  };

  input.value = formatted;
  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
    // If the last whole digit was deleted, the formatter supplies a zero.
    // Select that placeholder so the next digit replaces it instead of joining it.
    const replacedWholePart = selectionStart === 0 && selectionEnd === 0 && /^[.,]/.test(source) && formatted.startsWith('0.');
    input.setSelectionRange(
      replacedWholePart ? 0 : mapPosition(selectionStart),
      replacedWholePart ? 1 : mapPosition(selectionEnd),
      selectionDirection || 'none',
    );
  }
  return formatted;
}
