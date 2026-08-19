import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPageText,
  orderLinesForReading,
  removeRepeatedMargins
} from "../.test-build/pdf/text.js";
import { detectTables } from "../.test-build/pdf/tables.js";

function span(id, text, x, y, width = 45) {
  return {
    id,
    text,
    x,
    y,
    width,
    height: 12,
    page: 1,
    fontSize: 12,
    fontName: "Body",
    bold: false,
    hasEol: false
  };
}

function line(id, text, x, y, spans = [span(`${id}-s`, text, x, y, Math.max(20, text.length * 6))]) {
  return {
    id,
    page: 1,
    spans,
    text,
    x,
    y,
    width: Math.max(...spans.map((item) => item.x + item.width)) - x,
    height: 12,
    fontSize: 12,
    bold: false,
    pageWidth: 600,
    pageHeight: 800
  };
}


test("page text uses the PDF viewport transform", async () => {
  const page = {
    getViewport() {
      return { width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] };
    },
    async getTextContent() {
      return {
        items: [{
          str: "Hello",
          transform: [12, 0, 0, 12, 40, 700],
          width: 30,
          height: 12,
          fontName: "Body",
          hasEOL: true
        }]
      };
    }
  };
  const result = await extractPageText(page, 1);
  assert.equal(result.lines[0].text, "Hello");
  assert.ok(result.lines[0].y > 80 && result.lines[0].y < 110);
});

test("two-column text is read down the left column and then the right column", () => {
  const lines = [
    line("l1", "Left one", 40, 100),
    line("r1", "Right one", 340, 100),
    line("l2", "Left two", 40, 130),
    line("r2", "Right two", 340, 130),
    line("l3", "Left three", 40, 160),
    line("r3", "Right three", 340, 160),
    line("l4", "Left four", 40, 190),
    line("r4", "Right four", 340, 190)
  ];
  assert.deepEqual(
    orderLinesForReading(lines, 600).map((item) => item.id),
    ["l1", "l2", "l3", "l4", "r1", "r2", "r3", "r4"]
  );
});

test("repeated page headers and footers are removed", () => {
  const pages = [1, 2, 3].map((page) => ({
    page,
    width: 600,
    height: 800,
    spans: [],
    lines: [
      { ...line(`h${page}`, "Company report", 40, 20), page },
      { ...line(`b${page}`, `Page body ${page}`, 40, 200), page },
      { ...line(`f${page}`, `Page ${page}`, 280, 770), page }
    ],
    characterCount: 30
  }));
  const cleaned = removeRepeatedMargins(pages, true);
  assert.deepEqual(cleaned.map((page) => page.lines.map((item) => item.text)), [
    ["Page body 1"],
    ["Page body 2"],
    ["Page body 3"]
  ]);
});

test("aligned rows are detected as a table", () => {
  const rows = [
    ["Item", "Qty", "Amount"],
    ["Camera", "1", "$50"],
    ["Lens", "2", "$80"],
    ["Tripod", "1", "$20"]
  ];
  const lines = rows.map((row, index) => {
    const y = 100 + index * 24;
    const spans = [
      span(`s${index}a`, row[0], 40, y, 80),
      span(`s${index}b`, row[1], 220, y, 30),
      span(`s${index}c`, row[2], 360, y, 60)
    ];
    return line(`row${index}`, row.join(" "), 40, y, spans);
  });
  const tables = detectTables(lines, 0.5);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, rows);
  assert.ok(tables[0].confidence >= 0.5);
});

test("table detection does not consume an outlier row that was not mapped", () => {
  const regularRows = [
    ["Item", "Amount"],
    ["Camera", "$50"],
    ["Lens", "$80"],
    ["Tripod", "$20"]
  ].map((row, index) => {
    const y = 100 + index * 24;
    return line(`regular-${index}`, row.join(" "), 40, y, [
      span(`regular-${index}-a`, row[0], 40, y, 80),
      span(`regular-${index}-b`, row[1], 260, y, 60)
    ]);
  });
  const y = 196;
  const outlier = line("outlier", "Separate note", 460, y, [
    span("outlier-a", "Separate", 460, y, 60),
    span("outlier-b", "note", 550, y, 40)
  ]);
  const tables = detectTables([...regularRows, outlier], 0.5);
  assert.equal(tables.length, 1);
  assert.ok(!tables[0].consumedLineIds.includes("outlier"));
});
