import { TFolder, type App, type TFile } from "obsidian";
import type {
  AppliedLinkChange,
  ApplyResult,
  ConversionPlan,
  ExtractedAsset
} from "../types";
import { dirname, ensureFolder } from "../path";
import { resolveAssetPlaceholders } from "../markdown/document";
import { applyLinkPlans, restoreLinkChanges } from "../links/links";

interface WrittenAsset {
  asset: ExtractedAsset;
  file: TFile;
}

async function trashGenerated(app: App, files: TFile[], folderPath: string): Promise<void> {
  for (const file of [...files].reverse()) {
    try {
      const current = app.vault.getAbstractFileByPath(file.path);
      if (current) await app.fileManager.trashFile(current);
    } catch {
      // Rollback is best effort. The source PDF is still untouched at this stage.
    }
  }
  if (!folderPath) return;
  try {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder && folder.children.length === 0) {
      await app.fileManager.trashFile(folder);
    }
  } catch {
    // An empty output folder is safer than a permanent delete.
  }
}

function ensurePlanStillCurrent(app: App, plan: ConversionPlan): void {
  const current = app.vault.getAbstractFileByPath(plan.sourcePath);
  if (
    current !== plan.source ||
    plan.source.path !== plan.sourcePath ||
    plan.source.stat.mtime !== plan.sourceMtime ||
    plan.source.stat.size !== plan.sourceSize
  ) {
    throw new Error("The PDF changed or moved after the preview was created. Start the conversion again.");
  }
}

async function createAssetFiles(
  app: App,
  plan: ConversionPlan,
  note: TFile,
  created: TFile[]
): Promise<{ written: WrittenAsset[]; byId: Map<string, TFile> }> {
  const written: WrittenAsset[] = [];
  const byHash = new Map<string, TFile>();
  const byId = new Map<string, TFile>();

  for (const asset of plan.assets) {
    const duplicate = byHash.get(asset.hash);
    if (duplicate) {
      byId.set(asset.id, duplicate);
      continue;
    }

    let path: string;
    if (plan.options.assetLocation === "note-folder") {
      if (!asset.plannedPath) throw new Error(`No output path was prepared for ${asset.fileName}.`);
      path = asset.plannedPath;
      if (app.vault.getAbstractFileByPath(path)) {
        throw new Error(`${path} was created after the preview. Start the conversion again.`);
      }
    } else {
      path = await app.fileManager.getAvailablePathForAttachment(asset.fileName, note.path);
    }

    await ensureFolder(app, dirname(path));
    const file = await app.vault.createBinary(path, asset.bytes);
    created.push(file);
    written.push({ asset, file });
    byHash.set(asset.hash, file);
    byId.set(asset.id, file);
  }

  return { written, byId };
}

function finalMarkdown(app: App, plan: ConversionPlan, note: TFile, byId: Map<string, TFile>): string {
  return resolveAssetPlaceholders(plan.markdownTemplate, (assetId) => {
    const file = byId.get(assetId);
    if (!file) return `> [!warning] A generated asset is missing: ${assetId}`;
    return `!${app.fileManager.generateMarkdownLink(file, note.path)}`;
  });
}

async function applySourceAction(app: App, plan: ConversionPlan): Promise<string[]> {
  const warnings: string[] = [];
  try {
    if (plan.options.sourceAction === "trash") {
      await app.fileManager.trashFile(plan.source);
    } else if (plan.options.sourceAction === "move" && plan.sourceDestination) {
      if (app.vault.getAbstractFileByPath(plan.sourceDestination)) {
        throw new Error(`${plan.sourceDestination} already exists.`);
      }
      await ensureFolder(app, dirname(plan.sourceDestination));
      await app.fileManager.renameFile(plan.source, plan.sourceDestination);
    }
  } catch (error) {
    warnings.push(
      `The Markdown was saved, but the PDF could not be ${
        plan.options.sourceAction === "trash" ? "moved to Trash" : "moved"
      }: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return warnings;
}

export async function applyConversionPlan(app: App, plan: ConversionPlan): Promise<ApplyResult> {
  ensurePlanStillCurrent(app, plan);
  if (app.vault.getAbstractFileByPath(plan.notePath)) {
    throw new Error(`${plan.notePath} was created after the preview. Start the conversion again.`);
  }

  const created: TFile[] = [];
  let linkChanges: AppliedLinkChange[] = [];
  let note: TFile | null = null;
  try {
    await ensureFolder(app, dirname(plan.notePath));
    note = await app.vault.create(plan.notePath, "");
    created.push(note);

    const assetResult = await createAssetFiles(app, plan, note, created);
    await app.vault.modify(note, finalMarkdown(app, plan, note, assetResult.byId));

    if (plan.options.updateLinks && plan.linkFiles.length > 0) {
      linkChanges = await applyLinkPlans(app, plan.linkFiles, note, plan.source, plan.options);
    }

    ensurePlanStillCurrent(app, plan);
    const sourceWarnings = await applySourceAction(app, plan);
    return {
      note,
      assets: assetResult.written.map((entry) => entry.file),
      updatedLinks: plan.metrics.linkCount,
      sourceAction: plan.options.sourceAction,
      warnings: sourceWarnings
    };
  } catch (error) {
    await restoreLinkChanges(app, linkChanges);
    const dedicatedOutputFolder =
      plan.options.assetLocation === "note-folder" && plan.assets.length > 0
        ? plan.outputFolder
        : "";
    await trashGenerated(app, created, dedicatedOutputFolder);
    throw error;
  }
}
