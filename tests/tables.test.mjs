import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanTableCell,
  formatMarkdownTable,
  normalizeMarkdownTables,
  splitMarkdownTableRow
} from "../.test-build/markdown/tables.js";


test("table cells remove HTML breaks and escape pipes", () => {
  assert.equal(cleanTableCell("First<br>Second | value"), "First; Second \\| value");
  assert.equal(cleanTableCell("First&lt;br /&gt;Second"), "First; Second");
});

test("Markdown rows preserve pipes inside code and escaped pipes", () => {
  assert.deepEqual(
    splitMarkdownTableRow("| one | `a|b` | c\\|d |"),
    [" one ", " `a|b` ", " c\\|d "]
  );
});

test("formatted tables are padded and numeric columns are right aligned", () => {
  const table = formatMarkdownTable([
    ["Description", "Quantity", "Amount"],
    ["Camera", "1", "$50.00"],
    ["Lens rental", "2", "$80.00"]
  ]);
  assert.match(table, /\| Description\s+\| Quantity \| Amount \|/);
  assert.match(table.split("\n")[1], /-------:\s*\|\s*-----:/);
  assert.doesNotMatch(table, /<br/i);
});

test("table normalization ignores fenced code", () => {
  const source = [
    "| A | B |",
    "|---|---|",
    "| x<br>y | 2 |",
    "",
    "```md",
    "| keep<br>this | raw |",
    "```"
  ].join("\n");
  const result = normalizeMarkdownTables(source);
  assert.match(result, /x; y/);
  assert.match(result, /keep<br>this/);
});
