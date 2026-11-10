import * as XLSX from "xlsx";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
const zip = (entries) =>
  zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
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
