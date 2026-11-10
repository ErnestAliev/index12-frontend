// MXL8 wire format: MOXCEL\0, three LE version words, UTF-8 BOM, 1C value tree.
// Format research: https://github.com/azubar/SpreadSheet/blob/main/docs/format-mxl.md
const invalid = () => {
  throw Error("Не удалось прочитать структуру табличного документа MXL");
};
function valueTree(text) {
  const root = [],
    stack = [root];
  let i = 0,
    nodes = 0;
  const add = (value) => {
    if (++nodes > 750000)
      throw Error("Табличный документ слишком большой для предпросмотра");
    stack.at(-1).push(value);
  };
  while (i < text.length) {
    const char = text[i];
    if (/[\s,]/.test(char)) {
      i++;
      continue;
    }
    if (char === "{") {
      const group = [];
      add(group);
      stack.push(group);
      if (stack.length > 96) invalid();
      i++;
      continue;
    }
    if (char === "}") {
      if (stack.length === 1) invalid();
      stack.pop();
      i++;
      continue;
    }
    if (char === '"') {
      let value = "",
        closed = false;
      i++;
      while (i < text.length) {
        if (text[i] !== '"') {
          const start = i;
          while (i < text.length && text[i] !== '"') i++;
          value += text.slice(start, i);
        } else if (text[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i++;
          closed = true;
          break;
        }
      }
      if (!closed) invalid();
      add(value);
      continue;
    }
    const start = i;
    while (i < text.length && !/[\s,{}]/.test(text[i])) i++;
    const token = text.slice(start, i),
      number = Number(token);
    add(/^-?\d+$/.test(token) && Number.isSafeInteger(number) ? number : token);
  }
  if (stack.length !== 1 || root.length !== 1 || !Array.isArray(root[0]))
    invalid();
  return root[0];
}
function cellText(cell) {
  if (
    !Array.isArray(cell) ||
    !Number.isSafeInteger(cell[0]) ||
    cell[0] < 0 ||
    cell.length < 2
  )
    invalid();
  const flags = cell[0];
  let index = 2,
    text = "";
  if (flags & 2) {
    const value = cell[index++];
    if (Array.isArray(value) && ["S", "N", "D", "B"].includes(value[0])) {
      text = String(value[1] ?? "");
      if (value[0] === "B") text = text === "1" ? "Да" : "Нет";
      if (value[0] === "D" && /^\d{14}$/.test(text))
        text =
          `${text.slice(6, 8)}.${text.slice(4, 6)}.${text.slice(0, 4)}` +
          (text.slice(8) === "000000"
            ? ""
            : ` ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12)}`);
    }
  }
  if (flags & 4) index++;
  if (flags & 16) {
    const local = cell[index];
    if (Array.isArray(local) && local[1] === 1) {
      const pairs = local.slice(2).filter(Array.isArray),
        pair = pairs.find((item) => item[0] === "ru") || pairs[0];
      if (pair) text = String(pair[1] ?? "");
    }
  }
  return text;
}
export function readMxl(bytes) {
  if (
    bytes.length < 16 ||
    new TextDecoder().decode(bytes.subarray(0, 6)) !== "MOXCEL"
  )
    throw Error("Файл не является табличным документом MXL");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint16(7, true) !== 8 || header.getUint16(9, true) !== 1)
    throw Error(
      "Этот вариант MXL не поддерживается. Сохраните документ в 1С 8 в формате MXL, XLSX или HTML.",
    );
  if (
    bytes[6] !== 0 ||
    bytes[13] !== 0xef ||
    bytes[14] !== 0xbb ||
    bytes[15] !== 0xbf
  )
    invalid();
  const root = valueTree(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(16)),
  );
  if (root[0] !== 8 || root[1] !== 1) invalid();
  let index = 15,
    previous = -1,
    size = 0,
    limited = false;
  const cells = [],
    merges = [],
    int = () => {
      const n = root[index++];
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000000) invalid();
      return n;
    };
  const count = int();
  for (let row = 0; row < count; row++) {
    const r = int();
    int();
    const cols = int();
    if (r <= previous || index + cols * 2 > root.length) invalid();
    previous = r;
    const seen = new Set();
    for (let col = 0; col < cols; col++) {
      const c = int(),
        value = cellText(root[index++]);
      if (seen.has(c)) invalid();
      seen.add(c);
      size += value.length;
      if (r >= 20000 || c >= 200 || size > 1000000) {
        limited = true;
        continue;
      }
      cells.push({ row: r, col: c, text: value });
    }
  }
  for (const group of root.slice(index)) {
    if (
      !Array.isArray(group) ||
      !Number.isInteger(group[0]) ||
      group[0] < 1 ||
      group.length !== group[0] + 1
    )
      continue;
    if (
      !group
        .slice(1)
        .every(
          (item) =>
            Array.isArray(item) &&
            item.length === 5 &&
            item.every(Number.isSafeInteger) &&
            item[4] === 0 &&
            item[0] >= 0 &&
            item[1] >= 0 &&
            item[2] >= item[0] &&
            item[3] >= item[1],
        )
    )
      continue;
    for (const [left, top, right, bottom] of group.slice(1)) {
      if (right >= 200 || bottom >= 20000) {
        limited = true;
        continue;
      }
      if (right !== left || bottom !== top)
        merges.push({ s: { r: top, c: left }, e: { r: bottom, c: right } });
    }
  }
  return { cells, merges, limited };
}
