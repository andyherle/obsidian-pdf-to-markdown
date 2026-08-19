import { TFile, type App } from "obsidian";
import type {
  AppliedLinkChange,
  ConversionOptions,
  LinkFilePlan,
  LinkReferencePlan
} from "../types";
import {
  encodeMarkdownLinkPath,
  relativeVaultPath,
  withoutExtension
} from "../path";
import { parseLink, renderReplacement } from "./syntax";

interface CachePosition {
  start: { offset: number };
  end: { offset: number };
}

interface PositionedCacheLink {
  link: string;
  original?: string;
  position: CachePosition;
}

interface LinkCacheShape {
  links?: PositionedCacheLink[];
  embeds?: PositionedCacheLink[];
  frontmatterPosition?: CachePosition;
}

function isInFrontmatter(position: CachePosition, frontmatter?: CachePosition): boolean {
  if (!frontmatter) return false;
  return position.start.offset >= frontmatter.start.offset && position.end.offset <= frontmatter.end.offset;
}

function candidateSourcePaths(app: App, source: TFile): string[] {
  const resolvedLinks = (app.metadataCache.resolvedLinks ?? {}) as Record<string, Record<string, number>>;
  return Object.entries(resolvedLinks)
    .filter(([, destinations]) => (destinations[source.path] ?? 0) > 0)
    .map(([path]) => path);
}

function sameReference(left: LinkReferencePlan, right: LinkReferencePlan): boolean {
  return left.start === right.start && left.end === right.end;
}

export async function collectLinkPlans(app: App, source: TFile): Promise<LinkFilePlan[]> {
  const plans: LinkFilePlan[] = [];
  for (const sourcePath of candidateSourcePaths(app, source)) {
    const file = app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") continue;
    const markdownFile = file;
    const content = await app.vault.cachedRead(markdownFile);
    const cache = app.metadataCache.getFileCache(markdownFile) as LinkCacheShape | null;
    if (!cache) continue;
    const entries = [...(cache.links ?? []), ...(cache.embeds ?? [])];
    const references: LinkReferencePlan[] = [];

    for (const entry of entries) {
      if (isInFrontmatter(entry.position, cache.frontmatterPosition)) continue;
      const destination = app.metadataCache.getFirstLinkpathDest(entry.link, sourcePath);
      if (destination?.path !== source.path) continue;
      const start = entry.position.start.offset;
      const end = entry.position.end.offset;
      if (start < 0 || end <= start || end > content.length) continue;
      const original = content.slice(start, end);
      const parsed = parseLink(original);
      if (!parsed) continue;
      const reference: LinkReferencePlan = {
        start,
        end,
        original,
        style: parsed.style,
        embed: parsed.embed,
        alias: parsed.alias,
        subpath: parsed.subpath
      };
      if (!references.some((existing) => sameReference(existing, reference))) references.push(reference);
    }

    if (references.length > 0) {
      plans.push({
        file: markdownFile,
        references: references.sort((a, b) => a.start - b.start),
        originalMtime: markdownFile.stat.mtime,
        originalSize: markdownFile.stat.size
      });
    }
  }
  return plans;
}

function wikiTargetFor(
  app: App,
  note: TFile,
  sourceFile: TFile,
  sourcePdf: TFile,
  options: ConversionOptions
): string {
  const sameStem = withoutExtension(note.path).toLowerCase() ===
    withoutExtension(sourcePdf.path).toLowerCase();
  if (options.sourceAction === "keep" && sameStem) return note.path;
  return app.metadataCache.fileToLinktext(note, sourceFile.path, true);
}

function applyReferences(
  content: string,
  references: LinkReferencePlan[],
  wikiTarget: string,
  markdownTarget: string,
  includePageHeadings: boolean
): string {
  let output = content;
  for (const reference of [...references].sort((a, b) => b.start - a.start)) {
    const actual = output.slice(reference.start, reference.end);
    if (actual !== reference.original) {
      throw new Error("A PDF link changed after the preview was created.");
    }
    const replacement = renderReplacement(
      reference,
      wikiTarget,
      markdownTarget,
      includePageHeadings
    );
    output = output.slice(0, reference.start) + replacement + output.slice(reference.end);
  }
  return output;
}

export async function applyLinkPlans(
  app: App,
  plans: LinkFilePlan[],
  note: TFile,
  sourcePdf: TFile,
  options: ConversionOptions
): Promise<AppliedLinkChange[]> {
  const changes: AppliedLinkChange[] = [];
  try {
    for (const plan of plans) {
      if (plan.file.stat.mtime !== plan.originalMtime || plan.file.stat.size !== plan.originalSize) {
        throw new Error(`${plan.file.path} changed after the preview was created.`);
      }
      let before = "";
      let after = "";
      await app.vault.process(plan.file, (content) => {
        before = content;
        const wikiTarget = wikiTargetFor(app, note, plan.file, sourcePdf, options);
        const markdownTarget = encodeMarkdownLinkPath(relativeVaultPath(plan.file.path, note.path));
        after = applyReferences(
          content,
          plan.references,
          wikiTarget,
          markdownTarget,
          options.includePageHeadings
        );
        return after;
      });
      if (before !== after) changes.push({ file: plan.file, before, after });
    }
    return changes;
  } catch (error) {
    await restoreLinkChanges(app, changes);
    throw error;
  }
}

export async function restoreLinkChanges(app: App, changes: AppliedLinkChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    try {
      await app.vault.process(change.file, (current) => current === change.after ? change.before : current);
    } catch {
      // Do not hide the original conversion error because rollback is best effort.
    }
  }
}
