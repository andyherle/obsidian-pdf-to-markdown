import type {
  CancellationToken,
  ExtractedAsset,
  ExtractedPage,
  ExtractionResult,
  PdfToMarkdownSettings,
  ProgressCallback,
  PasswordProvider,
  RawPageText
} from "../types";
import { buildPageBlocks } from "../markdown/page";
import { generateTableSvg, svgToArrayBuffer } from "../svg/table-svg";
import { extractPageImages, hashBytes, renderPageSnapshot } from "./images";
import {
  openPdfDocument,
  throwIfCancelled,
  yieldToInterface
} from "./pdfjs";
import { detectTables } from "./tables";
import {
  estimateBodyFontSize,
  extractPageText,
  removeRepeatedMargins
} from "./text";

const IMAGE_ONLY_TEXT_LIMIT = 24;
const FULL_PAGE_IMAGE_COVERAGE = 0.72;

function warnOnce(target: string[], value: string | undefined): void {
  if (value && !target.includes(value)) target.push(value);
}

function coverage(asset: ExtractedAsset, page: RawPageText): number {
  const pageArea = Math.max(1, page.width * page.height);
  return Math.max(0, asset.bounds.width * asset.bounds.height) / pageArea;
}

function tableAssetName(page: number, index: number): string {
  return `Table ${page}-${index}.svg`;
}

async function createTableAsset(
  table: ReturnType<typeof detectTables>[number]
): Promise<ExtractedAsset> {
  const svg = generateTableSvg(table);
  const bytes = svgToArrayBuffer(svg);
  return {
    id: table.id,
    kind: "table",
    page: table.page,
    index: table.index,
    bounds: table.bounds,
    width: Math.max(1, Math.round(table.bounds.width)),
    height: Math.max(1, Math.round(table.bounds.height)),
    mime: "image/svg+xml",
    extension: "svg",
    bytes,
    hash: await hashBytes(bytes),
    fileName: tableAssetName(table.page, table.index),
    alt: `Table from page ${table.page}`
  };
}

