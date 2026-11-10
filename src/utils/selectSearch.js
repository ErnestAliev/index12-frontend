const lookalikes = {a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
export const searchText = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/\bip\b/g,'ип').replace(/[abcehkmoptxy]/g,char=>lookalikes[char]).replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function searchOptions(options, query) {
  const words = searchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  const result = []; let header, hasHeader = false;
  for (const option of options) {
    if (option.isHeader) { header = option; hasHeader = false; continue; }
    if (option.isActionRow) { result.push(option); continue; }
    const text = searchText([option.label, option.subLabel, option.searchText].filter(Boolean).join(' '));
    if (!words.every(word => text.includes(word))) continue;
    if (header && !hasHeader) { result.push(header); hasHeader = true; }
    result.push(option);
  }
  return result;
}
