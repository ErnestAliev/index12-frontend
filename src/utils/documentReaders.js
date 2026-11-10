import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
export const TEXT_LIMIT = 1000000;
const fail = (message) => {
  throw Error(message);
};
// Check the ZIP directory before any parser allocates inflated Office contents.
export function archiveBudget(bytes) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (data.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) fail("Повреждён архив документа");
  const count = data.getUint16(end + 10, true);
  let offset = data.getUint32(end + 16, true),
    total = 0;
  if (count > 6000 || offset === 0xffffffff)
    fail("Слишком большой архив для предпросмотра");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > bytes.length ||
      data.getUint32(offset, true) !== 0x02014b50
    )
      fail("Повреждён архив документа");
    const size = data.getUint32(offset + 24, true);
    total += size;
    if (size > 32 * 1024 * 1024 || total > 64 * 1024 * 1024)
      fail("Распакованный документ слишком большой для предпросмотра");
    offset +=
      46 +
      data.getUint16(offset + 28, true) +
      data.getUint16(offset + 30, true) +
      data.getUint16(offset + 32, true);
  }
}
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  // Some Windows TXT exports omit their UTF-16 BOM.
  if (bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0)
    return new TextDecoder("utf-16le").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}
function xml(source) {
  if (source.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source))
    fail("Недопустимая XML-структура документа");
  return new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    htmlEntities: false,
    ignoreDeclaration: true,
  }).parse(source);
}
const tag = (node) =>
  Object.keys(node).find((key) => key !== ":@" && key !== "#text");
