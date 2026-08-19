import type { CancellationToken, ExtractedAsset, PdfToMarkdownSettings } from "../types";
import type { PdfJsLibrary, PdfObjectStore, PdfPageProxy } from "./pdfjs";
import { getActiveWindow } from "./dom";
import { imageToCanvas } from "./image-decode";
import { encodeCanvas, hashBytes, type EncodedCanvas } from "./image-encode";
import { IDENTITY, imageBounds, multiply, transformFromArgs, type Matrix } from "./image-geometry";
import { throwIfCancelled, yieldToInterface } from "./pdfjs";

export { hashBytes } from "./image-encode";
export { renderPageSnapshot } from "./page-snapshot";

function objectStoreHasValue(store: PdfObjectStore, id: string): boolean {
  if (typeof store.has !== "function") return false;
  try {
    return store.has(id);
  } catch {
    return false;
  }
}

function getPdfObject(
  stores: Array<PdfObjectStore | undefined>,
  id: string,
  timeoutMs = 1200
): Promise<unknown> {
  const available = stores.filter((store): store is PdfObjectStore => Boolean(store));
  if (available.length === 0) return Promise.resolve(null);
  const resolved = available.filter((store) => objectStoreHasValue(store, id));
  const candidates = resolved.length > 0 ? resolved : available;
  const activeWindow = getActiveWindow();

  return new Promise((resolve) => {
    let settled = false;
    let failed = 0;
    const finish = (value: unknown): void => {
      if (settled || value === undefined || value === null) return;
      settled = true;
      activeWindow.clearTimeout(timer);
      resolve(value);
    };
    const fail = (): void => {
      failed += 1;
      if (!settled && failed >= candidates.length) {
        settled = true;
        activeWindow.clearTimeout(timer);
        resolve(null);
      }
    };
    const timer = activeWindow.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    for (const store of candidates) {
      try {
        const immediate = store.get(id, finish);
        if (immediate !== undefined && immediate !== null) finish(immediate);
      } catch {
        fail();
      }
    }
  });
}

export async function extractPageImages(
  pdfjs: PdfJsLibrary,
  page: PdfPageProxy,
  pageNumber: number,
  settings: PdfToMarkdownSettings,
  token: CancellationToken
): Promise<{ assets: ExtractedAsset[]; warnings: string[] }> {
  if (!settings.extractImages) return { assets: [], warnings: [] };
  const viewport = page.getViewport({ scale: 1 });
  const operatorList = await page.getOperatorList();
  const ops = pdfjs.OPS;
  const imageOps = new Set<number>(
    [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter(
      (value): value is number => typeof value === "number"
    )
  );
  const assets: ExtractedAsset[] = [];
  const warnings: string[] = [];
  const stack: Matrix[] = [];
  const seenPlacements = new Set<string>();
  const encodedByObject = new Map<string, EncodedCanvas & { hash: string }>();
  let matrix: Matrix = [...IDENTITY];
  let imageIndex = 1;

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    throwIfCancelled(token);
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] ?? [];

    if (operation === ops.save) {
      stack.push([...matrix]);
      continue;
    }
    if (operation === ops.restore) {
      matrix = stack.pop() ?? [...IDENTITY];
      continue;
    }
    if (operation === ops.transform) {
      const transform = transformFromArgs(args);
      if (transform) matrix = multiply(matrix, transform);
      continue;
    }
    if (!imageOps.has(operation)) continue;

    const inline = operation === ops.paintInlineImageXObject;
    const objectId = inline ? `inline-${index}` : String(args[0] ?? "");
    const placementKey = `${objectId}:${matrix.map((value) => Math.round(value * 10) / 10).join(",")}`;
    if (seenPlacements.has(placementKey)) continue;
    seenPlacements.add(placementKey);

    const cached = inline ? undefined : encodedByObject.get(objectId);
    if (cached) {
      assets.push({
        id: `image-${pageNumber}-${imageIndex}`,
        kind: "image",
        page: pageNumber,
        index: imageIndex,
        bounds: imageBounds(matrix, viewport),
        width: cached.width,
        height: cached.height,
        mime: cached.mime,
        extension: cached.extension,
        bytes: cached.bytes,
        hash: cached.hash,
        fileName: `Figure ${pageNumber}-${imageIndex}.${cached.extension}`,
        alt: `Figure from page ${pageNumber}`
      });
      if (cached.warning && !warnings.includes(cached.warning)) warnings.push(cached.warning);
      imageIndex += 1;
      continue;
    }

    let value: unknown;
    if (inline) {
      value = args[0];
    } else {
      value = await getPdfObject([page.objs, page.commonObjs], objectId);
    }
    if (!value) continue;

    const decoded = imageToCanvas(value, pdfjs, settings.maxImageDimension);
    if (!decoded) {
      warnings.push(`Page ${pageNumber}: one embedded image could not be decoded.`);
      continue;
    }
    const source = decoded.canvas;
    if (decoded.warning && !warnings.includes(decoded.warning)) warnings.push(decoded.warning);
    if (Math.min(decoded.sourceWidth, decoded.sourceHeight) < settings.minImageDimension) {
      source.width = 1;
      source.height = 1;
      continue;
    }

    try {
      const encoded = await encodeCanvas(
        source,
        settings.imageFormat,
        settings.imageQuality,
        settings.maxImageDimension
      );
      const hash = await hashBytes(encoded.bytes);
      if (!inline) {
        encodedByObject.set(objectId, { ...encoded, hash });
      }
      const bounds = imageBounds(matrix, viewport);
      assets.push({
        id: `image-${pageNumber}-${imageIndex}`,
        kind: "image",
        page: pageNumber,
        index: imageIndex,
        bounds,
        width: encoded.width,
        height: encoded.height,
        mime: encoded.mime,
        extension: encoded.extension,
        bytes: encoded.bytes,
        hash,
        fileName: `Figure ${pageNumber}-${imageIndex}.${encoded.extension}`,
        alt: `Figure from page ${pageNumber}`
      });
      if (encoded.warning && !warnings.includes(encoded.warning)) warnings.push(encoded.warning);
      imageIndex += 1;
    } catch (error) {
      warnings.push(`Page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      source.width = 1;
      source.height = 1;
    }
    await yieldToInterface();
  }

  return { assets, warnings };
}
