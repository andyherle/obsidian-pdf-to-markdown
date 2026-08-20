/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- The hosted Obsidian review scanner resolves public Obsidian API declarations as error types in this file; runtime boundaries are validated separately. */
import { FuzzySuggestModal, type App, type TFolder } from "obsidian";

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private resolved = false;
  private resolvePromise: (value: string | null) => void = () => undefined;
  private readonly promise: Promise<string | null>;

  constructor(app: App) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
    this.setPlaceholder("Choose a vault folder");
  }

  override getItems(): TFolder[] {
    return this.app.vault.getAllFolders(false).sort((a, b) => a.path.localeCompare(b.path));
  }

  override getItemText(folder: TFolder): string {
    return folder.path;
  }

  override onChooseItem(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.finish(folder.path);
  }

  override onClose(): void {
    super.onClose();
    if (!this.resolved) this.finish(null);
  }

  request(): Promise<string | null> {
    this.open();
    return this.promise;
  }

  private finish(value: string | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolvePromise(value);
  }
}

export function chooseVaultFolder(app: App): Promise<string | null> {
  return new FolderPickerModal(app).request();
}

/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Match the hosted-review compatibility scope declared at the top of this file. */
