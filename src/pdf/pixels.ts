export type RawPixelLayout = "rgba" | "rgb" | "gray8" | "gray1";

export interface PdfImageKinds {
  RGBA_32BPP?: number;
  RGB_24BPP?: number;
  GRAYSCALE_1BPP?: number;
}

function kindMatches(kind: number | undefined, expected: number | undefined): boolean {
  return typeof kind === "number" && typeof expected === "number" && kind === expected;
}

export function classifyRawPixels(
  byteLength: number,
  width: number,
  height: number,
  kind: number | undefined,
  kinds: PdfImageKinds
): RawPixelLayout | null {
  const pixels = width * height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(pixels) ||
    pixels <= 0
  ) {
    return null;
  }

  const rgbaBytes = pixels * 4;
  const rgbBytes = pixels * 3;
  const grayBytes = pixels;
  const bitBytes = Math.ceil(width / 8) * height;

  if (kindMatches(kind, kinds.RGBA_32BPP)) return byteLength >= rgbaBytes ? "rgba" : null;
  if (kindMatches(kind, kinds.RGB_24BPP)) return byteLength >= rgbBytes ? "rgb" : null;
  if (kindMatches(kind, kinds.GRAYSCALE_1BPP)) return byteLength >= bitBytes ? "gray1" : null;

  if (byteLength >= rgbaBytes) return "rgba";
  if (byteLength >= rgbBytes) return "rgb";
  if (byteLength >= grayBytes) return "gray8";
  if (byteLength >= bitBytes) return "gray1";
  return null;
}

export function sampleCoordinate(targetIndex: number, targetSize: number, sourceSize: number): number {
  if (targetSize <= 1 || sourceSize <= 1) return 0;
  return Math.min(sourceSize - 1, Math.floor((targetIndex + 0.5) * sourceSize / targetSize));
}
