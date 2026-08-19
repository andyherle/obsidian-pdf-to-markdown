import type { Bounds } from "../types";
import type { PdfViewport } from "./pdfjs";

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

function applyMatrix(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  };
}

export function imageBounds(matrix: Matrix, viewport: PdfViewport): Bounds {
  const mapped = viewport.transform?.length === 6
    ? multiply(viewport.transform.slice(0, 6) as Matrix, matrix)
    : matrix;
  const points = [
    applyMatrix(mapped, 0, 0),
    applyMatrix(mapped, 1, 0),
    applyMatrix(mapped, 0, 1),
    applyMatrix(mapped, 1, 1)
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: viewport.transform?.length === 6 ? Math.max(0, minY) : Math.max(0, viewport.height - maxY),
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

export function transformFromArgs(args: unknown[]): Matrix | null {
  if (args.length < 6 || !args.slice(0, 6).every((value) => typeof value === "number")) return null;
  return args.slice(0, 6) as Matrix;
}
