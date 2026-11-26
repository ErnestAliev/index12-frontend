const alternatives = /\s(?:или|либо)\s/iu;
const separators = /(\s*[,;]\s*|\s+(?:или|либо)\s+)/iu;
const betweenOptions = /^[\s,;]*(?:(?:или|либо)[\s,;]*)?$/iu;

export function decorateReplyChoices(container, disabled = false) {
  function button(label) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'codex-reply-choice';
    element.textContent = label; element.dataset.reply = label;
    element.disabled = disabled;
    return element;
  }
  for (const link of container.querySelectorAll('a[href="#reply"]')) {
    const label = link.textContent.trim();
    if (label && label.length <= 1000) link.replaceWith(button(label));
  }
  // Older answers used bold alternatives rather than explicit choice links.
  for (const paragraph of container.querySelectorAll('p')) {
    if (!paragraph.textContent.includes('?') || !alternatives.test(paragraph.textContent) || paragraph.querySelector('.codex-reply-choice') || paragraph.closest('blockquote, pre')) continue;
    for (const strong of paragraph.querySelectorAll('strong')) {
      if (strong.closest('a, button') || !alternatives.test(strong.textContent)) continue;
      const parts = strong.textContent.split(separators), options = parts.filter((_, index) => index % 2 === 0);
      if (options.length < 2 || options.length > 8 || options.some(text => !text.trim() || text.length > 300 || /[?\n]/.test(text))) continue;
      const fragment = document.createDocumentFragment();
      parts.forEach((part, index) => fragment.append(index % 2 ? document.createTextNode(part) : button(part.trim())));
      strong.replaceWith(fragment);
    }
    const strongs = [...paragraph.querySelectorAll('strong')].filter(strong => !strong.closest('a, button') && strong.textContent.trim() && strong.textContent.length <= 300 && !/[?\n]/.test(strong.textContent));
    let group = [];
    function finish() { if (group.length >= 2 && group.length <= 8) for (const strong of group) strong.replaceWith(button(strong.textContent.trim())); group = []; }
    for (const strong of strongs) {
      if (group.length) {
        const range = document.createRange(); range.setStartAfter(group.at(-1)); range.setEndBefore(strong);
        if (!betweenOptions.test(range.toString())) finish();
      }
      group.push(strong);
    }
    finish();
  }
}
