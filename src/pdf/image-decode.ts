import { activeDocument } from "obsidian";
import type { PdfJsLibrary } from "./pdfjs";
import { fitImageDimensions, MAX_CANVAS_PIXELS } from "./dimensions";
import { classifyRawPixels, sampleCoordinate } from "./pixels";
import { createCanvas } from "./image-canvas";

interface RawPdfImage {
  data?: ArrayLike<number> | ArrayBuffer;
  width?: number;
  height?: number;
  kind?: number;
  bitmap?: unknown;
}

export interface DecodedCanvas {
  canvas: HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  warning?: string;
}

function toUint8Array(value: ArrayLike<number> | ArrayBuffer): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return Uint8Array.from(value);
}

function makeImageData(
  raw: RawPdfImage,
  pdfjs: PdfJsLibrary,
  maxDimension: number
): { imageData: ImageData; pixelLimited: boolean; sourceWidth: number; sourceHeight: number } | null {
  const sourceWidth = Math.round(raw.width ?? 0);
  const sourceHeight = Math.round(raw.height ?? 0);
  if (!raw.data || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const source = toUint8Array(raw.data);
  const layout = classifyRawPixels(
    source.byteLength,
    sourceWidth,
    sourceHeight,
    raw.kind,
    pdfjs.ImageKind ?? {}
  );
  if (!layout) return null;

  const fitted = fitImageDimensions(sourceWidth, sourceHeight, maxDimension);
  const rgba = new Uint8ClampedArray(fitted.width * fitted.height * 4);
  const bitStride = Math.ceil(sourceWidth / 8);

  for (let targetY = 0; targetY < fitted.height; targetY += 1) {
    const sourceY = sampleCoordinate(targetY, fitted.height, sourceHeight);
    for (let targetX = 0; targetX < fitted.width; targetX += 1) {
      const sourceX = sampleCoordinate(targetX, fitted.width, sourceWidth);
      const sourcePixel = sourceY * sourceWidth + sourceX;
      const targetPixel = (targetY * fitted.width + targetX) * 4;

      if (layout === "rgba") {
        const offset = sourcePixel * 4;
        rgba[targetPixel] = source[offset] ?? 0;
        rgba[targetPixel + 1] = source[offset + 1] ?? 0;
        rgba[targetPixel + 2] = source[offset + 2] ?? 0;
        rgba[targetPixel + 3] = source[offset + 3] ?? 255;
      } else if (layout === "rgb") {
        const offset = sourcePixel * 3;
        rgba[targetPixel] = source[offset] ?? 0;
        rgba[targetPixel + 1] = source[offset + 1] ?? 0;
        rgba[targetPixel + 2] = source[offset + 2] ?? 0;
        rgba[targetPixel + 3] = 255;
      } else if (layout === "gray8") {
        const value = source[sourcePixel] ?? 0;
        rgba[targetPixel] = value;
        rgba[targetPixel + 1] = value;
        rgba[targetPixel + 2] = value;
        rgba[targetPixel + 3] = 255;
      } else {
        const byte = source[sourceY * bitStride + Math.floor(sourceX / 8)] ?? 0;
        const value = byte & (1 << (7 - (sourceX % 8))) ? 255 : 0;
        rgba[targetPixel] = value;
        rgba[targetPixel + 1] = value;
        rgba[targetPixel + 2] = value;
        rgba[targetPixel + 3] = 255;
      }
    }
  }

  const ImageDataConstructor = activeDocument.defaultView?.ImageData;
  if (!ImageDataConstructor) return null;
  return {
    imageData: new ImageDataConstructor(rgba, fitted.width, fitted.height),
    pixelLimited: fitted.pixelLimited,
    sourceWidth,
    sourceHeight
  };
}

function sourceDimensions(value: unknown): { width: number; height: number } | null {
  if (!value || typeof value !== "object") return null;
  const source = value as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  const width = source.naturalWidth ?? source.displayWidth ?? source.width ?? 0;
  const height = source.naturalHeight ?? source.displayHeight ?? source.height ?? 0;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function rawImageCandidate(value: unknown): RawPdfImage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as RawPdfImage;
  return candidate.data && candidate.width && candidate.height ? candidate : null;
}

function memoryWarning(pixelLimited: boolean): string | undefined {
  return pixelLimited
    ? `Very large images are limited to ${Math.round(MAX_CANVAS_PIXELS / 1_000_000)} megapixels to protect memory.`
    : undefined;
}

export function imageToCanvas(
  value: unknown,
  pdfjs: PdfJsLibrary,
  maxDimension: number
): DecodedCanvas | null {
  if (value && typeof value === "object" && "bitmap" in value) {
    const bitmap = (value as RawPdfImage).bitmap;
    if (bitmap && bitmap !== value) {
      const decodedBitmap = imageToCanvas(bitmap, pdfjs, maxDimension);
      if (decodedBitmap) return decodedBitmap;
    }
  }

  const raw = rawImageCandidate(value);
  if (raw) {
    const decoded = makeImageData(raw, pdfjs, maxDimension);
    if (!decoded) return null;
    const canvas = createCanvas(decoded.imageData.width, decoded.imageData.height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.putImageData(decoded.imageData, 0, 0);
    return {
      canvas,
      sourceWidth: decoded.sourceWidth,
      sourceHeight: decoded.sourceHeight,
      warning: memoryWarning(decoded.pixelLimited)
    };
  }

  const dimensions = sourceDimensions(value);
  if (!dimensions) return null;
  const fitted = fitImageDimensions(dimensions.width, dimensions.height, maxDimension);
  const canvas = createCanvas(fitted.width, fitted.height);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(value as CanvasImageSource, 0, 0, fitted.width, fitted.height);
    return {
      canvas,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      warning: memoryWarning(fitted.pixelLimited)
    };
  } catch {
    canvas.width = 1;
    canvas.height = 1;
    return null;
  }
}
