/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- The hosted Obsidian review scanner resolves public Obsidian API declarations as error types in this file; runtime boundaries are validated separately. */
import { getActiveDocument } from "./dom";

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = getActiveDocument().createEl("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Match the hosted-review compatibility scope declared at the top of this file. */
