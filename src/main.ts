import {
  Menu,
  Notice,
  Plugin,
  TFile
} from "obsidian";
import { PdfToMarkdownSettingTab } from "./settings";
import { DEFAULT_SETTINGS, normalizeSettings, type PdfToMarkdownSettings } from "./types";
import { ConversionModal } from "./ui/conversion-modal";

export default class PdfToMarkdownPlugin extends Plugin {
  pluginSettings: PdfToMarkdownSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new PdfToMarkdownSettingTab(this.app, this));

    this.addCommand({
      id: "convert-current-pdf-to-markdown",
      name: "Convert current PDF to Markdown",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = this.isPdf(file);
        if (!checking && available && file) this.openConverter(file);
        return available;
      }
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!this.isPdf(file)) return;
        menu.addItem((item) => {
          item
            .setTitle("Convert PDF to Markdown")
            .setIcon("file-text")
            .onClick(() => this.openConverter(file));
        });
      })
    );
  }

  async loadSettings(): Promise<void> {
    const saved: unknown = await this.loadData();
    this.pluginSettings = normalizeSettings(saved);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.pluginSettings);
  }

  private isPdf(file: import("obsidian").TAbstractFile | null): file is TFile {
    return file instanceof TFile && file.extension.toLowerCase() === "pdf";
  }

  private openConverter(file: TFile): void {
    if (!this.isPdf(file)) {
      new Notice("Select a PDF inside the vault.");
      return;
    }
    new ConversionModal(this.app, this, file).open();
  }
}
