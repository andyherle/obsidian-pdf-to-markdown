import type { ImageFormat } from "../types";
import { fitImageDimensions, MAX_CANVAS_PIXELS } from "./dimensions";
import { getActiveWindow } from "./dom";
import { createCanvas } from "./image-canvas";

export interface EncodedCanvas {
  bytes: ArrayBuffer;
  mime: string;
  extension: "webp" | "png" | "jpg";
  width: number;
  height: number;
  warning?: string;
}

function dataUrlToBlob(value: string): Blob | null {
  const match = value.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  try {
    const binary = getActiveWindow().atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  }
  try {
    return Promise.resolve(dataUrlToBlob(canvas.toDataURL(mime, quality)));
  } catch {
    return Promise.resolve(null);
  }
}

function requestedEncoding(format: ImageFormat): { mime: string; extension: "webp" | "png" | "jpg" } {
  if (format === "png") return { mime: "image/png", extension: "png" };
  if (format === "jpeg") return { mime: "image/jpeg", extension: "jpg" };
  return { mime: "image/webp", extension: "webp" };
}

function hasImageSignature(bytes: ArrayBuffer, extension: "webp" | "png" | "jpg"): boolean {
  const value = new Uint8Array(bytes);
  if (extension === "png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => value[index] === byte);
  }
  if (extension === "jpg") {
    return value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff;
  }
  return value.length >= 12 &&
    String.fromCharCode(...value.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...value.slice(8, 12)) === "WEBP";
}

export async function encodeCanvas(
  source: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
  maxDimension: number
): Promise<EncodedCanvas> {
  const fitted = fitImageDimensions(source.width, source.height, maxDimension);
  const { width, height } = fitted;
  const canReuseSource = format !== "jpeg" && source.width === width && source.height === height;
  const target = canReuseSource ? source : createCanvas(width, height);

  if (!canReuseSource) {
    const context = target.getContext("2d", { alpha: format !== "jpeg" });
    if (!context) {
      target.width = 1;
      target.height = 1;
      throw new Error("The image canvas could not be created.");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, 0, 0, width, height);
  }

  const requested = requestedEncoding(format);
  const warnings: string[] = [];
  if (fitted.pixelLimited) {
    warnings.push(`Very large images are limited to ${Math.round(MAX_CANVAS_PIXELS / 1_000_000)} megapixels to protect memory.`);
  }

  try {
    let blob = await canvasToBlob(target, requested.mime, format === "png" ? undefined : quality);
    if (!blob) throw new Error("The image encoder returned no data.");
    let bytes = await blob.arrayBuffer();
    let mime = requested.mime;
    let extension = requested.extension;

    if (!hasImageSignature(bytes, requested.extension)) {
      if (format === "png") throw new Error("The PNG encoder returned an unknown file format.");
      blob = await canvasToBlob(target, "image/png");
      if (!blob) throw new Error(`${requested.mime} and PNG encoding both failed.`);
      bytes = await blob.arrayBuffer();
      if (!hasImageSignature(bytes, "png")) throw new Error("The image encoder returned an unknown file format.");
      mime = "image/png";
      extension = "png";
      warnings.push(`${format === "webp" ? "WebP" : "JPEG"} is not available on this platform. The image was saved as PNG.`);
    }

    return {
      bytes,
      mime,
      extension,
      width,
      height,
      warning: warnings.length > 0 ? warnings.join(" ") : undefined
    };
  } finally {
    if (!canReuseSource) {
      target.width = 1;
      target.height = 1;
    }
  }
}

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  try {
    const digest = await getActiveWindow().crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    let fnv = 2166136261;
    let djb = 5381;
    for (const value of new Uint8Array(bytes)) {
      fnv ^= value;
      fnv = Math.imul(fnv, 16777619);
      djb = Math.imul(djb, 33) ^ value;
    }
    const size = bytes.byteLength.toString(16).padStart(8, "0");
    const first = (fnv >>> 0).toString(16).padStart(8, "0");
    const second = (djb >>> 0).toString(16).padStart(8, "0");
    return `fallback-${size}-${first}-${second}`;
  }
}
