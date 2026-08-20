import "obsidian";

/**
 * Obsidian 1.13 declares these classes as HistoryHandler implementations but
 * omits the required method from their public class declarations. The method
 * exists in the application runtime. Merge it back into the public type surface
 * so strict TypeScript analysis does not mark the whole Obsidian module as an
 * intrinsic error type.
 */
declare module "obsidian" {
  interface Menu {
    onHistoryBack(): void;
  }

  interface Modal {
    onHistoryBack(): void;
  }

  interface PopoverSuggest<T> {
    onHistoryBack(): void;
  }
}
