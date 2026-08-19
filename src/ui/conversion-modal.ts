import {
  Modal,
  Notice,
  Setting,
  type App,
  type TFile
} from "obsidian";
import { applyConversionPlan } from "../conversion/apply";
import { buildConversionPlan, retargetConversionPlan } from "../conversion/plan";
import {
  CancellationController,
  CancelledError
} from "../pdf/pdfjs";
import type {
  ConversionPlan,
  PdfToMarkdownSettings,
  SourceAction
} from "../types";
import { PdfPasswordModal } from "./password-modal";
import { chooseVaultFolder } from "./folder-picker";
import {
  ConversionPreviewRenderer,
  formatBytes,
  formatDuration,
  renderTargetSummary,
  type PreviewTab
} from "./conversion-preview";

interface PluginHost {
  pluginSettings: PdfToMarkdownSettings;
}

export class ConversionModal extends Modal {
  private readonly controller = new CancellationController();
  private plan: ConversionPlan | null = null;
  private titleValue: string;
  private sourceAction: SourceAction;
  private moveFolder: string;
  private activeTab: PreviewTab = "rendered";
  private pathEl: HTMLElement | null = null;
  private applyButton: HTMLButtonElement | null = null;
  private targetError = "";
  private refreshTimer: number | null = null;
  private applying = false;
  private progressEl: HTMLProgressElement | null = null;
  private progressTextEl: HTMLElement | null = null;
  private readonly assetUrls = new Map<string, string>();
  private readonly previewRenderer: ConversionPreviewRenderer;

  constructor(
    app: App,
    private readonly plugin: PluginHost,
    private readonly source: TFile
  ) {
    super(app);
    this.previewRenderer = new ConversionPreviewRenderer(app, source, this.assetUrls);
    this.titleValue = source.basename;
    this.sourceAction = plugin.pluginSettings.sourceAction;
    this.moveFolder = plugin.pluginSettings.moveFolder;
  }

  override onOpen(): void {
    this.modalEl.addClass("pdfmd-modal");
    this.setTitle("Convert PDF to Markdown");
    this.renderLoading("Preparing PDF", 0, 1);
    void this.prepare();
  }

  override onClose(): void {
    if (!this.applying) this.controller.cancel();
    if (this.refreshTimer !== null) this.contentEl.win.clearTimeout(this.refreshTimer);
    this.disposePreviewRenderer();
    for (const url of new Set(this.assetUrls.values())) URL.revokeObjectURL(url);
    this.assetUrls.clear();
    this.contentEl.empty();
  }

  private disposePreviewRenderer(): void {
    this.previewRenderer.dispose();
  }

