import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCodexMarkdown } from '../src/utils/codexMarkdown.js';

test('Codex renders financial tables, emphasis, lists and code as readable markup', () => {
  const html = renderCodexMarkdown('**Итог:** 123 ₸\n\n| Расчёт | Сумма, ₸ |\n| --- | ---: |\n| Остаток | 123,00 |\n\n- Первый\n- Второй\n\n```text\n<example>\n```');
  assert.match(html, /<strong>Итог:<\/strong>/);
  assert.match(html, /class="codex-table-scroll"/);
  assert.match(html, /<th>Расчёт<\/th>/);
  assert.match(html, /<td style="text-align:right">123,00<\/td>/);
  assert.match(html, /<ul>/);
  assert.match(html, /&lt;example&gt;/);
});

test('Codex model output cannot execute HTML, scripts, unsafe links or load remote media', () => {
  const html = renderCodexMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [local](file:///etc/passwd) ![remote](https://tracking.example/image.png)\n\n[Ссылка](https://example.com/a?q=1&b=2)');
  assert.doesNotMatch(html, /<script|<img|href="javascript:|href="file:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/example.com/);
});
