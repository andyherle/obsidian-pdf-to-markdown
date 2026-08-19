import test from "node:test";
import assert from "node:assert/strict";
import { TFile, TFolder } from "../.test-build/node_modules/obsidian/index.js";
import { applyConversionPlan } from "../.test-build/conversion/apply.js";
import { DEFAULT_SETTINGS } from "../.test-build/types.js";

function file(path, size = 0) {
  const value = new TFile(path);
  value.stat = { mtime: 10, size };
  return value;
}

function makeApp({ failAsset = false, failAssetAt = 0 } = {}) {
  const files = new Map();
  const events = [];
  let assetWrites = 0;
  const source = file("Docs/Invoice.pdf", 4);
  files.set(source.path, source);

  const vault = {
    getAbstractFileByPath(path) {
      return files.get(path) ?? null;
    },
    getAllLoadedFiles() {
      return [...files.values()];
    },
    async createFolder(path) {
      const folder = new TFolder(path);
      files.set(path, folder);
      events.push(`folder:${path}`);
      return folder;
    },
    async create(path, content) {
      const target = file(path, new TextEncoder().encode(content).byteLength);
      target.content = content;
      files.set(path, target);
      events.push(`note:${path}`);
      return target;
    },
    async createBinary(path, bytes) {
      assetWrites += 1;
      if (failAsset || (failAssetAt > 0 && assetWrites === failAssetAt)) {
        throw new Error("asset write failed");
      }
      const target = file(path, bytes.byteLength);
      target.bytes = bytes;
      files.set(path, target);
      events.push(`binary:${path}`);
      return target;
    },
    async modify(target, content) {
      target.content = content;
      events.push(`modify:${target.path}`);
    },
    async process(target, change) {
      target.content = change(target.content ?? "");
      return target.content;
    }
  };

  const fileManager = {
    async getAvailablePathForAttachment(name) {
      return `Attachments/${name}`;
    },
    generateMarkdownLink(target) {
      return `[[${target.path}]]`;
    },
    async trashFile(target) {
      events.push(`trash:${target.path}`);
      files.delete(target.path);
    },
    async renameFile(target, destination) {
      files.delete(target.path);
      target.path = destination;
      files.set(destination, target);
      events.push(`move:${destination}`);
    }
  };

  return { app: { vault, fileManager }, source, files, events };
}

function planFor(source, sourceAction = "trash") {
  const bytes = new Uint8Array([8, 9, 10]).buffer;
  return {
    source,
    sourcePath: source.path,
    sourceMtime: source.stat.mtime,
    sourceSize: source.stat.size,
    options: {
      ...DEFAULT_SETTINGS,
      title: "Invoice",
      sourceAction,
      assetLocation: "note-folder"
    },
    pages: [],
    assets: [{
      id: "asset-1",
      kind: "image",
      page: 1,
      index: 1,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      width: 1,
      height: 1,
      mime: "image/webp",
      extension: "webp",
      bytes,
      hash: "asset-hash",
      fileName: "Image.webp",
      alt: "Image",
      plannedPath: "Docs/Invoice/Image.webp"
    }],
    markdownTemplate: "# Invoice\n\n{{PDFMD_ASSET:asset-1}}\n",
    markdown: "# Invoice\n",
    notePath: "Docs/Invoice/Invoice.md",
    outputFolder: "Docs/Invoice",
    linkFiles: [],
    warnings: [],
    metrics: {
      pageCount: 1,
      characterCount: 7,
      tableCount: 0,
      imageCount: 1,
      assetBytes: 3,
      elapsedMs: 1,
      linkCount: 0
    }
  };
}

function addSecondAsset(plan) {
  const bytes = new Uint8Array([11, 12, 13]).buffer;
  plan.assets.push({
    ...plan.assets[0],
    id: "asset-2",
    bytes,
    hash: "asset-hash-2",
    fileName: "Image 2.webp",
    plannedPath: "Docs/Invoice/Image 2.webp"
  });
  plan.markdownTemplate += "\n{{PDFMD_ASSET:asset-2}}\n";
  plan.metrics.imageCount = 2;
  plan.metrics.assetBytes += bytes.byteLength;
  return plan;
}

test("source PDF trash runs after note and asset writes", async () => {
  const { app, source, events, files } = makeApp();
  const result = await applyConversionPlan(app, planFor(source));
  assert.equal(result.note.path, "Docs/Invoice/Invoice.md");
  assert.equal(result.note.content, "# Invoice\n\n![[Docs/Invoice/Image.webp]]\n");
  assert.ok(files.has("Docs/Invoice/Image.webp"));
  assert.equal(events.at(-1), "trash:Docs/Invoice.pdf");
});

test("failed output writes trash generated files but keep the source PDF", async () => {
  const { app, source, events, files } = makeApp({ failAsset: true });
  await assert.rejects(() => applyConversionPlan(app, planFor(source)), /asset write failed/);
  assert.ok(files.has("Docs/Invoice.pdf"));
  assert.ok(events.includes("trash:Docs/Invoice/Invoice.md"));
  assert.ok(!events.includes("trash:Docs/Invoice.pdf"));
});


test("a partial asset failure trashes earlier generated assets and keeps the source PDF", async () => {
  const { app, source, events, files } = makeApp({ failAssetAt: 2 });
  await assert.rejects(
    () => applyConversionPlan(app, addSecondAsset(planFor(source))),
    /asset write failed/
  );
  assert.ok(files.has("Docs/Invoice.pdf"));
  assert.ok(!files.has("Docs/Invoice/Image.webp"));
  assert.ok(events.includes("trash:Docs/Invoice/Image.webp"));
  assert.ok(events.includes("trash:Docs/Invoice/Invoice.md"));
  assert.ok(!events.includes("trash:Docs/Invoice.pdf"));
});
