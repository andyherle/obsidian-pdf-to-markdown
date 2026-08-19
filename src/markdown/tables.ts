const HTML_BREAK = /<br\s*\/?>/gi;
const ENCODED_BREAK = /&lt;\s*br\s*\/?\s*&gt;/gi;
const NUMERIC = /^\s*(?:[$€£¥]\s*)?[+-]?(?:\d{1,3}(?:[ ,]\d{3})*|\d+)(?:[.,]\d+)?\s*%?\s*$/;

export function cleanTableCell(value: string): string {
  return value
    .replace(ENCODED_BREAK, "; ")
    .replace(HTML_BREAK, "; ")
    .replace(/\r?\n+/g, "; ")
    .replace(/\\\|/g, "|")
    .replace(/\|/g, "\\|")
    .replace(/\s*;\s*(?:;\s*)+/g, "; ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNumericCell(value: string): boolean {
  return value.length > 0 && NUMERIC.test(value.replace(/\\\|/g, "|"));
}

function visibleLength(value: string): number {
  return value.replace(/\\\|/g, "|").length;
}

function pad(value: string, width: number, right: boolean): string {
  const difference = Math.max(0, width - visibleLength(value));
  return right ? `${" ".repeat(difference)}${value}` : `${value}${" ".repeat(difference)}`;
}

export function splitMarkdownTableRow(value: string): string[] {
  const row = value.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let codeTicks = 0;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "`") {
      let run = 1;
      while (row[index + run] === "`") run += 1;
      current += "`".repeat(run);
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      index += run - 1;
      continue;
    }
    if (char === "|" && codeTicks === 0) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function formatMarkdownTable(rows: string[][]): string {
  if (rows.length < 2) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => cleanTableCell(row[index] ?? ""))
  );
  const alignRight = Array.from({ length: columnCount }, (_, index) => {
    const body = normalized.slice(1).map((row) => row[index]).filter(Boolean);
    return body.length > 0 && body.filter(isNumericCell).length / body.length >= 0.7;
  });
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const widest = Math.max(3, ...normalized.map((row) => visibleLength(row[index])));
    return Math.min(80, widest);
  });
  const rowText = (row: string[]): string => {
    const cells = row.map((cell, index) => pad(cell, widths[index], alignRight[index]));
    return `| ${cells.join(" | ")} |`;
  };
  const separator = `| ${widths
    .map((width, index) =>
      alignRight[index] ? `${"-".repeat(Math.max(3, width - 1))}:` : "-".repeat(width)
    )
    .join(" | ")} |`;
  return [rowText(normalized[0]), separator, ...normalized.slice(1).map(rowText)].join("\n");
}

function isSeparatorRow(value: string): boolean {
  const cells = splitMarkdownTableRow(value);
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

export function normalizeMarkdownTables(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let index = 0;
  let fence: string | null = null;

  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      output.push(line);
      index += 1;
      continue;
    }

    if (!fence && /^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      const dataRows = block.filter((item, rowIndex) => rowIndex !== 1 || !isSeparatorRow(item));
      const parsed = dataRows.map(splitMarkdownTableRow);
      output.push(parsed.length >= 2 ? formatMarkdownTable(parsed) : block.join("\n"));
      continue;
    }

    output.push(line);
    index += 1;
  }

  return output.join("\n");
}
