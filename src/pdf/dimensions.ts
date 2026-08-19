export const MAX_CANVAS_PIXELS = 16_000_000;

export interface FittedDimensions {
  width: number;
  height: number;
  scale: number;
  pixelLimited: boolean;
}

interface FitOptions {
  allowUpscale?: boolean;
  maxScale?: number;
  maxPixels?: number;
}

export function fitImageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  options: FitOptions = {}
): FittedDimensions {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const longestEdge = Math.max(width, height);
  const requestedScale = Math.max(1, maxDimension) / longestEdge;
  const edgeScale = options.allowUpscale ? requestedScale : Math.min(1, requestedScale);
  const maxScale = Math.max(0.01, options.maxScale ?? Number.POSITIVE_INFINITY);
  const maxPixels = Math.max(1, options.maxPixels ?? MAX_CANVAS_PIXELS);
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, width * height));
  const scale = Math.max(1e-9, Math.min(edgeScale, maxScale, pixelScale));

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
    pixelLimited: pixelScale < Math.min(edgeScale, maxScale)
  };
}
