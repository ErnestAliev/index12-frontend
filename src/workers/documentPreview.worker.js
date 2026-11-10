import * as XLSX from "xlsx";
import { readMxl } from "@/utils/mxlReader";
import { isSpreadsheet } from "@/utils/documentFormats";
import {
  archiveBudget,
  decodeText,
  readXmlDocument,
  readLegacyDoc,
  readRtf,
  readHtmlDocument,
  TEXT_LIMIT,
} from "@/utils/documentReaders";
const ROW_LIMIT = 20000,
  COL_LIMIT = 200,
  PAGE = 100;
let workbook,
  sheets = [];
function metadata(sheet, name) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1"),
    full = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
  const empty = !sheet["!ref"];
  return {
    name,
    startRow: range.s.r,
    startCol: range.s.c,
    rows: empty ? 0 : Math.min(ROW_LIMIT, range.e.r - range.s.r + 1),
    cols: empty ? 0 : Math.min(COL_LIMIT, range.e.c - range.s.c + 1),
    limited: full.e.r > range.e.r || range.e.c - range.s.c + 1 > COL_LIMIT,
  };
}
function cell(sheet, row, col) {
  const item = sheet["!data"]?.[row]?.[col];
  return item
    ? String(
        item.w ??
          (item.v !== undefined
            ? XLSX.utils.format_cell(item)
            : item.f
              ? "=" + item.f
              : ""),
      )
    : "";
}
function page(index, offset) {
  const meta = sheets[index];
  if (!meta) throw Error("Лист не найден");
  const sheet = workbook.Sheets[meta.name];
  const first = Math.max(
      0,
      Math.min(
        Math.floor(offset / PAGE) * PAGE,
        Math.max(0, Math.floor((meta.rows - 1) / PAGE) * PAGE),
      ),
    ),
    start = meta.startRow + first,
    end = Math.min(meta.startRow + meta.rows, start + PAGE),
    endCol = meta.startCol + meta.cols - 1;
  const merged = new Map(),
    covered = new Set();
  for (const merge of (sheet["!merges"] || []).slice(0, 10000)) {
    if (
      merge.e.r < start ||
      merge.s.r >= end ||
      merge.e.c < meta.startCol ||
      merge.s.c > endCol
    )
      continue;
    const top = Math.max(start, merge.s.r),
      bottom = Math.min(end - 1, merge.e.r),
      left = Math.max(meta.startCol, merge.s.c),
      right = Math.min(endCol, merge.e.c);
    merged.set(top + ":" + left, {
      rowSpan: bottom - top + 1,
      colSpan: right - left + 1,
      text: cell(sheet, merge.s.r, merge.s.c),
    });
    for (let r = top; r <= bottom; r++)
      for (let c = left; c <= right; c++)
        if (r !== top || c !== left) covered.add(r + ":" + c);
  }
  const rows = [];
  for (let r = start; r < end; r++) {
    const cells = [];
    for (let c = meta.startCol; c <= endCol; c++) {
      const key = r + ":" + c;
      if (covered.has(key)) continue;
      cells.push({
        column: c,
        text: cell(sheet, r, c),
        rowSpan: 1,
        colSpan: 1,
        ...merged.get(key),
      });
    }
    rows.push({ number: r + 1, cells });
  }
  return {
    index,
    offset: first,
    total: meta.rows,
    rows,
    columns: Array.from({ length: meta.cols }, (_, i) =>
      XLSX.utils.encode_col(meta.startCol + i),
    ),
  };
}
function parse(bytes, format) {
  workbook = null;
  sheets = [];
  if (bytes.length > 12 * 1024 * 1024)
    throw Error("Файл слишком большой для предпросмотра");
  if (format === "gsheet")
    throw Error(
      "Этот файл — ссылка Google Sheets. Для просмотра нужна выгрузка XLSX, ODS или CSV.",
    );
  if (format === "mxl") {
    const parsed = readMxl(bytes),
      data = [],
      sheet = { "!data": data, "!merges": parsed.merges };
    let lastRow = -1,
      lastCol = -1;
    for (const cell of parsed.cells) {
      (data[cell.row] ||= [])[cell.col] = { t: "s", v: cell.text };
      lastRow = Math.max(lastRow, cell.row);
      lastCol = Math.max(lastCol, cell.col);
    }
    for (const merge of parsed.merges) {
      lastRow = Math.max(lastRow, merge.e.r);
      lastCol = Math.max(lastCol, merge.e.c);
    }
    if (lastRow >= 0)
      sheet["!ref"] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: lastRow, c: lastCol },
      });
    const name = "Табличный документ";
    workbook = { SheetNames: [name], Sheets: { [name]: sheet } };
    sheets = [metadata(sheet, name)];
    return {
      kind: "workbook",
      sheets,
      page: page(0, 0),
      limited: parsed.limited,
    };
  }
  if (["html", "htm", "xhtml"].includes(format)) {
    const html = decodeText(bytes);
    return {
      kind: "html",
      html: html.slice(0, TEXT_LIMIT),
      limited: html.length > TEXT_LIMIT,
    };
  }
  if (isSpreadsheet(format)) {
    archiveBudget(bytes);
    const textFormat = ["csv", "tsv"].includes(format);
    workbook = XLSX.read(textFormat ? decodeText(bytes) : bytes, {
      type: textFormat ? "string" : "array",
      dense: true,
      cellText: true,
      cellHTML: false,
      cellFormula: true,
      cellNF: true,
      bookVBA: false,
      bookDeps: false,
      sheetRows: ROW_LIMIT,
      dateNF: 'dd"."mm"."yyyy',
      ...(textFormat ? { raw: true } : {}),
      ...(format === "tsv" ? { FS: "\t" } : {}),
    });
    if (workbook.SheetNames.length > 128)
      throw Error("Слишком много листов для предпросмотра");
    sheets = workbook.SheetNames.map((name) =>
      metadata(workbook.Sheets[name], name),
    );
    return { kind: "workbook", sheets, page: page(0, 0) };
  }
  if (
    ["docx", "odt", "pptx"].includes(format) &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b
  )
    return readXmlDocument(bytes, format);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf)
    return readLegacyDoc(bytes, XLSX.CFB);
  const text = decodeText(bytes);
  if (/^\s*\{\\rtf/.test(text)) return readRtf(text);
  if (format === "doc" && /<(?:html|body|p|table)\b/i.test(text))
    return readHtmlDocument(text);
  if (["doc", "docx", "odt", "pptx"].includes(format))
    throw Error("Файл повреждён, зашифрован или имеет другой формат");
  return {
    kind: "text",
    text: text.slice(0, TEXT_LIMIT),
    limited: text.length > TEXT_LIMIT,
  };
}
self.onmessage = (event) => {
  const { id, action, bytes, format, index = 0, offset = 0 } = event.data;
  try {
    const result =
      action === "parse"
        ? parse(new Uint8Array(bytes), format)
        : page(index, offset);
    self.postMessage({ id, result });
  } catch (error) {
    const message = /password|encrypted|encryption/i.test(error.message)
      ? "Файл защищён паролем"
      : error.message || "Не удалось прочитать документ";
    self.postMessage({ id, error: message });
  }
};
