import test from "node:test";
import assert from "node:assert/strict";
import { generateTableSvg, svgToArrayBuffer } from "../.test-build/svg/table-svg.js";

const table = {
  id: "table-1-1",
  page: 1,
  index: 1,
  rows: [["Name", "Amount"], ["Camera & lens", "$100"]],
  bounds: { x: 0, y: 0, width: 500, height: 80 },
  confidence: 0.9,
  consumedLineIds: []
};

test("SVG tables are minified, scalable, and escaped", () => {
  const svg = generateTableSvg(table);
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox=/);
  assert.match(svg, /Camera &amp; lens/);
  assert.doesNotMatch(svg, />\s+</);
  assert.ok(svgToArrayBuffer(svg).byteLength < 5000);
});
