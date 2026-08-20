import { getActiveDocument } from "./dom";

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = getActiveDocument().createEl("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
