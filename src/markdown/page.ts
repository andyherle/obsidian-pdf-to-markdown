import type {
  ExtractedAsset,
  ExtractedTable,
  PageBlock,
  PdfLine,
  PdfToMarkdownSettings
} from "../types";
import { orderLinesForReading } from "../pdf/text";
import { formatMarkdownTable } from "./tables";

const LIST_PATTERN = /^\s*((?:\d+|[A-Za-z])[.)]|[•◦▪‣●○■□–—-])\s+(.*)$/;
const CJK_END = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;
const CJK_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

interface MarkdownBlockBuilder {
  order: number;
  lines: string[];
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u00ad\u200b\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .trim();
}

function headingLevel(line: PdfLine, bodyFontSize: number): number | null {
  const text = normalizeText(line.text);
  if (!text || text.length > 180) return null;
  const ratio = line.fontSize / Math.max(1, bodyFontSize);
  if (ratio >= 1.6 && text.length <= 120) return 1;
  if (ratio >= 1.34 && text.length <= 150) return 2;
  if (ratio >= 1.16 && line.bold && text.length <= 180) return 3;
  return null;
}

function listLine(value: string): { marker: string; text: string } | null {
  const match = normalizeText(value).match(LIST_PATTERN);
  if (!match) return null;
  const rawMarker = match[1];
  const numeric = rawMarker.match(/^(\d+)[.)]$/);
  return {
    marker: numeric ? `${numeric[1]}.` : "-",
    text: match[2]
  };
}

function needsParagraphBreak(previous: PdfLine, current: PdfLine, bodyFontSize: number): boolean {
  const verticalGap = current.y - (previous.y + previous.height);
  if (verticalGap < -bodyFontSize) return true;
  if (verticalGap > Math.max(bodyFontSize * 0.85, previous.height * 0.9)) return true;
  const indentChange = Math.abs(current.x - previous.x);
  if (indentChange > bodyFontSize * 2.4 && verticalGap > bodyFontSize * 0.15) return true;
  if (previous.bold !== current.bold && verticalGap > bodyFontSize * 0.35) return true;
  return false;
}

function joinParagraphText(previous: string, next: string): string {
  if (!previous) return next;
  if (!next) return previous;
  if (/\p{L}-$/u.test(previous) && /^\p{Ll}/u.test(next)) return `${previous.slice(0, -1)}${next}`;
  if (CJK_END.test(previous) && CJK_START.test(next)) return `${previous}${next}`;
  if (["(", "[", "{", "/"].includes(previous.slice(-1)) || /^[,.;:!?%)]/.test(next)) {
    return `${previous}${next}`;
  }
  return `${previous} ${next}`;
}

function insertionOrder(y: number, orderedLines: PdfLine[]): number {
  let order = 0;
  for (let index = 0; index < orderedLines.length; index += 1) {
    if (orderedLines[index].y <= y) order = index + 0.5;
  }
  return order;
}

function renderTextBlocks(lines: PdfLine[], bodyFontSize: number): PageBlock[] {
  const blocks: PageBlock[] = [];
  let paragraph: MarkdownBlockBuilder | null = null;
  let list: MarkdownBlockBuilder | null = null;
  let previousParagraphLine: PdfLine | null = null;

  const flushParagraph = (): void => {
    if (!paragraph) return;
    const text = paragraph.lines.reduce((value, line) => joinParagraphText(value, line), "");
    if (text) blocks.push({ kind: "markdown", order: paragraph.order, markdown: text });
    paragraph = null;
    previousParagraphLine = null;
  };

  const flushList = (): void => {
    if (!list) return;
    blocks.push({ kind: "markdown", order: list.order, markdown: list.lines.join("\n") });
    list = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = normalizeText(line.text);
    if (!text) continue;

    const level = headingLevel(line, bodyFontSize);
    if (level !== null) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "markdown", order: index, markdown: `${"#".repeat(level)} ${text}` });
      continue;
    }

    const listItem = listLine(text);
    if (listItem) {
      flushParagraph();
      if (!list) list = { order: index, lines: [] };
      list.lines.push(`${listItem.marker} ${listItem.text}`);
      continue;
    }

    flushList();
    if (paragraph && previousParagraphLine && needsParagraphBreak(previousParagraphLine, line, bodyFontSize)) {
      flushParagraph();
    }
    if (!paragraph) paragraph = { order: index, lines: [] };
    paragraph.lines.push(text);
    previousParagraphLine = line;
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function buildPageBlocks(
  lines: PdfLine[],
  pageWidth: number,
  tables: ExtractedTable[],
  assets: ExtractedAsset[],
  bodyFontSize: number,
  settings: PdfToMarkdownSettings
): PageBlock[] {
  const consumed = new Set(tables.flatMap((table) => table.consumedLineIds));
  const remaining = lines.filter((line) => !consumed.has(line.id));
  const orderedLines = orderLinesForReading(remaining, pageWidth);
  const blocks = renderTextBlocks(orderedLines, bodyFontSize);

  for (const table of tables) {
    const parts: string[] = [];
    if (settings.tableOutput === "markdown" || settings.tableOutput === "both") {
      parts.push(formatMarkdownTable(table.rows));
    }
    if (settings.tableOutput === "svg" || settings.tableOutput === "both") {
      parts.push(`{{PDFMD_ASSET:${table.id}}}`);
    }
    if (parts.length > 0) {
      blocks.push({
        kind: "markdown",
        order: insertionOrder(table.bounds.y, orderedLines),
        markdown: parts.join("\n\n")
      });
    }
  }

  for (const asset of assets) {
    if (asset.kind === "table") continue;
    blocks.push({
      kind: "asset",
      order: insertionOrder(asset.bounds.y, orderedLines) + asset.index / 1000,
      assetId: asset.id
    });
  }

  return blocks.sort((a, b) => a.order - b.order);
}