export async function extractPdf(
  bytes: ArrayBuffer,
  settings: PdfToMarkdownSettings,
  token: CancellationToken,
  onProgress?: ProgressCallback,
  passwordProvider?: PasswordProvider
): Promise<ExtractionResult> {
  const started = performance.now();
  const warnings: string[] = [];
  const rawPages: RawPageText[] = [];
  const pages: ExtractedPage[] = [];
  const assets: ExtractedAsset[] = [];
  const { pdfjs, document } = await openPdfDocument(bytes, passwordProvider);

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfCancelled(token);
      onProgress?.({
        current: pageNumber - 1,
        total: document.numPages * 2,
        message: `Reading text from page ${pageNumber} of ${document.numPages}`
      });
      const page = await document.getPage(pageNumber);
      try {
        rawPages.push(await extractPageText(page, pageNumber));
      } finally {
        page.cleanup?.();
      }
      await yieldToInterface();
    }

    const cleanedPages = removeRepeatedMargins(rawPages, settings.removeRepeatedMargins);
    const bodyFontSize = estimateBodyFontSize(cleanedPages);

    for (let pageIndex = 0; pageIndex < cleanedPages.length; pageIndex += 1) {
      throwIfCancelled(token);
      const rawPage = cleanedPages[pageIndex];
      const pageNumber = rawPage.page;
      onProgress?.({
        current: document.numPages + pageIndex,
        total: document.numPages * 2,
        message: `Extracting page ${pageNumber} of ${document.numPages}`
      });

      const pageWarnings: string[] = [];
      const page = await document.getPage(pageNumber);
      try {
        const tables = settings.detectTables
          ? detectTables(rawPage.lines, settings.tableMinConfidence)
          : [];
        const pageAssets: ExtractedAsset[] = [];

        if (settings.tableOutput === "svg" || settings.tableOutput === "both") {
          for (const table of tables) {
            throwIfCancelled(token);
            pageAssets.push(await createTableAsset(table));
          }
        }

        const isImageOnly = rawPage.characterCount < IMAGE_ONLY_TEXT_LIMIT;
        let extractedImages: ExtractedAsset[] = [];
        if (settings.extractImages && !(isImageOnly && settings.renderImageOnlyPages)) {
          try {
            const imageResult = await extractPageImages(pdfjs, page, pageNumber, settings, token);
            extractedImages = imageResult.assets;
            for (const warning of imageResult.warnings) warnOnce(pageWarnings, warning);
          } catch (error) {
            pageWarnings.push(
              `Page ${pageNumber}: embedded image extraction failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }

        if (isImageOnly && settings.renderImageOnlyPages) {
          try {
            const snapshot = await renderPageSnapshot(page, pageNumber, settings, token);
            pageAssets.push(snapshot.asset);
            warnOnce(pageWarnings, snapshot.warning);
            extractedImages = [];
          } catch (error) {
            pageWarnings.push(
              `Page ${pageNumber}: the page image could not be created: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            if (settings.extractImages) {
              try {
                const imageResult = await extractPageImages(pdfjs, page, pageNumber, settings, token);
                extractedImages = imageResult.assets;
                for (const warning of imageResult.warnings) warnOnce(pageWarnings, warning);
              } catch (fallbackError) {
                pageWarnings.push(
                  `Page ${pageNumber}: embedded image fallback failed: ${
                    fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
                  }`
                );
              }
            }
          }
        } else if (!isImageOnly) {
          extractedImages = extractedImages.filter(
            (asset) => coverage(asset, rawPage) < FULL_PAGE_IMAGE_COVERAGE
          );
        }

        pageAssets.push(...extractedImages);
        assets.push(...pageAssets);
        const blocks = buildPageBlocks(
          rawPage.lines,
          rawPage.width,
          tables,
          pageAssets,
          bodyFontSize,
          settings
        );

        if (rawPage.characterCount === 0 && pageAssets.length === 0) {
          pageWarnings.push(
            `Page ${pageNumber} contains no extractable text or images. This plugin does not use OCR.`
          );
        }

        pages.push({
          page: pageNumber,
          width: rawPage.width,
          height: rawPage.height,
          blocks,
          warnings: pageWarnings,
          characterCount: rawPage.characterCount,
          tableCount: tables.length,
          imageCount: pageAssets.filter((asset) => asset.kind !== "table").length
        });
        for (const warning of pageWarnings) warnOnce(warnings, warning);
      } finally {
        page.cleanup?.();
      }
      await yieldToInterface();
    }

    onProgress?.({
      current: document.numPages * 2,
      total: document.numPages * 2,
      message: "Preparing preview"
    });

    const uniqueBytes = new Map<string, number>();
    for (const asset of assets) {
      if (!uniqueBytes.has(asset.hash)) uniqueBytes.set(asset.hash, asset.bytes.byteLength);
    }
    const characterCount = pages.reduce((total, page) => total + page.characterCount, 0);
    const tableCount = pages.reduce((total, page) => total + page.tableCount, 0);
    const imageCount = pages.reduce((total, page) => total + page.imageCount, 0);

    if (characterCount === 0) {
      warnOnce(
        warnings,
        "No text was found. Scanned PDFs are preserved as compressed page images because the plugin does not use OCR."
      );
    }

    return {
      pages,
      assets,
      warnings,
      metrics: {
        pageCount: document.numPages,
        characterCount,
        tableCount,
        imageCount,
        assetBytes: [...uniqueBytes.values()].reduce((total, value) => total + value, 0),
        elapsedMs: performance.now() - started
      }
    };
  } finally {
    try {
      await document.cleanup?.();
    } catch {
      // Cleanup must not replace a successful conversion or the original error.
    }
    try {
      await document.destroy?.();
    } catch {
      // Destroy is best effort after all PDF data has been copied into plugin-owned memory.
    }
  }
}
