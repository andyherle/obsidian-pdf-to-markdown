import { PluginSettingTab, Setting, type App } from "obsidian";
import type PdfToMarkdownPlugin from "./main";
import type { ImageFormat, SourceAction, TableOutput } from "./types";
import { chooseVaultFolder } from "./ui/folder-picker";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export class PdfToMarkdownSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: PdfToMarkdownPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "All conversion happens inside Obsidian. The plugin does not use a server, Python, or other external tools."
    });

    new Setting(containerEl).setName("Source PDF").setHeading();
    new Setting(containerEl)
      .setName("After conversion")
      .setDesc("Keep the PDF, use Obsidian's Deleted files setting, or move it to a vault folder.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("keep", "Leave PDF in place")
          .addOption("trash", "Use Obsidian Deleted files setting")
          .addOption("move", "Move PDF to folder")
          .setValue(this.plugin.pluginSettings.sourceAction)
          .onChange(async (value) => {
            this.plugin.pluginSettings.sourceAction = value as SourceAction;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (this.plugin.pluginSettings.sourceAction === "move") {
      let folderInput: import("obsidian").TextComponent | null = null;
      new Setting(containerEl)
        .setName("PDF move folder")
        .setDesc("Choose an existing vault folder or type a new vault-relative folder.")
        .addText((text) => {
          folderInput = text;
          text
            .setPlaceholder("PDF archive")
            .setValue(this.plugin.pluginSettings.moveFolder)
            .onChange(async (value) => {
              this.plugin.pluginSettings.moveFolder = value;
              await this.plugin.saveSettings();
            });
        })
        .addButton((button) => {
          button.setButtonText("Choose").onClick(async () => {
            const folder = await chooseVaultFolder(this.app);
            if (folder === null) return;
            folderInput?.setValue(folder);
            this.plugin.pluginSettings.moveFolder = folder;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl).setName("Images").setHeading();
    new Setting(containerEl)
      .setName("Extract images")
      .setDesc("Extract embedded PDF images and compress them before they are saved.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.extractImages).onChange(async (value) => {
          this.plugin.pluginSettings.extractImages = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Asset location")
      .setDesc("Choose where extracted images, page snapshots, and SVG tables are saved.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("note-folder", "Folder with the converted note")
          .addOption("vault-default", "Obsidian attachment location")
          .setValue(this.plugin.pluginSettings.assetLocation)
          .onChange(async (value) => {
            this.plugin.pluginSettings.assetLocation = value as "note-folder" | "vault-default";
            await this.plugin.saveSettings();
          });
      });

    if (this.plugin.pluginSettings.extractImages || this.plugin.pluginSettings.renderImageOnlyPages) {
      new Setting(containerEl)
        .setName("Image format")
        .setDesc("WebP gives small files. PNG keeps lossless detail. JPEG is widely compatible.")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("webp", "WebP")
            .addOption("png", "PNG")
            .addOption("jpeg", "JPEG")
            .setValue(this.plugin.pluginSettings.imageFormat)
            .onChange(async (value) => {
              this.plugin.pluginSettings.imageFormat = value as ImageFormat;
              await this.plugin.saveSettings();
              this.display();
            });
        });

      if (this.plugin.pluginSettings.imageFormat !== "png") {
        new Setting(containerEl)
          .setName("Image quality")
          .setDesc(`Current value: ${percent(this.plugin.pluginSettings.imageQuality)}.`)
          .addSlider((slider) => {
            slider
              .setLimits(45, 100, 1)
              .setValue(Math.round(this.plugin.pluginSettings.imageQuality * 100))
              .setDynamicTooltip()
              .onChange(async (value) => {
                this.plugin.pluginSettings.imageQuality = value / 100;
                await this.plugin.saveSettings();
              });
          });
      }

      new Setting(containerEl)
        .setName("Maximum image size")
        .setDesc("The longest image edge in pixels. Large images are scaled down before export.")
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "320";
          text.inputEl.max = "8000";
          text
            .setValue(String(this.plugin.pluginSettings.maxImageDimension))
            .onChange(async (value) => {
              const number = Number.parseInt(value, 10);
              if (Number.isFinite(number)) {
                this.plugin.pluginSettings.maxImageDimension = Math.max(320, Math.min(8000, number));
                await this.plugin.saveSettings();
              }
            });
        });

      new Setting(containerEl)
        .setName("Ignore small images")
        .setDesc("Images smaller than this width or height are not exported. This removes many icons and bullets.")
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "1";
          text.inputEl.max = "1000";
          text
            .setValue(String(this.plugin.pluginSettings.minImageDimension))
            .onChange(async (value) => {
              const number = Number.parseInt(value, 10);
              if (Number.isFinite(number)) {
                this.plugin.pluginSettings.minImageDimension = Math.max(1, Math.min(1000, number));
                await this.plugin.saveSettings();
              }
            });
        });
    }

    new Setting(containerEl)
      .setName("Keep image-only pages")
      .setDesc("Render scanned or image-only pages as compressed images. This is not OCR.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.renderImageOnlyPages).onChange(async (value) => {
          this.plugin.pluginSettings.renderImageOnlyPages = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl).setName("Tables").setHeading();
    new Setting(containerEl)
      .setName("Detect tables")
      .setDesc("Detect aligned PDF text and export it as clean Markdown, a compact SVG, or both.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.detectTables).onChange(async (value) => {
          this.plugin.pluginSettings.detectTables = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.pluginSettings.detectTables) {
      new Setting(containerEl)
        .setName("Table output")
        .setDesc("Markdown stays editable. SVG keeps the detected table as a small, scalable visual.")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("markdown", "Editable Markdown")
            .addOption("svg", "Compact SVG")
            .addOption("both", "Markdown and SVG")
            .setValue(this.plugin.pluginSettings.tableOutput)
            .onChange(async (value) => {
              this.plugin.pluginSettings.tableOutput = value as TableOutput;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Table detection confidence")
        .setDesc(`Current value: ${percent(this.plugin.pluginSettings.tableMinConfidence)}. Increase it if normal columns are detected as tables.`)
        .addSlider((slider) => {
          slider
            .setLimits(50, 90, 1)
            .setValue(Math.round(this.plugin.pluginSettings.tableMinConfidence * 100))
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.pluginSettings.tableMinConfidence = value / 100;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl).setName("Markdown").setHeading();
    new Setting(containerEl)
      .setName("Add page headings")
      .setDesc("Add a page heading for each PDF page. PDF page links can then point to the matching heading.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.includePageHeadings).onChange(async (value) => {
          this.plugin.pluginSettings.includePageHeadings = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Remove repeated page margins")
      .setDesc("Remove repeated headers, footers, and page numbers from documents with three or more pages.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.removeRepeatedMargins).onChange(async (value) => {
          this.plugin.pluginSettings.removeRepeatedMargins = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Update PDF links")
      .setDesc("Change links that resolve to the PDF so they point to the new note. Existing aliases stay unchanged.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.updateLinks).onChange(async (value) => {
          this.plugin.pluginSettings.updateLinks = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Open converted note")
      .setDesc("Open the Markdown note after the conversion is applied.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.pluginSettings.openAfterConversion).onChange(async (value) => {
          this.plugin.pluginSettings.openAfterConversion = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
