import type { ExtractedTable } from "../types";

const FONT_SIZE = 14;
const LINE_HEIGHT = 19;
const PADDING_X = 10;
const PADDING_Y = 8;
const MIN_COLUMN_WIDTH = 90;
const MAX_COLUMN_WIDTH = 300;
const MAX_TABLE_WIDTH = 1200;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function estimateColumnWidths(rows: string[][]): number[] {
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(0, ...rows.map((row) => (row[column] ?? "").length));
    return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, longest * 7.2 + PADDING_X * 2));
  });
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= MAX_TABLE_WIDTH) return widths;
  const scale = MAX_TABLE_WIDTH / total;
  return widths.map((width) => Math.max(70, Math.floor(width * scale)));
}

function wrapText(value: string, maxWidth: number): string[] {
  const maxCharacters = Math.max(4, Math.floor((maxWidth - PADDING_X * 2) / 7.2));
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharacters) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function generateTableSvg(table: ExtractedTable): string {
  const widths = estimateColumnWidths(table.rows);
  const wrappedRows = table.rows.map((row) =>
    widths.map((width, column) => wrapText(row[column] ?? "", width))
  );
  const heights = wrappedRows.map((row) => {
    const lineCount = Math.max(1, ...row.map((cell) => cell.length));
    return lineCount * LINE_HEIGHT + PADDING_Y * 2;
  });
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const totalHeight = heights.reduce((sum, height) => sum + height, 0);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(totalWidth)}" height="${Math.ceil(totalHeight)}" viewBox="0 0 ${Math.ceil(totalWidth)} ${Math.ceil(totalHeight)}" role="img" aria-labelledby="title">`,
    `<title id="title">Table from page ${table.page}</title>`,
    "<style>rect{fill:#fff;stroke:#c8ccd0;stroke-width:1}rect.h{fill:#f2f3f5}text{fill:#202124;font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}text.h{font-weight:600}@media(prefers-color-scheme:dark){rect{fill:#202225;stroke:#565a60}rect.h{fill:#2b2e33}text{fill:#eceff1}}</style>"
  ];

  let y = 0;
  for (let row = 0; row < wrappedRows.length; row += 1) {
    let x = 0;
    for (let column = 0; column < widths.length; column += 1) {
      const width = widths[column];
      const height = heights[row];
      const className = row === 0 ? " class=\"h\"" : "";
      parts.push(`<rect${className} x="${x}" y="${y}" width="${width}" height="${height}"/>`);
      const lines = wrappedRows[row][column];
      for (let line = 0; line < lines.length; line += 1) {
        const textY = y + PADDING_Y + FONT_SIZE + line * LINE_HEIGHT;
        parts.push(`<text${className} x="${x + PADDING_X}" y="${textY}">${escapeXml(lines[line])}</text>`);
      }
      x += width;
    }
    y += heights[row];
  }
  parts.push("</svg>");
  return parts.join("");
}

export function svgToArrayBuffer(svg: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(svg);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
