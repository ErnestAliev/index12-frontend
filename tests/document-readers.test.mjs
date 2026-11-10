import { test } from "node:test";
import assert from "node:assert/strict";
import { CFB } from "xlsx";
import { documentSamples, mxlSample } from "./fixtures/documentSamples.mjs";
import { readMxl } from "../src/utils/mxlReader.js";
import { documentFormat } from "../src/utils/documentFormats.js";
import {
  readXmlDocument,
  readLegacyDoc,
  readRtf,
  readHtmlDocument,
  decodeText,
  archiveBudget,
} from "../src/utils/documentReaders.js";
const files = documentSamples();
test("HTML MIME and native MXL files select rendered previews rather than plain text", () => {
  assert.equal(
    documentFormat({
      name: "page",
      mimeType: "text/html;charset=windows-1251",
    }),
    "html",
  );
  assert.equal(
    documentFormat({ name: "page", mimeType: "application/xhtml+xml" }),
    "html",
  );
  assert.equal(
    documentFormat({ name: "sheet", mimeType: "application/vnd.1c.mxl" }),
    "mxl",
  );
});
test("MXL8 preserves cell coordinates, decimal strings, leading zeros, doubled quotes, localized text and merged cells", () => {
  const result = readMxl(files.get("Таблица.mxl"));
  assert.deepEqual(
    result.cells.map((cell) => cell.text),
    ['Счёт "Тест"', "Разработка", "1234.50", "00123", "Строка MXL 101"],
  );
  assert.equal(result.cells.at(-1).row, 101);
  assert.deepEqual(result.merges, [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]);
  assert.equal(result.limited, false);
});
test("MXL limits sparse coordinates and rejects unsupported, truncated, duplicate or deeply nested structures", () => {
  assert.equal(
    readMxl(
      mxlSample([
        { index: 20000, cells: [[0, [2, 0, ["S", "not allocated"]]]] },
      ]),
    ).limited,
    true,
  );
  assert.throws(() => readMxl(files.get("Старый.mxl")), /не поддерживается/);
  assert.throws(
    () => readMxl(files.get("Таблица.mxl").slice(0, -1)),
    /структуру/,
  );
  assert.throws(
    () =>
      readMxl(
        mxlSample([
          {
            index: 0,
            cells: [
              [0, [2, 0, ["S", "one"]]],
              [0, [2, 0, ["S", "duplicate"]]],
            ],
          },
        ]),
      ),
    /структуру/,
  );
  const header = files.get("Таблица.mxl").slice(0, 16),
    body = new TextEncoder().encode("{".repeat(100) + "}".repeat(100)),
    deep = new Uint8Array(header.length + body.length);
  deep.set(header);
  deep.set(body, 16);
  assert.throws(() => readMxl(deep), /структуру/);
  assert.equal(
    readMxl(
      mxlSample([
        { index: 0, cells: [[0, [2, 0, ["N", "123456789012345678901.50"]]]] },
      ]),
    ).cells[0].text,
    "123456789012345678901.50",
  );
});
test("recognizes exported spreadsheets, Word and text formats without a MIME supplied", () => {
  for (const name of files.keys()) assert.ok(documentFormat({ name }), name);
  assert.equal(
    documentFormat({ name: "Фото.jpg", mimeType: "image/jpeg" }),
    null,
  );
});
test("DOCX reads heading, paragraphs and table cells while omitting deletion and field instructions", () => {
  const doc = readXmlDocument(files.get("Документ.docx"), "docx");
  assert.equal(doc.blocks[0].heading, 1);
  assert.equal(doc.blocks[1].text, "Привет & мир");
  assert.deepEqual(doc.blocks[2].rows, [
    ["Позиция", "Сумма"],
    ["Работа", "1234,50"],
  ]);
  assert.ok(!JSON.stringify(doc).includes("secret"));
});
test("ODT preserves text/tables and PPTX follows the presentation slide order", () => {
  const odt = readXmlDocument(files.get("Документ.odt"), "odt");
  assert.equal(odt.blocks[0].heading, 1);
  assert.equal(odt.blocks[2].rows[0][0], "Ячейка ODT");
  const ppt = readXmlDocument(files.get("Презентация.pptx"), "pptx");
  assert.equal(ppt.blocks[1].text, "Первый слайд");
  assert.equal(ppt.blocks[3].text, "Второй слайд");
});
test("real Word-generated OLE DOC exposes Cyrillic body text and rejects encrypted flags", () => {
  const bytes = files.get("Документ.doc"),
    doc = readLegacyDoc(bytes, CFB);
  assert.match(
    doc.text,
    /Тестовый документ DOC\nСотрудник: Тест\nСумма: 1234,50/,
  );
  const ole = CFB.read(bytes, { type: "array" });
  CFB.find(ole, "WordDocument").content[11] |= 1;
  assert.throws(
    () => readLegacyDoc(new Uint8Array(CFB.write(ole, { type: "array" })), CFB),
    /паролем/,
  );
});
test("RTF keeps Unicode, legacy encoding and field results but hides control destinations", () => {
  const result = readRtf(decodeText(files.get("Документ.rtf")));
  assert.match(result.text, /Тест\nДокумент/);
  assert.match(result.text, /Результат/);
  assert.doesNotMatch(result.text, /Hidden|secret|HYPERLINK/);
});
test("HTML disguised as DOC yields readable text and table headers without scripts or resources", () => {
  const doc = readHtmlDocument(decodeText(files.get("Выгрузка.doc")));
  assert.equal(doc.blocks[0].text, "Выгрузка 1С");
  assert.deepEqual(doc.blocks[2].rows, [["Заголовок", "Значение"]]);
  assert.doesNotMatch(JSON.stringify(doc), /pwned|untrusted/);
});
test("text decoding accepts UTF-16 and Windows Cyrillic exports", () => {
  assert.equal(
    decodeText(
      new Uint8Array([
        0xff, 0xfe, 0x22, 0x04, 0x35, 0x04, 0x41, 0x04, 0x42, 0x04,
      ]),
    ),
    "Тест",
  );
  assert.equal(decodeText(new Uint8Array([0xd2, 0xe5, 0xf1, 0xf2])), "Тест");
});
test("blocks external XML entities and oversized ZIP contents before parsing", () => {
  assert.throws(
    () => readXmlDocument(files.get("Повреждённый.docx"), "docx"),
    /XML/,
  );
  const zip = files.get("Документ.docx").slice(),
    data = new DataView(zip.buffer);
  let directory = -1;
  for (let i = 0; i < zip.length - 4; i++)
    if (data.getUint32(i, true) === 0x02014b50) {
      directory = i;
      break;
    }
  assert.ok(directory >= 0);
  data.setUint32(directory + 24, 100 * 1024 * 1024, true);
  assert.throws(() => archiveBudget(zip), /больш/);
});
