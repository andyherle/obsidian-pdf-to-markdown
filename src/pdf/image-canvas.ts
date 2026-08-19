import { activeDocument } from "obsidian";

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = activeDocument.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