  private renderLoading(message: string, current: number, total: number): void {
    this.disposePreviewRenderer();
    this.contentEl.empty();
    const wrap = this.contentEl.createDiv({ cls: "pdfmd-loading" });
    wrap.createDiv({ cls: "pdfmd-spinner", attr: { "aria-hidden": "true" } });
    this.progressTextEl = wrap.createEl("p", { text: message });
    this.progressEl = wrap.createEl("progress");
    this.progressEl.max = Math.max(1, total);
    this.progressEl.value = Math.max(0, current);
    const cancel = wrap.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.controller.cancel();
      this.close();
    });
  }

  private updateProgress(message: string, current: number, total: number): void {
    if (this.progressTextEl) this.progressTextEl.setText(message);
    if (this.progressEl) {
      this.progressEl.max = Math.max(1, total);
      this.progressEl.value = Math.max(0, current);
    }
  }

  private async prepare(): Promise<void> {
    try {
      const options = {
        ...this.plugin.pluginSettings,
        title: this.titleValue
      };
      this.plan = await buildConversionPlan(
        this.app,
        this.source,
        options,
        this.controller,
        (progress) => this.updateProgress(progress.message, progress.current, progress.total),
        async (incorrect) => new PdfPasswordModal(this.app, incorrect).request()
      );
      if (this.controller.cancelled) throw new CancelledError();
      this.titleValue = this.plan.options.title;
      this.sourceAction = this.plan.options.sourceAction;
      this.moveFolder = this.plan.options.moveFolder;
      this.createAssetUrls(this.plan);
      this.renderReady();
    } catch (error) {
      if (error instanceof CancelledError || this.controller.cancelled) {
        this.close();
        return;
      }
      this.renderError(error, true);
    }
  }

  private createAssetUrls(plan: ConversionPlan): void {
    const byHash = new Map<string, string>();
    for (const asset of plan.assets) {
      if (this.assetUrls.has(asset.id)) continue;
      let url = byHash.get(asset.hash);
      if (!url) {
        const blob = new Blob([asset.bytes], { type: asset.mime });
        url = URL.createObjectURL(blob);
        byHash.set(asset.hash, url);
      }
      this.assetUrls.set(asset.id, url);
    }
  }

  private currentPlan(): ConversionPlan {
    if (!this.plan) throw new Error("The conversion preview is not ready.");
    return retargetConversionPlan(this.app, this.plan, {
      title: this.titleValue,
      sourceAction: this.sourceAction,
      moveFolder: this.moveFolder
    });
  }

  private scheduleTargetRefresh(): void {
    if (this.refreshTimer !== null) this.contentEl.win.clearTimeout(this.refreshTimer);
    this.refreshTimer = this.contentEl.win.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshTargets();
    }, 120);
  }

  private refreshTargets(): void {
    try {
      const plan = this.currentPlan();
      this.targetError = "";
      if (this.pathEl) {
        this.pathEl.empty();
        renderTargetSummary(this.pathEl, plan);
      }
      if (this.applyButton) this.applyButton.disabled = false;
    } catch (error) {
      this.targetError = error instanceof Error ? error.message : String(error);
      if (this.pathEl) {
        this.pathEl.empty();
        this.pathEl.createDiv({ cls: "pdfmd-error", text: this.targetError });
      }
      if (this.applyButton) this.applyButton.disabled = true;
    }
  }

  private renderReady(): void {
    if (!this.plan) return;
    this.disposePreviewRenderer();
    this.pathEl = null;
    this.applyButton = null;
    this.contentEl.empty();

    const summary = this.contentEl.createDiv({ cls: "pdfmd-summary" });
    this.addMetric(summary, String(this.plan.metrics.pageCount), "pages");
    this.addMetric(summary, String(this.plan.metrics.tableCount), "tables");
    this.addMetric(summary, String(this.plan.metrics.imageCount), "images");
    this.addMetric(summary, formatBytes(this.plan.metrics.assetBytes), "assets");
    this.addMetric(summary, String(this.plan.metrics.linkCount), "links");
    this.addMetric(summary, formatDuration(this.plan.metrics.elapsedMs), "processed");

    const controls = this.contentEl.createDiv({ cls: "pdfmd-controls" });
    new Setting(controls)
      .setName("Note name")
      .setDesc("The plugin adds .md automatically.")
      .addText((text) => {
        text.setValue(this.titleValue).onChange((value) => {
          this.titleValue = value;
          this.scheduleTargetRefresh();
        });
      });

    const moveSetting = new Setting(controls)
      .setName("Source PDF")
      .setDesc("The source action runs last. Trash follows Obsidian's Deleted files setting.");
    let moveFolderSetting: Setting | null = null;
    moveSetting.addDropdown((dropdown) => {
      dropdown
        .addOption("keep", "Leave in place")
        .addOption("trash", "Use Obsidian Deleted files setting")
        .addOption("move", "Move to folder")
        .setValue(this.sourceAction)
        .onChange((value) => {
          this.sourceAction = value as SourceAction;
          moveFolderSetting?.settingEl.toggle(this.sourceAction === "move");
          this.scheduleTargetRefresh();
        });
    });

    let moveFolderInput: import("obsidian").TextComponent | null = null;
    moveFolderSetting = new Setting(controls)
      .setName("Move folder")
      .setDesc("Choose an existing vault folder or type a new vault-relative folder.")
      .addText((text) => {
        moveFolderInput = text;
        text.setPlaceholder("PDF archive").setValue(this.moveFolder).onChange((value) => {
          this.moveFolder = value;
          this.scheduleTargetRefresh();
        });
      })
      .addButton((button) => {
        button.setButtonText("Choose").onClick(async () => {
          const folder = await chooseVaultFolder(this.app);
          if (folder === null) return;
          this.moveFolder = folder;
          moveFolderInput?.setValue(folder);
          this.scheduleTargetRefresh();
        });
      });
    moveFolderSetting.settingEl.toggle(this.sourceAction === "move");

    this.pathEl = this.contentEl.createDiv({ cls: "pdfmd-targets" });
    this.refreshTargets();

    if (this.plan.warnings.length > 0) {
      const details = this.contentEl.createEl("details", { cls: "pdfmd-warnings" });
      details.createEl("summary", { text: `${this.plan.warnings.length} conversion warning${this.plan.warnings.length === 1 ? "" : "s"}` });
      const list = details.createEl("ul");
      for (const warning of this.plan.warnings) list.createEl("li", { text: warning });
    }

    const preview = this.contentEl.createDiv({ cls: "pdfmd-preview" });
    const tabs = preview.createDiv({ cls: "pdfmd-tabs", attr: { role: "tablist" } });
    const pane = preview.createDiv({ cls: "pdfmd-preview-pane" });
    const tabDefinitions: Array<[PreviewTab, string]> = [
      ["pdf", "PDF"],
      ["rendered", "Markdown"],
      ["source", "Source"],
      ["files", "Files"]
    ];
    for (const [id, label] of tabDefinitions) {
      const button = tabs.createEl("button", {
        text: label,
        cls: id === this.activeTab ? "is-active" : ""
      });
      button.type = "button";
      button.setAttr("role", "tab");
      button.setAttr("aria-selected", id === this.activeTab ? "true" : "false");
      button.addEventListener("click", () => {
        this.activeTab = id;
        for (const child of Array.from(tabs.children)) {
          child.removeClass("is-active");
          child.setAttr("aria-selected", "false");
        }
        button.addClass("is-active");
        button.setAttr("aria-selected", "true");
        void this.renderPreviewTab(pane, id);
      });
    }
    void this.renderPreviewTab(pane, this.activeTab);

    const actions = this.contentEl.createDiv({ cls: "pdfmd-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    this.applyButton = actions.createEl("button", { text: "Convert", cls: "mod-cta" });
    this.applyButton.disabled = Boolean(this.targetError);
    this.applyButton.addEventListener("click", () => void this.apply());
  }

  private addMetric(container: HTMLElement, value: string, label: string): void {
    const metric = container.createDiv({ cls: "pdfmd-metric" });
    metric.createEl("strong", { text: value });
    metric.createSpan({ text: label });
  }

  private async renderPreviewTab(container: HTMLElement, tab: PreviewTab): Promise<void> {
    let plan: ConversionPlan;
    try {
      plan = this.currentPlan();
    } catch (error) {
      container.empty();
      container.createDiv({
        cls: "pdfmd-error",
        text: error instanceof Error ? error.message : String(error)
      });
      return;
    }
    await this.previewRenderer.render(container, tab, plan);
  }

  private async apply(): Promise<void> {
    if (this.applying || !this.plan) return;
    let plan: ConversionPlan;
    try {
      plan = this.currentPlan();
    } catch (error) {
      this.renderError(error, false);
      return;
    }

    this.applying = true;
    this.renderLoading("Saving Markdown and assets", 0, 1);
    const cancel = this.contentEl.querySelector("button");
    if (cancel) cancel.remove();
    try {
      const result = await applyConversionPlan(this.app, plan);
      const parts = [`Converted ${plan.source.name}`];
      if (result.assets.length > 0) parts.push(`${result.assets.length} assets`);
      if (result.updatedLinks > 0) parts.push(`${result.updatedLinks} links updated`);
      new Notice(parts.join(" · "), 7000);
      for (const warning of result.warnings) new Notice(warning, 10000);
      if (plan.options.openAfterConversion) {
        try {
          await this.app.workspace.getLeaf(false).openFile(result.note);
        } catch (error) {
          new Notice(
            `The conversion finished, but the note could not be opened: ${
              error instanceof Error ? error.message : String(error)
            }`,
            10000
          );
        }
      }
      this.close();
    } catch (error) {
      this.applying = false;
      this.renderError(error, false);
    }
  }

  private renderError(error: unknown, allowRetry: boolean): void {
    this.disposePreviewRenderer();
    this.contentEl.empty();
    const message = error instanceof Error ? error.message : String(error);
    const panel = this.contentEl.createDiv({ cls: "pdfmd-error-panel" });
    panel.createEl("h3", { text: "PDF conversion failed" });
    panel.createEl("p", { text: message });
    const actions = panel.createDiv({ cls: "pdfmd-actions" });
    if (allowRetry) {
      const retry = actions.createEl("button", { text: "Try again", cls: "mod-cta" });
      retry.addEventListener("click", () => {
        this.renderLoading("Preparing PDF", 0, 1);
        void this.prepare();
      });
    } else if (this.plan) {
      const back = actions.createEl("button", { text: "Back to preview", cls: "mod-cta" });
      back.addEventListener("click", () => this.renderReady());
    }
    const close = actions.createEl("button", { text: "Close" });
    close.addEventListener("click", () => this.close());
  }
}
