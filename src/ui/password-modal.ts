import { Modal, Setting, type App } from "obsidian";

export class PdfPasswordModal extends Modal {
  private resolved = false;
  private resolvePromise: (value: string | null) => void = () => undefined;
  private readonly promise: Promise<string | null>;

  constructor(app: App, private readonly incorrect: boolean) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  request(): Promise<string | null> {
    this.open();
    return this.promise;
  }

  override onOpen(): void {
    this.setTitle(this.incorrect ? "Incorrect PDF password" : "PDF password required");
    this.contentEl.empty();
    const description = this.contentEl.createEl("p", {
      text: this.incorrect
        ? "The password did not open this PDF. Enter a different password."
        : "Enter the password for this PDF. The password stays in memory and is not saved."
    });
    description.addClass("pdfmd-muted");

    let value = "";
    const setting = new Setting(this.contentEl).setName("Password");
    setting.addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.onChange((next) => {
        value = next;
      });
      this.contentEl.win.setTimeout(() => text.inputEl.focus(), 0);
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && value) {
          event.preventDefault();
          this.finish(value);
        }
      });
    });

    const buttons = this.contentEl.createDiv({ cls: "pdfmd-actions" });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.finish(null));
    const unlock = buttons.createEl("button", { text: "Open PDF", cls: "mod-cta" });
    unlock.addEventListener("click", () => {
      if (value) this.finish(value);
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) this.finish(null, false);
  }

  private finish(value: string | null, close = true): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolvePromise(value);
    if (close) this.close();
  }
}
