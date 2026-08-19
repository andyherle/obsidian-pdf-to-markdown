import type { ExtractedAsset, ExtractedPage, PdfToMarkdownSettings } from "../types";
import { normalizeMarkdownTables } from "./tables";

const ASSET_PATTERN = /\{\{PDFMD_ASSET:([^}]+)\}\}/g;

function pageMarkdown(page: ExtractedPage, settings: PdfToMarkdownSettings): string {
  const parts: string[] = [];
  if (settings.includePageHeadings) parts.push(`## Page ${page.page}`);

  for (const block of page.blocks) {
    if (block.kind === "asset" && block.assetId) {
      parts.push(`{{PDFMD_ASSET:${block.assetId}}}`);
    } else if (block.markdown?.trim()) {
      parts.push(block.markdown.trim());
    }
  }

  return parts.join("\n\n").trim();
}

export function buildMarkdownTemplate(
  pages: ExtractedPage[],
  settings: PdfToMarkdownSettings
): string {
  const value = pages
    .map((page) => pageMarkdown(page, settings))
    .filter(Boolean)
    .join("\n\n---\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalizeMarkdownTables(value) + (value ? "\n" : "");
}

export function resolveAssetPlaceholders(
  template: string,
  resolver: (assetId: string) => string
): string {
  return template
    .replace(ASSET_PATTERN, (_match, assetId: string) => resolver(assetId.trim()))
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

export function buildPlainPreview(
  template: string,
  assets: ExtractedAsset[]
): string {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return resolveAssetPlaceholders(template, (assetId) => {
    const asset = byId.get(assetId);
    if (!asset) return `> [!warning] Missing generated asset: ${assetId}`;
    return `![${asset.alt}](${encodeURI(asset.fileName)})`;
  });
}

export function assetIdsInTemplate(template: string): string[] {
  const result: string[] = [];
  for (const match of template.matchAll(ASSET_PATTERN)) result.push(match[1].trim());
  return result;
}