const local = (name) => name?.split(":").at(-1);
function descendants(nodes, name, depth = 0) {
  if (depth > 128) fail("Слишком глубокая структура документа");
  const found = [];
  for (const node of nodes || []) {
    const key = tag(node);
    if (Array.isArray(name) ? name.includes(local(key)) : local(key) === name)
      found.push(node);
    else if (Array.isArray(node[key]))
      found.push(...descendants(node[key], name, depth + 1));
  }
  return found;
}
function contents(nodes, depth = 0) {
  if (depth > 128) fail("Слишком глубокая структура документа");
  let result = "";
  for (const node of nodes || []) {
    if (Object.hasOwn(node, "#text")) result += String(node["#text"]);
    else {
      const key = tag(node),
        name = local(key);
      if (
        [
          "del",
          "moveFrom",
          "instrText",
          "script",
          "style",
          "iframe",
          "object",
        ].includes(name)
      )
        continue;
      if (name === "tab") result += "\t";
      else if (["br", "cr", "line-break"].includes(name)) result += "\n";
      else if (name === "s")
        result += " ".repeat(
          Math.min(100, Number(node[":@"]?.["@_text:c"] || 1)),
        );
      else if (Array.isArray(node[key]))
        result += contents(node[key], depth + 1);
    }
  }
  return result;
}
function wordBlocks(
  nodes,
  openDocument = false,
  depth = 0,
  state = { size: 0, limited: false },
) {
  if (depth > 128) fail("Слишком глубокая структура документа");
  const blocks = [];
  for (const node of nodes || []) {
    if (state.size >= TEXT_LIMIT || blocks.length > 20000) {
      state.limited = true;
      break;
    }
    const key = tag(node),
      name = local(key),
      children = node[key];
    if (
      [
        "del",
        "moveFrom",
        "instrText",
        "script",
        "style",
        "iframe",
        "object",
        "head",
      ].includes(name)
    )
      continue;
    if (name === "p" || name === "h" || /^h[1-6]$/.test(name || "")) {
      const text = contents(children).slice(0, TEXT_LIMIT - state.size);
      state.size += text.length;
      const style =
        descendants(children, "pStyle")[0]?.[":@"]?.["@_w:val"] || "";
      blocks.push({
        kind: "paragraph",
        text,
        heading:
          name === "h" || /^h[1-6]$/.test(name)
            ? Math.min(
                6,
                Number(
                  node[":@"]?.["@_text:outline-level"] || name?.slice(1) || 1,
                ),
              )
            : /^Heading[1-6]$/i.test(style)
              ? Number(style.at(-1))
              : 0,
      });
    } else if (name === "tbl" || name === "table") {
      const allRows = descendants(children, openDocument ? "table-row" : "tr");
      if (allRows.length > 2000) state.limited = true;
      const rows = allRows.slice(0, 2000).map((row) =>
        descendants(
          row[tag(row)],
          openDocument ? "table-cell" : name === "tbl" ? "tc" : ["td", "th"],
        )
          .slice(0, 200)
          .map((cell) => {
            const paragraphs = descendants(cell[tag(cell)], "p");
            const text = (
              paragraphs.length
                ? paragraphs.map((p) => contents(p[tag(p)])).join("\n")
                : contents(cell[tag(cell)])
            ).slice(0, Math.max(0, TEXT_LIMIT - state.size));
            state.size += text.length;
            return text;
          }),
      );
      blocks.push({ kind: "table", rows });
    } else if (Array.isArray(children))
      blocks.push(...wordBlocks(children, openDocument, depth + 1, state));
  }
  return blocks;
}
export function readXmlDocument(bytes, format) {
  archiveBudget(bytes);
  const wanted =
    format === "odt"
      ? (name) => name === "content.xml"
      : format === "pptx"
        ? (name) =>
            /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
            [
              "ppt/presentation.xml",
              "ppt/_rels/presentation.xml.rels",
            ].includes(name)
        : (name) => name === "word/document.xml";
  const entries = unzipSync(bytes, { filter: (file) => wanted(file.name) }),
    state = { size: 0, limited: false };
  let blocks = [];
  if (format === "pptx") {
    let names = Object.keys(entries)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]),
      );
    if (
      entries["ppt/presentation.xml"] &&
      entries["ppt/_rels/presentation.xml.rels"]
    ) {
      const relations = descendants(
        xml(decodeText(entries["ppt/_rels/presentation.xml.rels"])),
        "Relationship",
      );
      const targets = new Map(
        relations
          .filter((node) => node[":@"]?.["@_TargetMode"] !== "External")
          .map((node) => [node[":@"]?.["@_Id"], node[":@"]?.["@_Target"]]),
      );
      const ordered = descendants(
        xml(decodeText(entries["ppt/presentation.xml"])),
        "sldId",
      )
        .map((node) => targets.get(node[":@"]?.["@_r:id"]))
        .filter((target) => /^slides\/slide\d+\.xml$/.test(target || ""))
        .map((target) => "ppt/" + target)
        .filter((name) => entries[name]);
      if (ordered.length) names = ordered;
    }
    for (const [index, name] of names.entries()) {
      blocks.push({
        kind: "paragraph",
        text: "Слайд " + (index + 1),
        heading: 2,
      });
      blocks.push(
        ...wordBlocks(xml(decodeText(entries[name])), false, 0, state),
      );
      if (state.size >= TEXT_LIMIT) break;
    }
  } else {
    const data =
      entries[format === "odt" ? "content.xml" : "word/document.xml"];
    if (!data) fail("Содержимое документа не найдено");
    blocks = wordBlocks(xml(decodeText(data)), format === "odt", 0, state);
  }
  return {
    kind: "document",
    blocks,
    limited: state.limited || state.size >= TEXT_LIMIT,
  };
}
export function readHtmlDocument(text) {
  const state = { size: 0, limited: false },
    nodes = xml(text),
    blocks = wordBlocks(nodes, false, 0, state);
  return {
    kind: "document",
    blocks: blocks.length
      ? blocks
      : [{ kind: "paragraph", text: contents(nodes).slice(0, TEXT_LIMIT) }],
    limited: state.limited,
  };
}
export function readRtf(source) {
  const out = [],
    stack = [];
  let state = { skip: false, uc: 1 },
    fallback = 0,
    encoding = "windows-1252",
    length = 0,
    limited = false;
  const write = (value, unicode = false) => {
    if (state.skip) return;
    if (fallback && !unicode) {
      fallback--;
      return;
    }
    if (length >= TEXT_LIMIT) {
      limited = true;
      return;
    }
    out.push(value);
    length += value.length;
  };
  const ignored = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "header",
    "footer",
    "headerl",
    "headerr",
    "footerl",
    "footerr",
    "listtable",
    "listoverridetable",
    "xmlnstbl",
    "rsidtbl",
    "fldinst",
    "datastore",
    "themedata",
  ]);
  for (let i = 0; i < source.length && !limited; i++) {
    const c = source[i];
    if (c === "{") {
      stack.push({ ...state });
      if (stack.length > 256) fail("Слишком глубокая структура RTF");
      continue;
    }
    if (c === "}") {
      state = stack.pop() || { skip: false, uc: 1 };
      continue;
    }
    if (c !== "\\") {
      if (c !== "\r" && c !== "\n") write(c);
      continue;
    }
    const next = source[++i];
    if (["\\", "{", "}"].includes(next)) {
      write(next);
      continue;
    }
    if (next === "*") {
      state.skip = true;
      continue;
    }
    if (next === "'") {
      const hex = source.slice(i + 1, i + 3);
      if (/^[\da-f]{2}$/i.test(hex)) {
        write(
          new TextDecoder(encoding).decode(new Uint8Array([parseInt(hex, 16)])),
        );
        i += 2;
      }
      continue;
    }
    if (!/[a-z]/i.test(next || "")) {
      if (next === "~") write("\u00a0");
      if (next === "_") write("\u2011");
      continue;
    }
    const token = /^([a-z]+)(-?\d+)? ?/i.exec(source.slice(i));
    if (!token) continue;
    i += token[0].length - 1;
    const word = token[1],
      n = Number(token[2] || 0);
    if (ignored.has(word)) state.skip = true;
    else if (word === "ansicpg") {
      try {
        new TextDecoder("windows-" + n);
        encoding = "windows-" + n;
      } catch {}
    } else if (word === "uc") state.uc = Math.max(0, Math.min(16, n));
    else if (word === "u") {
      write(String.fromCharCode(n < 0 ? n + 65536 : n), true);
      fallback = state.uc;
    } else if (["par", "line", "row", "page"].includes(word)) write("\n");
    else if (["tab", "cell"].includes(word)) write("\t");
    else if (word === "bin")
      i += Math.max(0, Math.min(n, source.length - i - 1));
    else if (word === "emdash") write("—");
    else if (word === "endash") write("–");
    else if (word === "bullet") write("•");
  }
  return { kind: "text", text: out.join(""), limited };
}
export function readLegacyDoc(bytes, CFB) {
  const ole = CFB.read(bytes, { type: "array" }),
    rawWord = CFB.find(ole, "WordDocument")?.content,
    word = rawWord ? Uint8Array.from(rawWord) : null;
  if (!word || word.length < 154)
    fail("Содержимое DOC не найдено или файл зашифрован");
  const data = new DataView(word.buffer, word.byteOffset, word.byteLength),
    flags = data.getUint16(10, true);
  if (data.getUint16(0, true) !== 0xa5ec) fail("Неподдерживаемая версия DOC");
  if (flags & 0x0100) fail("Документ защищён паролем");
  const rawTable = CFB.find(ole, flags & 0x0200 ? "1Table" : "0Table")?.content,
    table = rawTable ? Uint8Array.from(rawTable) : null;
  if (!table || word.length < 426) fail("Таблица текста DOC не найдена");
  const info = new DataView(table.buffer, table.byteOffset, table.byteLength),
    start = data.getUint32(418, true),
    size = data.getUint32(422, true),
    chars = Math.min(data.getUint32(76, true), TEXT_LIMIT);
  if (start + size > table.length || size < 5)
    fail("Повреждена таблица текста DOC");
  let at = start;
  while (at < start + size && table[at] === 1) {
    if (at + 3 > table.length) fail("Повреждён DOC");
    at += 3 + info.getUint16(at + 1, true);
  }
  if (table[at] !== 2 || at + 5 > table.length)
    fail("Неподдерживаемая таблица текста DOC");
  const length = info.getUint32(at + 1, true);
  at += 5;
  const pieces = (length - 4) / 12;
  if (
    !Number.isInteger(pieces) ||
    pieces < 0 ||
    pieces > 100000 ||
    at + length > table.length
  )
    fail("Повреждена таблица текста DOC");
  const output = [];
  for (let i = 0; i < pieces; i++) {
    const cp = info.getUint32(at + i * 4, true),
      end = info.getUint32(at + (i + 1) * 4, true);
    if (cp >= chars) break;
    if (end < cp) fail("Повреждён DOC");
    const fc = info.getUint32(at + (pieces + 1) * 4 + i * 8 + 2, true),
      compressed = !!(fc & 0x40000000),
      offset = (fc & 0x3fffffff) / (compressed ? 2 : 1),
      count = Math.min(end, chars) - cp,
      stop = offset + count * (compressed ? 1 : 2);
    if (!Number.isInteger(offset) || stop > word.length)
      fail("Повреждён текст DOC");
    output.push(
      new TextDecoder(compressed ? "windows-1252" : "utf-16le").decode(
        word.subarray(offset, stop),
      ),
    );
  }
  const fields = [];
  let text = "";
  for (const char of output.join("")) {
    if (char === "\x13") {
      fields.push(false);
      continue;
    }
    if (char === "\x14") {
      if (fields.length) fields[fields.length - 1] = true;
      continue;
    }
    if (char === "\x15") {
      fields.pop();
      continue;
    }
    if (fields.every(Boolean)) text += char;
  }
  return {
    kind: "text",
    text: text
      .replace(/\r|\v|\f/g, "\n")
      .replace(/\x07/g, "\t")
      .replace(/[\x00-\x06\x08\x0e-\x1f]/g, ""),
    limited: data.getUint32(76, true) > TEXT_LIMIT,
  };
}
