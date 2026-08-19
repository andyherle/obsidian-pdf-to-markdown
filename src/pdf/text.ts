import type { PdfLine, PdfTextSpan, RawPageText } from "../types";
import type { PdfPageProxy } from "./pdfjs";

interface TextContentItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
}

interface MutableLine {
  spans: PdfTextSpan[];
  y: number;
}

type Matrix = [number, number, number, number, number, number];

function multiplyTransform(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function isBoldFont(fontName: string): boolean {
  return /(?:bold|black|heavy|semibold|demi)/i.test(fontName);
}

function shouldInsertSpace(previous: PdfTextSpan, current: PdfTextSpan): boolean {
  if (!previous.text || !current.text) return false;
  const gap = current.x - (previous.x + previous.width);
  const threshold = Math.max(1.5, Math.min(previous.fontSize, current.fontSize) * 0.18);
  if (gap <= threshold) return false;
  if (/^[,.;:!?%)\]}]/.test(current.text)) return false;
  if (/[([{/$£€¥]$/.test(previous.text)) return false;
  return true;
}

function joinSpans(spans: PdfTextSpan[]): string {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  let output = "";
  let previous: PdfTextSpan | null = null;
  for (const span of sorted) {
    const text = span.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (previous && shouldInsertSpace(previous, span) && !output.endsWith(" ")) output += " ";
    output += text;
    previous = span;
  }
  return output
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function toSpan(
  item: TextContentItem,
  page: number,
  index: number,
  pageHeight: number,
  viewportTransform?: number[]
): PdfTextSpan | null {
  const text = item.str?.replace(/\p{Cc}/gu, "") ?? "";
  if (!text.trim()) return null;
  const rawTransform = item.transform;
  if (!rawTransform || rawTransform.length < 6) return null;
  const itemMatrix = rawTransform.slice(0, 6) as Matrix;
  const transform = viewportTransform?.length === 6
    ? multiplyTransform(viewportTransform.slice(0, 6) as Matrix, itemMatrix)
    : itemMatrix;
  const fontSize = Math.max(
    1,
    Math.hypot(transform[2], transform[3]),
    Math.hypot(transform[0], transform[1]),
    Math.abs(item.height ?? 0)
  );
  const width = Math.max(0.1, Math.abs(item.width ?? text.length * fontSize * 0.5));
  const height = Math.max(fontSize, Math.abs(item.height ?? fontSize));
  const x = transform[4];
  const baseline = transform[5];
  const mappedByViewport = viewportTransform?.length === 6;
  const y = Math.max(0, mappedByViewport ? baseline - height * 0.82 : pageHeight - baseline - height * 0.82);
  const fontName = item.fontName ?? "";
  return {
    id: `p${page}-s${index}`,
    page,
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontName,
    bold: isBoldFont(fontName),
    hasEol: Boolean(item.hasEOL)
  };
}

function createLine(group: MutableLine, pageWidth: number, pageHeight: number, index: number): PdfLine {
  const spans = [...group.spans].sort((a, b) => a.x - b.x);
  const x = Math.min(...spans.map((span) => span.x));
  const right = Math.max(...spans.map((span) => span.x + span.width));
  const y = median(spans.map((span) => span.y));
  const bottom = Math.max(...spans.map((span) => span.y + span.height));
  const fontSize = median(spans.map((span) => span.fontSize));
  return {
    id: `p${spans[0].page}-l${index}`,
    page: spans[0].page,
    spans,
    text: joinSpans(spans),
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(fontSize, bottom - y),
    fontSize,
    bold: spans.filter((span) => span.bold).length >= Math.ceil(spans.length / 2),
    pageWidth,
    pageHeight
  };
}

function groupSpansIntoLines(spans: PdfTextSpan[], pageWidth: number, pageHeight: number): PdfLine[] {
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: MutableLine[] = [];

  for (const span of sorted) {
    let best: MutableLine | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = Math.max(0, groups.length - 8); index < groups.length; index += 1) {
      const group = groups[index];
      const groupFont = median(group.spans.map((item) => item.fontSize)) || span.fontSize;
      const tolerance = Math.max(2, Math.min(groupFont, span.fontSize) * 0.42);
      const distance = Math.abs(group.y - span.y);
      if (distance <= tolerance && distance < bestDistance) {
        best = group;
        bestDistance = distance;
      }
    }
    if (best) {
      best.spans.push(span);
      best.y = median(best.spans.map((item) => item.y));
    } else {
      groups.push({ spans: [span], y: span.y });
    }
  }

  return groups
    .map((group, index) => createLine(group, pageWidth, pageHeight, index))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function extractPageText(page: PdfPageProxy, pageNumber: number): Promise<RawPageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({
    includeMarkedContent: false,
    disableNormalization: false
  });
  const spans = content.items
    .map((item, index) =>
      toSpan(item as TextContentItem, pageNumber, index, viewport.height, viewport.transform)
    )
    .filter((span): span is PdfTextSpan => span !== null);
  const lines = groupSpansIntoLines(spans, viewport.width, viewport.height);
  return {
    page: pageNumber,
    width: viewport.width,
    height: viewport.height,
    spans,
    lines,
    characterCount: lines.reduce((total, line) => total + line.text.length, 0)
  };
}

function findColumnSplit(lines: PdfLine[], pageWidth: number): number | null {
  if (lines.length < 8 || pageWidth <= 0) return null;
  let bestSplit: number | null = null;
  let bestScore = 0;
  for (let ratio = 0.3; ratio <= 0.7; ratio += 0.02) {
    const split = pageWidth * ratio;
    const gutter = Math.max(8, pageWidth * 0.012);
    const left = lines.filter((line) => line.x + line.width <= split + gutter).length;
    const right = lines.filter((line) => line.x >= split - gutter).length;
    const crossing = lines.length - left - right;
    if (left < 3 || right < 3) continue;
    if (crossing / lines.length > 0.18) continue;
    const balance = Math.min(left, right) / Math.max(left, right);
    const score = Math.min(left, right) * balance - crossing * 2;
    if (score > bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }
  return bestSplit;
}

function sortBandByColumns(lines: PdfLine[], split: number): PdfLine[] {
  const gutter = Math.max(8, lines[0]?.pageWidth * 0.012 || 8);
  const left = lines
    .filter((line) => line.x + line.width <= split + gutter)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const right = lines
    .filter((line) => line.x >= split - gutter)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const unassigned = lines
    .filter((line) => !left.includes(line) && !right.includes(line))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return [...left, ...right, ...unassigned];
}

export function orderLinesForReading(lines: PdfLine[], pageWidth: number): PdfLine[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const split = findColumnSplit(sorted, pageWidth);
  if (split === null) return sorted;

  const gutter = Math.max(8, pageWidth * 0.012);
  const fullWidth = sorted.filter((line) => line.x < split - gutter && line.x + line.width > split + gutter);
  if (fullWidth.length === 0) return sortBandByColumns(sorted, split);

  const result: PdfLine[] = [];
  let previousY = Number.NEGATIVE_INFINITY;
  for (const separator of fullWidth.sort((a, b) => a.y - b.y)) {
    const band = sorted.filter(
      (line) => !fullWidth.includes(line) && line.y >= previousY && line.y < separator.y
    );
    result.push(...sortBandByColumns(band, split), separator);
    previousY = separator.y + Math.max(1, separator.height * 0.2);
  }
  const tail = sorted.filter((line) => !fullWidth.includes(line) && line.y >= previousY);
  result.push(...sortBandByColumns(tail, split));
  return result;
}

function marginSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeRepeatedMargins(pages: RawPageText[], enabled: boolean): RawPageText[] {
  if (!enabled || pages.length < 3) return pages;
  const counts = new Map<string, number>();
  for (const page of pages) {
    const signatures = new Set<string>();
    for (const line of page.lines) {
      const inMargin = line.y <= page.height * 0.12 || line.y + line.height >= page.height * 0.88;
      if (!inMargin) continue;
      const signature = marginSignature(line.text);
      if (signature.length >= 1 && signature.length <= 160) signatures.add(signature);
    }
    for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }

  const threshold = Math.max(2, Math.ceil(pages.length * 0.55));
  const repeated = new Set(
    [...counts.entries()].filter(([, count]) => count >= threshold).map(([signature]) => signature)
  );
  if (repeated.size === 0) return pages;

  return pages.map((page) => {
    const lines = page.lines.filter((line) => {
      const inMargin = line.y <= page.height * 0.12 || line.y + line.height >= page.height * 0.88;
      return !inMargin || !repeated.has(marginSignature(line.text));
    });
    return {
      ...page,
      lines,
      characterCount: lines.reduce((total, line) => total + line.text.length, 0)
    };
  });
}

export function estimateBodyFontSize(pages: RawPageText[]): number {
  const sizes: number[] = [];
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.text.length > 8 && line.fontSize > 0) sizes.push(line.fontSize);
    }
  }
  const value = median(sizes);
  return value > 0 ? value : 12;
}
