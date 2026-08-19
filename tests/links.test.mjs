import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLink,
  pdfSubpathToMarkdown,
  renderReplacement
} from "../.test-build/links/syntax.js";

function reference(original) {
  const parsed = parseLink(original);
  assert.ok(parsed);
  return {
    start: 0,
    end: original.length,
    original,
    style: parsed.style,
    embed: parsed.embed,
    alias: parsed.alias,
    subpath: parsed.subpath
  };
}

test("wiki aliases and embeds stay unchanged", () => {
  assert.equal(
    renderReplacement(reference("![[Invoices/Source.pdf#page=2|Original]]"), "Invoices/Source.md", "Source.md", true),
    "![[Invoices/Source.md#Page 2|Original]]"
  );
});

test("wiki links do not gain an alias", () => {
  assert.equal(
    renderReplacement(reference("[[Source.pdf]]"), "Documents/Source.md", "Source.md", true),
    "[[Documents/Source.md]]"
  );
});

test("Markdown labels and titles stay unchanged", () => {
  assert.equal(
    renderReplacement(reference("[Receipt](Source.pdf#page=3 \"Open\")"), "Source", "Source.md", true),
    "[Receipt](Source.md#Page 3 \"Open\")"
  );
});

test("page anchors are removed when page headings are disabled", () => {
  assert.equal(pdfSubpathToMarkdown("#page=8", false), "");
});


test("page anchors with PDF viewer options keep the page number", () => {
  assert.equal(pdfSubpathToMarkdown("#page=4,zoom=125", true), "#Page 4");
  assert.equal(pdfSubpathToMarkdown("#page=5&selection=1,0,1,10", true), "#Page 5");
});
