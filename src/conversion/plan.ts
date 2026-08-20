/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- The hosted Obsidian review scanner resolves public Obsidian API declarations as error types in this file; runtime boundaries are validated separately. */
import type { App, TFile } from "obsidian";
import type {
  CancellationToken,
  ConversionOptions,
  ConversionPlan,
  ExtractedAsset,
  ExtractionResult,
  PasswordProvider,
  ProgressCallback
} from "../types";
import {
  availableFilePath,
  availableFolderPath,
  dirname,
  joinPath,
  safeFileName,
  sanitizeVaultFolder
} from "../path";
import { collectLinkPlans } from "../links/links";
import { buildMarkdownTemplate, buildPlainPreview } from "../markdown/document";
import { extractPdf } from "../pdf/extract";

interface OutputLayout {
  assets: ExtractedAsset[];
  notePath: string;
  outputFolder: string;
  sourceDestination?: string;
  warnings: string[];
}

function noteTitle(value: string, fallback: string): string {
  return safeFileName(value.replace(/\.md$/i, ""), fallback);
}

function assetPathMap(assets: ExtractedAsset[], folder: string): Map<string, string> {
  const paths = new Map<string, string>();
  const used = new Set<string>();
  for (const asset of assets) {
    const existing = paths.get(asset.hash);
    if (existing) continue;
    const dot = asset.fileName.lastIndexOf(".");
    const stem = dot > 0 ? asset.fileName.slice(0, dot) : asset.fileName;
    const suffix = dot > 0 ? asset.fileName.slice(dot) : "";
    let name = asset.fileName;
    let index = 2;
    while (used.has(name.toLowerCase())) {
      name = `${stem} (${index})${suffix}`;
      index += 1;
    }
    used.add(name.toLowerCase());
    paths.set(asset.hash, joinPath(folder, name));
  }
  return paths;
}

function planOutputLayout(
  app: App,
  source: TFile,
  assets: ExtractedAsset[],
  options: ConversionOptions
): OutputLayout {
  const warnings: string[] = [];
  const title = noteTitle(options.title, source.basename);
  const sourceFolder = dirname(source.path);
  let notePath: string;
  let outputFolder: string;
  let plannedAssets: ExtractedAsset[] = assets.map((asset) => ({ ...asset, plannedPath: undefined }));

  if (plannedAssets.length > 0 && options.assetLocation === "note-folder") {
    outputFolder = availableFolderPath(app, joinPath(sourceFolder, title));
    notePath = joinPath(outputFolder, `${title}.md`);
    const byHash = assetPathMap(plannedAssets, outputFolder);
    plannedAssets = plannedAssets.map((asset) => ({
      ...asset,
      plannedPath: byHash.get(asset.hash)
    }));
  } else {
    outputFolder = sourceFolder;
    notePath = availableFilePath(app, joinPath(sourceFolder, `${title}.md`));
  }

  let sourceDestination: string | undefined;
  if (options.sourceAction === "move") {
    const moveFolder = sanitizeVaultFolder(options.moveFolder);
    if (!moveFolder) {
      throw new Error("Choose a Vault folder for the source PDF.");
    }
    const desired = joinPath(moveFolder, source.name);
    if (desired.toLowerCase() === source.path.toLowerCase()) {
      warnings.push("The PDF is already in the selected move folder. It will stay in place.");
    } else {
      sourceDestination = availableFilePath(app, desired);
    }
  }

  return { assets: plannedAssets, notePath, outputFolder, sourceDestination, warnings };
}

function assemblePlan(
  app: App,
  source: TFile,
  sourcePath: string,
  sourceMtime: number,
  sourceSize: number,
  options: ConversionOptions,
  extraction: ExtractionResult,
  linkFiles: ConversionPlan["linkFiles"]
): ConversionPlan {
  const layout = planOutputLayout(app, source, extraction.assets, options);
  const markdownTemplate = buildMarkdownTemplate(extraction.pages, options);
  const markdown = buildPlainPreview(markdownTemplate, layout.assets);
  return {
    source,
    sourcePath,
    sourceMtime,
    sourceSize,
    options: { ...options, title: noteTitle(options.title, source.basename) },
    pages: extraction.pages,
    assets: layout.assets,
    markdownTemplate,
    markdown,
    notePath: layout.notePath,
    outputFolder: layout.outputFolder,
    sourceDestination: layout.sourceDestination,
    linkFiles,
    warnings: [...extraction.warnings, ...layout.warnings],
    metrics: {
      ...extraction.metrics,
      linkCount: linkFiles.reduce((total, file) => total + file.references.length, 0)
    }
  };
}

export async function buildConversionPlan(
  app: App,
  source: TFile,
  options: ConversionOptions,
  token: CancellationToken,
  onProgress?: ProgressCallback,
  passwordProvider?: PasswordProvider
): Promise<ConversionPlan> {
  const sourceMtime = source.stat.mtime;
  const sourceSize = source.stat.size;
  onProgress?.({ current: 0, total: 1, message: "Reading PDF" });
  const bytes = await app.vault.readBinary(source);
  const extraction = await extractPdf(bytes, options, token, onProgress, passwordProvider);
  if (source.stat.mtime !== sourceMtime || source.stat.size !== sourceSize) {
    throw new Error("The PDF changed while it was being converted. Start the conversion again.");
  }
  onProgress?.({ current: 1, total: 1, message: "Finding PDF links" });
  const linkFiles = options.updateLinks ? await collectLinkPlans(app, source) : [];
  return assemblePlan(app, source, source.path, sourceMtime, sourceSize, options, extraction, linkFiles);
}

export function retargetConversionPlan(
  app: App,
  plan: ConversionPlan,
  changes: Pick<ConversionOptions, "title" | "sourceAction" | "moveFolder">
): ConversionPlan {
  const options: ConversionOptions = { ...plan.options, ...changes };
  const extraction: ExtractionResult = {
    pages: plan.pages,
    assets: plan.assets.map((asset) => ({ ...asset, plannedPath: undefined })),
    warnings: plan.warnings.filter(
      (warning) =>
        !warning.startsWith("The PDF move folder") &&
        !warning.startsWith("The PDF is already in")
    ),
    metrics: {
      pageCount: plan.metrics.pageCount,
      characterCount: plan.metrics.characterCount,
      tableCount: plan.metrics.tableCount,
      imageCount: plan.metrics.imageCount,
      assetBytes: plan.metrics.assetBytes,
      elapsedMs: plan.metrics.elapsedMs
    }
  };
  return assemblePlan(
    app,
    plan.source,
    plan.sourcePath,
    plan.sourceMtime,
    plan.sourceSize,
    options,
    extraction,
    plan.linkFiles
  );
}

/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Match the hosted-review compatibility scope declared at the top of this file. */
