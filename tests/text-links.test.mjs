import { test } from "node:test";
import assert from "node:assert/strict";
import { textLinkParts, textLinks } from "../src/utils/textLinks.js";
import { renderCodexMarkdown } from "../src/utils/codexMarkdown.js";

test("URLs preserve surrounding text, punctuation, query strings and line breaks", () => {
  const text =
    "Договор (https://example.com/a?q=1&b=2).\nСайт www.example.org и example.com.";
  const parts = textLinkParts(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(
    parts.filter((part) => part.href).map((part) => part.href),
    [
      "https://example.com/a?q=1&b=2",
      "http://www.example.org",
      "http://example.com",
    ],
  );
  assert.equal(textLinks("https://example.com https://example.com").length, 1);
});

test("plain text never becomes executable markup or non-web links", () => {
  const text =
    "<img onerror=alert(1)> javascript:alert(1) file:///etc/passwd mailto:user@example.com";
  assert.equal(textLinks(text).length, 0);
  assert.equal(
    textLinkParts(text)
      .map((part) => part.text)
      .join(""),
    text,
  );
});

test("chat autolinks bare URLs safely while leaving inline code literal", () => {
  const html = renderCodexMarkdown(
    "https://example.com/a?q=1&b=2 и www.example.org.\n`https://code.example.com`\n<script>alert(1)</script>",
  );
  assert.match(
    html,
    /href="https:\/\/example.com\/a\?q=1&amp;b=2" target="_blank" rel="noopener noreferrer"/,
  );
  assert.match(html, /href="http:\/\/www.example.org"/);
  assert.match(html, /<code>https:\/\/code.example.com<\/code>/);
  assert.doesNotMatch(html, /<script>/);
});
