import * as XLSX from "xlsx";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
const zip = (entries) =>
  zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
export function mxlSample(rows, tail = []) {
  const serialize = (value) =>
    Array.isArray(value)
      ? "{" + value.map(serialize).join(",") + "}"
      : typeof value === "number"
        ? String(value)
        : '"' + value.replaceAll('"', '""') + '"';
  const root = [
    8,
    1,
    12,
    ["ru"],
    [],
    [],
    0,
    ...Array.from({ length: 6 }, () => [0, 0]),
    0,
    0,
    rows.length,
  ];
  for (const row of rows)
    root.push(
      row.index,
      0,
      row.cells.length,
      ...row.cells.flatMap(([col, cell]) => [col, cell]),
    );
  root.push(...tail);
  const body = strToU8(serialize(root)),
    bytes = new Uint8Array(16 + body.length);
  bytes.set([77, 79, 88, 67, 69, 76, 0, 8, 0, 1, 0, 12, 0, 239, 187, 191]);
  bytes.set(body, 16);
  return bytes;
}
export function documentSamples() {
  const files = new Map(),
    data = [
      ["Отчёт", "", ""],
      ["Название", "Сумма", "Код"],
      ["Платёж", 1234.5, "00123"],
      ['<img src="https://untrusted.invalid/pixel">', 0, "без выполнения"],
    ];
  for (let i = 4; i < 208; i++) data.push(["Строка " + i, i, "00" + i]);
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet.B3.z = "#,##0.00";
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  const second = XLSX.utils.aoa_to_sheet([
    ["Итог", 42, new Date("2026-11-10T00:00:00Z")],
  ]);
  second.B1.f = "SUM(40,2)";
  second.C1.z = 'dd"."mm"."yyyy';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Данные");
  XLSX.utils.book_append_sheet(workbook, second, "Итоги");
  for (const type of ["xlsx", "xls", "xlsb", "ods", "fods", "csv"])
    files.set(
      "Таблица." + type,
      new Uint8Array(
        XLSX.write(workbook, {
          bookType: type,
          type: "buffer",
          compression: true,
        }),
      ),
    );
  files.set("Таблица.tsv", strToU8("Код\tСумма\n00123\t1234,50\n"));
  const html =
    '<!doctype html><html><head><meta charset="UTF-8"><style>@import url(https://untrusted.invalid/styles);h1{color:rgb(32,96,144);font-size:24px}td{border:1px solid #777}</style><script>window.pwned=1;parent.pwned=1</script><meta http-equiv="refresh" content="0;url=https://untrusted.invalid/redirect"></head><body onload="parent.pwned=1"><form><h1>Счёт на оплату HTML</h1><table><tr><th>Услуга</th><th>Сумма</th></tr><tr><td>Разработка</td><td>1234,50</td></tr></table></form><img alt="Встроенное изображение" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4c8AAAAASUVORK5CYII="><img src="https://untrusted.invalid/tracker" onerror="parent.pwned=1"><iframe src="https://untrusted.invalid/frame"></iframe><a href="https://untrusted.invalid/link">Внешняя ссылка</a><a href="javascript:parent.pwned=1">Команда</a><object data="https://untrusted.invalid/object"></object></body></html>';
  for (const extension of ["html", "htm", "xhtml"])
    files.set("Страница." + extension, strToU8(html));
  files.set(
    "Таблица.mxl",
    mxlSample(
      [
        { index: 0, cells: [[0, [16, 0, [1, 1, ["ru", 'Счёт "Тест"']]]]] },
        {
          index: 1,
          cells: [
            [0, [2, 0, ["S", "Разработка"]]],
            [1, [2, 0, ["N", "1234.50"]]],
            [2, [2, 0, ["S", "00123"]]],
          ],
        },
        {
          index: 101,
          cells: [
            [
              0,
              [
                20,
                0,
                ["#", "guid", "address"],
                [2, 1, ["en", "MXL row"], ["ru", "Строка MXL 101"]],
              ],
            ],
          ],
        },
      ],
      [[1, [0, 0, 2, 0, 0]]],
    ),
  );
  const legacy = new Uint8Array(16);
  legacy.set([77, 79, 88, 67, 69, 76]);
  legacy[11] = 7;
  files.set("Старый.mxl", legacy);
  const document =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Тестовый документ DOCX</w:t></w:r></w:p><w:p><w:r><w:t>Привет &amp; мир</w:t></w:r><w:del><w:r><w:t>Удалённый текст</w:t></w:r></w:del><w:r><w:instrText>INCLUDETEXT https://untrusted.invalid/secret</w:instrText></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Позиция</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Сумма</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Работа</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1234,50</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  files.set(
    "Документ.docx",
    zip({
      "word/document.xml": document,
      "word/_rels/document.xml.rels":
        '<Relationships><Relationship Id="external" TargetMode="External" Target="https://untrusted.invalid/pixel"/></Relationships>',
    }),
  );
  files.set(
    "Документ.odt",
    zip({
      "content.xml":
        '<office:document-content xmlns:office="urn:office" xmlns:text="urn:text" xmlns:table="urn:table"><office:body><office:text><text:h text:outline-level="1">Тестовый документ ODT</text:h><text:p>Читаемый текст</text:p><table:table><table:table-row><table:table-cell><text:p>Ячейка ODT</text:p></table:table-cell></table:table-row></table:table></office:text></office:body></office:document-content>',
    }),
  );
  files.set(
    "Документ.rtf",
    strToU8(
      String.raw`{\rtf1\ansi\ansicpg1251 {\fonttbl{\f0 Hidden font;}}\'d2\'e5\'f1\'f2\par \u1044?\u1086?\u1082?\u1091?\u1084?\u1077?\u1085?\u1090? {\field{\*\fldinst HYPERLINK secret}{\fldrslt Результат}}}`,
    ),
  );
  files.set(
    "Документ.doc",
    new Uint8Array(
      readFileSync(
        new URL("../browser/fixtures/reading-sample.doc", import.meta.url),
      ),
    ),
  );
  files.set(
    "Выгрузка.doc",
    strToU8(
      '<html><head><script>window.pwned=1</script></head><body><h1>Выгрузка 1С</h1><p>Текст документа</p><table><tr><th>Заголовок</th><td>Значение</td></tr></table><img src="https://untrusted.invalid/pixel"/></body></html>',
    ),
  );
  files.set(
    "Презентация.pptx",
    zip({
      "ppt/presentation.xml":
        '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>',
      "ppt/_rels/presentation.xml.rels":
        '<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>',
      "ppt/slides/slide1.xml":
        '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Второй слайд</a:t></a:r></a:p></p:sld>',
      "ppt/slides/slide2.xml":
        '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Первый слайд</a:t></a:r></a:p></p:sld>',
    }),
  );
  files.set(
    "Заметки.txt",
    strToU8("Текстовый файл\nВторая строка\n<script>window.pwned=1</script>"),
  );
  files.set("Данные.json", strToU8('{"имя":"Тест","значение":42}'));
  files.set("Markdown.md", strToU8("# Заголовок\nТекст Markdown"));
  files.set(
    "Ссылка.gsheet",
    strToU8('{"url":"https://docs.google.com/spreadsheets/d/fixture"}'),
  );
  files.set(
    "Повреждённый.docx",
    zip({
      "word/document.xml":
        '<!DOCTYPE a [<!ENTITY b SYSTEM "https://untrusted.invalid/secret">]><a>&b;</a>',
    }),
  );
  return files;
}
