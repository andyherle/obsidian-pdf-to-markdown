import type { TFile } from "obsidian";

export type SourceAction = "keep" | "trash" | "move";
export type AssetLocation = "note-folder" | "vault-default";
export type ImageFormat = "webp" | "png" | "jpeg";
export type TableOutput = "markdown" | "svg" | "both";

export interface PdfToMarkdownSettings {
  sourceAction: SourceAction;
  moveFolder: string;
  assetLocation: AssetLocation;
  extractImages: boolean;
  imageFormat: ImageFormat;
  imageQuality: number;
  maxImageDimension: number;
  minImageDimension: number;
  renderImageOnlyPages: boolean;
  detectTables: boolean;
  tableOutput: TableOutput;
  tableMinConfidence: number;
  includePageHeadings: boolean;
  removeRepeatedMargins: boolean;
  updateLinks: boolean;
  openAfterConversion: boolean;
}

export const DEFAULT_SETTINGS: PdfToMarkdownSettings = {
  sourceAction: "keep",
  moveFolder: "PDF Archive",
  assetLocation: "note-folder",
  extractImages: true,
  imageFormat: "webp",
  imageQuality: 0.82,
  maxImageDimension: 2200,
  minImageDimension: 96,
  renderImageOnlyPages: true,
  detectTables: true,
  tableOutput: "markdown",
  tableMinConfidence: 0.68,
  includePageHeadings: true,
  removeRepeatedMargins: true,
  updateLinks: true,
  openAfterConversion: true
};


function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

export function normalizeSettings(value: Partial<PdfToMarkdownSettings> | null | undefined): PdfToMarkdownSettings {
  const saved = value ?? {};
  return {
    sourceAction: oneOf(saved.sourceAction, ["keep", "trash", "move"] as const, DEFAULT_SETTINGS.sourceAction),
    moveFolder: typeof saved.moveFolder === "string" ? saved.moveFolder : DEFAULT_SETTINGS.moveFolder,
    assetLocation: oneOf(saved.assetLocation, ["note-folder", "vault-default"] as const, DEFAULT_SETTINGS.assetLocation),
    extractImages: typeof saved.extractImages === "boolean" ? saved.extractImages : DEFAULT_SETTINGS.extractImages,
    imageFormat: oneOf(saved.imageFormat, ["webp", "png", "jpeg"] as const, DEFAULT_SETTINGS.imageFormat),
    imageQuality: clamp(saved.imageQuality, 0.45, 1, DEFAULT_SETTINGS.imageQuality),
    maxImageDimension: Math.round(clamp(saved.maxImageDimension, 320, 8000, DEFAULT_SETTINGS.maxImageDimension)),
    minImageDimension: Math.round(clamp(saved.minImageDimension, 1, 1000, DEFAULT_SETTINGS.minImageDimension)),
    renderImageOnlyPages: typeof saved.renderImageOnlyPages === "boolean"
      ? saved.renderImageOnlyPages
      : DEFAULT_SETTINGS.renderImageOnlyPages,
    detectTables: typeof saved.detectTables === "boolean" ? saved.detectTables : DEFAULT_SETTINGS.detectTables,
    tableOutput: oneOf(saved.tableOutput, ["markdown", "svg", "both"] as const, DEFAULT_SETTINGS.tableOutput),
    tableMinConfidence: clamp(saved.tableMinConfidence, 0.5, 0.9, DEFAULT_SETTINGS.tableMinConfidence),
    includePageHeadings: typeof saved.includePageHeadings === "boolean"
      ? saved.includePageHeadings
      : DEFAULT_SETTINGS.includePageHeadings,
    removeRepeatedMargins: typeof saved.removeRepeatedMargins === "boolean"
      ? saved.removeRepeatedMargins
      : DEFAULT_SETTINGS.removeRepeatedMargins,
    updateLinks: typeof saved.updateLinks === "boolean" ? saved.updateLinks : DEFAULT_SETTINGS.updateLinks,
    openAfterConversion: typeof saved.openAfterConversion === "boolean"
      ? saved.openAfterConversion
      : DEFAULT_SETTINGS.openAfterConversion
  };
}

export interface ConversionOptions extends PdfToMarkdownSettings {
  title: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextSpan extends Bounds {
  id: string;
  text: string;
  page: number;
  fontSize: number;
  fontName: string;
  bold: boolean;
  hasEol: boolean;
}

export interface PdfLine extends Bounds {
  id: string;
  page: number;
  spans: PdfTextSpan[];
  text: string;
  fontSize: number;
  bold: boolean;
  pageWidth: number;
  pageHeight: number;
}

export interface RawPageText {
  page: number;
  width: number;
  height: number;
  spans: PdfTextSpan[];
  lines: PdfLine[];
  characterCount: number;
}

export interface ExtractedTable {
  id: string;
  page: number;
  index: number;
  rows: string[][];
  bounds: Bounds;
  confidence: number;
  consumedLineIds: string[];
}

export type ExtractedAssetKind = "image" | "page" | "table";

export interface ExtractedAsset {
  id: string;
  kind: ExtractedAssetKind;
  page: number;
  index: number;
  bounds: Bounds;
  width: number;
  height: number;
  mime: string;
  extension: "webp" | "png" | "jpg" | "svg";
  bytes: ArrayBuffer;
  hash: string;
  fileName: string;
  alt: string;
  plannedPath?: string;
}

export interface PageBlock {
  kind: "markdown" | "asset";
  order: number;
  markdown?: string;
  assetId?: string;
}

export interface ExtractedPage {
  page: number;
  width: number;
  height: number;
  blocks: PageBlock[];
  warnings: string[];
  characterCount: number;
  tableCount: number;
  imageCount: number;
}

export interface ExtractionMetrics {
  pageCount: number;
  characterCount: number;
  tableCount: number;
  imageCount: number;
  assetBytes: number;
  elapsedMs: number;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  assets: ExtractedAsset[];
  warnings: string[];
  metrics: ExtractionMetrics;
}

export type LinkStyle = "wiki" | "markdown";

export interface LinkReferencePlan {
  start: number;
  end: number;
  original: string;
  style: LinkStyle;
  embed: boolean;
  alias: string;
  subpath: string;
}

export interface LinkFilePlan {
  file: TFile;
  references: LinkReferencePlan[];
  originalMtime: number;
  originalSize: number;
}

export interface ConversionMetrics extends ExtractionMetrics {
  linkCount: number;
}

export interface ConversionPlan {
  source: TFile;
  sourcePath: string;
  sourceMtime: number;
  sourceSize: number;
  options: ConversionOptions;
  pages: ExtractedPage[];
  assets: ExtractedAsset[];
  markdownTemplate: string;
  markdown: string;
  notePath: string;
  outputFolder: string;
  sourceDestination?: string;
  linkFiles: LinkFilePlan[];
  warnings: string[];
  metrics: ConversionMetrics;
}

export interface AppliedLinkChange {
  file: TFile;
  before: string;
  after: string;
}

export interface ApplyResult {
  note: TFile;
  assets: TFile[];
  updatedLinks: number;
  sourceAction: SourceAction;
  warnings: string[];
}

export interface ProgressUpdate {
  current: number;
  total: number;
  message: string;
}

export interface CancellationToken {
  readonly cancelled: boolean;
}

export type ProgressCallback = (update: ProgressUpdate) => void;
export type PasswordProvider = (incorrect: boolean) => Promise<string | null>;
