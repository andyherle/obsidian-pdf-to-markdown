import type { ExtractedTable, PdfLine, PdfTextSpan } from "../types";

interface TableCellCandidate {
  x: number;
  right: number;
  text: string;
}

interface TableRowCandidate {
  line: PdfLine;
  cells: TableCellCandidate[];
}

interface AnchorCluster {
  x: number;
  values: number[];
  rows: Set<string>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function joinCellSpans(spans: PdfTextSpan[]): string {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  let value = "";
  let previousRight = Number.NEGATIVE_INFINITY;
  for (const span of sorted) {
    const text = span.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const gap = span.x - previousRight;
    if (value && gap > Math.max(1.5, span.fontSize * 0.15)) value += " ";
    value += text;
    previousRight = span.x + span.width;
  }
  return value.replace(/\s+/g, " ").trim();
}

function cellsForLine(line: PdfLine): TableCellCandidate[] {
  const spans = [...line.spans].sort((a, b) => a.x - b.x);
  if (spans.length < 2) return [];
  const fontSize = median(spans.map((span) => span.fontSize)) || line.fontSize;
  const gapThreshold = Math.max(14, fontSize * 1.45);
  const groups: PdfTextSpan[][] = [];
  let current: PdfTextSpan[] = [];
  let previousRight = Number.NEGATIVE_INFINITY;

  for (const span of spans) {
    const gap = span.x - previousRight;
    if (current.length > 0 && gap > gapThreshold) {
      groups.push(current);
      current = [];
    }
    current.push(span);
    previousRight = Math.max(previousRight, span.x + span.width);
  }
  if (current.length > 0) groups.push(current);
  if (groups.length < 2) return [];

  return groups.map((group) => ({
    x: Math.min(...group.map((span) => span.x)),
    right: Math.max(...group.map((span) => span.x + span.width)),
    text: joinCellSpans(group)
  }));
}

function groupCandidateRows(lines: PdfLine[]): TableRowCandidate[][] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TableRowCandidate[][] = [];
  let current: TableRowCandidate[] = [];

  const flush = (): void => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };

  for (const line of sorted) {
    const cells = cellsForLine(line);
    if (cells.length < 2) {
      flush();
      continue;
    }
    if (current.length > 0) {
      const previous = current[current.length - 1].line;
      const gap = line.y - (previous.y + previous.height);
      const maxGap = Math.max(28, median([line.height, previous.height]) * 2.2);
      if (gap > maxGap) flush();
    }
    current.push({ line, cells });
  }
  flush();
  return groups;
}

function clusterAnchors(rows: TableRowCandidate[], tolerance: number): AnchorCluster[] {
  const clusters: AnchorCluster[] = [];
  const positions = rows.flatMap((row) => row.cells.map((cell) => ({ x: cell.x, rowId: row.line.id })));
  positions.sort((a, b) => a.x - b.x);

  for (const position of positions) {
    let best: AnchorCluster | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      const distance = Math.abs(cluster.x - position.x);
      if (distance <= tolerance && distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    if (best) {
      best.values.push(position.x);
      best.rows.add(position.rowId);
      best.x = median(best.values);
    } else {
      clusters.push({ x: position.x, values: [position.x], rows: new Set([position.rowId]) });
    }
  }

  return clusters
    .filter((cluster) => cluster.rows.size >= 2)
    .sort((a, b) => a.x - b.x);
}

function mapRows(rows: TableRowCandidate[], anchors: AnchorCluster[], tolerance: number): {
  rows: string[][];
  filled: number;
  distanceScore: number;
  consumedRows: TableRowCandidate[];
} {
  const mapped: string[][] = [];
  const consumedRows: TableRowCandidate[] = [];
  let filled = 0;
  let distanceTotal = 0;
  let distanceCount = 0;

  for (const row of rows) {
    const values = Array.from({ length: anchors.length }, () => "");
    for (const cell of row.cells) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < anchors.length; index += 1) {
        const distance = Math.abs(cell.x - anchors[index].x);
        if (distance < bestDistance) {
          bestIndex = index;
          bestDistance = distance;
        }
      }
      if (bestIndex < 0 || bestDistance > tolerance * 2.2) continue;
      values[bestIndex] = values[bestIndex] ? `${values[bestIndex]} ${cell.text}` : cell.text;
      distanceTotal += Math.min(1, bestDistance / Math.max(1, tolerance * 2.2));
      distanceCount += 1;
    }
    const populated = values.filter(Boolean).length;
    if (populated >= 2) {
      filled += populated;
      mapped.push(values.map((value) => value.trim()));
      consumedRows.push(row);
    }
  }

  return {
    rows: mapped,
    filled,
    distanceScore: distanceCount === 0 ? 0 : 1 - distanceTotal / distanceCount,
    consumedRows
  };
}

function scoreTable(rows: string[][], filled: number, distanceScore: number): number {
  if (rows.length < 2 || rows[0].length < 2) return 0;
  const columns = rows[0].length;
  const density = filled / (rows.length * columns);
  const rowScore = Math.min(1, (rows.length - 1) / 4);
  const columnScore = Math.min(1, (columns - 1) / 3);
  const averageLength = rows.flat().reduce((total, value) => total + value.length, 0) / (rows.length * columns);
  const brevityScore = averageLength <= 45 ? 1 : Math.max(0, 1 - (averageLength - 45) / 100);
  return density * 0.38 + distanceScore * 0.27 + rowScore * 0.18 + columnScore * 0.08 + brevityScore * 0.09;
}

function boundsForRows(rows: TableRowCandidate[]): { x: number; y: number; width: number; height: number } {
  const lines = rows.map((row) => row.line);
  const x = Math.min(...lines.map((line) => line.x));
  const y = Math.min(...lines.map((line) => line.y));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const bottom = Math.max(...lines.map((line) => line.y + line.height));
  return { x, y, width: right - x, height: bottom - y };
}

function looksLikeNarrativeColumns(rows: string[][]): boolean {
  if (rows[0]?.length !== 2 || rows.length >= 4) return false;
  const lengths = rows.flat().map((value) => value.length).filter((value) => value > 0);
  if (lengths.length === 0) return false;
  return median(lengths) > 55;
}

export function detectTables(lines: PdfLine[], minimumConfidence: number): ExtractedTable[] {
  const groups = groupCandidateRows(lines);
  const tables: ExtractedTable[] = [];
  let index = 1;

  for (const group of groups) {
    const fontSize = median(group.map((row) => row.line.fontSize)) || 12;
    const tolerance = Math.max(8, fontSize * 0.85);
    const anchors = clusterAnchors(group, tolerance);
    if (anchors.length < 2 || anchors.length > 12) continue;
    const mapped = mapRows(group, anchors, tolerance);
    if (mapped.rows.length < 2 || looksLikeNarrativeColumns(mapped.rows)) continue;
    const confidence = scoreTable(mapped.rows, mapped.filled, mapped.distanceScore);
    if (confidence < minimumConfidence) continue;
    const bounds = boundsForRows(mapped.consumedRows);
    if (bounds.width < (group[0]?.line.pageWidth ?? 0) * 0.16) continue;

    tables.push({
      id: `table-${group[0].line.page}-${index}`,
      page: group[0].line.page,
      index,
      rows: mapped.rows,
      bounds,
      confidence,
      consumedLineIds: mapped.consumedRows.map((row) => row.line.id)
    });
    index += 1;
  }

  return tables;
}
