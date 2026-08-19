import type { CancellationToken, ExtractedAsset, PdfToMarkdownSettings } from "../types";
import type { PdfPageProxy } from "./pdfjs";
import { fitImageDimensions, MAX_CANVAS_PIXELS } from "./dimensions";
import { getActiveWindow } from "./dom";
import { createCanvas } from "./image-canvas";
import { encodeCanvas, hashBytes } from "./image-encode";
import { throwIfCancelled } from "./pdfjs";

export async function renderPageSnapshot(
  page: PdfPageProxy,
  pageNumber: number,
  settings: PdfToMarkdownSettings,
  token: CancellationToken
): Promise<{ asset: ExtractedAsset; warning?: string }> {
  throwIfCancelled(token);
  const base = page.getViewport({ scale: 1 });
  const fitted = fitImageDimensions(base.width, base.height, settings.maxImageDimension, {
    allowUpscale: true,
    maxScale: 4
  });
  const viewport = page.getViewport({ scale: fitted.scale });
  const canvas = createCanvas(fitted.width, fitted.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(`Page ${pageNumber}: the page canvas could not be created.`);
  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
    intent: "display",
    background: "#ffffff"
  });
  const renderWindow = getActiveWindow();
  const cancellationPoll = renderWindow.setInterval(() => {
    if (token.cancelled) renderTask.cancel?.();
  }, 50);
  try {
    await renderTask.promise;
  } catch (error) {
    throwIfCancelled(token);
    throw error;
  } finally {
    renderWindow.clearInterval(cancellationPoll);
  }
  throwIfCancelled(token);
  try {
    const encoded = await encodeCanvas(
      canvas,
      settings.imageFormat,
      settings.imageQuality,
      settings.maxImageDimension
    );
    const hash = await hashBytes(encoded.bytes);
    const snapshotWarnings = [
      fitted.pixelLimited
        ? `Very large pages are limited to ${Math.round(MAX_CANVAS_PIXELS / 1_000_000)} megapixels to protect memory.`
        : undefined,
      encoded.warning
    ].filter((value): value is string => Boolean(value));
    return {
      asset: {
        id: `page-${pageNumber}`,
        kind: "page",
        page: pageNumber,
        index: 1,
        bounds: { x: 0, y: 0, width: base.width, height: base.height },
        width: encoded.width,
        height: encoded.height,
        mime: encoded.mime,
        extension: encoded.extension,
        bytes: encoded.bytes,
        hash,
        fileName: `Page ${pageNumber}.${encoded.extension}`,
        alt: `Page ${pageNumber}`
      },
      warning: snapshotWarnings.length > 0 ? snapshotWarnings.join(" ") : undefined
    };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}
