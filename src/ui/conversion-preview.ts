import {
  Component,
  MarkdownRenderer,
  Notice,
  Platform,
  type App,
  type TFile
} from "obsidian";
import { resolveAssetPlaceholders } from "../markdown/document";
import type { ConversionPlan, SourceAction } from "../types";

export type PreviewTab = "pdf" | "rendered" | "source" | "files";

const PREVIEW_LIMIT = 140_000;

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function sourceActionText(action: SourceAction, destination?: string): string {
  if (action === "trash") return "Move the PDF to Obsidian trash";
  if (action === "move") return destination ? `Move the PDF to ${destination}` : "Leave the PDF in place";
  return "Leave the PDF in place";
}

export function renderTargetSummary(container: HTMLElement, plan: ConversionPlan): void {
  const noteRow = container.createDiv({ cls: "pdfmd-target-row" });
  noteRow.createSpan({ text: "Markdown" });
  noteRow.createEl("code", { text: plan.notePath });

  if (plan.assets.length > 0) {
    const assetRow = container.createDiv({ cls: "pdfmd-target-row" });
    assetRow.createSpan({ text: "Assets" });
    assetRow.createEl("code", {
      text: plan.options.assetLocation === "note-folder"
        ? `${plan.outputFolder}/`
        : "Obsidian attachment location"
    });
  }

  const sourceRow = container.createDiv({ cls: "pdfmd-target-row" });
  sourceRow.createSpan({ text: "PDF" });
  sourceRow.createEl("code", {
    text: sourceActionText(plan.options.sourceAction, plan.sourceDestination)
  });
}

export class ConversionPreviewRenderer {
  private component: Component | null = null;
  private generation = 0;

  constructor(
    private readonly app: App,
    private readonly source: TFile,
    private readonly assetUrls: ReadonlyMap<string, string>
  ) {}

  dispose(): void {
    this.generation += 1;
    this.component?.unload();
    this.component = null;
  }

  private previewMarkdown(plan: ConversionPlan): string {
    const byId = new Map(plan.assets.map((asset) => [asset.id, asset]));
    return resolveAssetPlaceholders(plan.markdownTemplate, (assetId) => {
      const asset = byId.get(assetId);
      const url = this.assetUrls.get(assetId);
      if (!asset || !url) return `> [!warning] Missing preview asset: ${assetId}`;
      return `![${asset.alt.replace(/[\[\]]/g, "")}](${url})`;
    });
  }

  async render(container: HTMLElement, tab: PreviewTab, plan: ConversionPlan): Promise<void> {
    this.dispose();
    const generation = this.generation;
    container.empty();

    if (tab === "pdf") {
      const toolbar = container.createDiv({ cls: "pdfmd-pdf-toolbar" });
      const open = toolbar.createEl("button", { text: "Open PDF in Obsidian" });
      open.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(this.source).catch((error: unknown) => {
          new Notice(
            `The PDF could not be opened: ${error instanceof Error ? error.message : String(error)}`,
            10000
          );
        });
      });
      if (Platform.isMobile) {
        container.createEl("p", {
          cls: "pdfmd-muted",
          text: "Use the button above to open the PDF in Obsidian. The inline PDF preview is available on desktop."
        });
        return;
      }
      const frame = container.createEl("iframe", {
        cls: "pdfmd-pdf-frame",
        attr: {
          src: this.app.vault.getResourcePath(this.source),
          title: `PDF preview: ${this.source.name}`
        }
      });
      frame.setAttr("loading", "lazy");
      return;
    }

    if (tab === "files") {
      renderTargetSummary(container, plan);
      if (plan.assets.length > 0) {
        const unique = new Map(plan.assets.map((asset) => [asset.hash, asset]));
        container.createEl("h4", { text: `${unique.size} asset file${unique.size === 1 ? "" : "s"}` });
        const list = container.createEl("ul", { cls: "pdfmd-file-list" });
        for (const asset of unique.values()) {
          list.createEl("li", {
            text: `${asset.fileName} — ${asset.width} × ${asset.height}, ${formatBytes(asset.bytes.byteLength)}`
          });
        }
      }
      return;
    }

    const markdown = tab === "rendered" ? this.previewMarkdown(plan) : plan.markdown;
    const truncated = markdown.length > PREVIEW_LIMIT;
    const previewValue = truncated
      ? `${markdown.slice(0, PREVIEW_LIMIT)}\n\n> [!info] Preview stopped here because the complete note is large. The full note will be saved.`
      : markdown;

    if (tab === "source") {
      const pre = container.createEl("pre", { cls: "pdfmd-source" });
      pre.createEl("code", { text: previewValue });
      return;
    }

    const rendered = container.createDiv({ cls: "markdown-rendered pdfmd-rendered" });
    const component = new Component();
    component.load();
    this.component = component;
    try {
      await MarkdownRenderer.render(this.app, previewValue, rendered, plan.notePath, component);
    } catch (error) {
      if (generation === this.generation && this.component === component) {
        rendered.empty();
        rendered.createDiv({
          cls: "pdfmd-error",
          text: `The Markdown preview could not be rendered: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    } finally {
      if (generation !== this.generation || this.component !== component) {
        component.unload();
      }
    }
  }
}
