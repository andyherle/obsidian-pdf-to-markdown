import { activeDocument, activeWindow, loadPdfJs } from "obsidian";
import type { CancellationToken, PasswordProvider } from "../types";

export interface PdfViewport {
  width: number;
  height: number;
  transform?: number[];
}

export interface PdfRenderTask {
  promise: Promise<void>;
  cancel?: () => void;
}

export interface PdfObjectStore {
  get: (id: string, callback?: (value: unknown) => void) => unknown;
  has?: (id: string) => boolean;
}

export interface PdfPageProxy {
  pageNumber: number;
  objs?: PdfObjectStore;
  commonObjs?: PdfObjectStore;
  getViewport: (options: { scale: number; rotation?: number }) => PdfViewport;
  getTextContent: (options?: Record<string, unknown>) => Promise<{ items: unknown[]; styles?: Record<string, unknown> }>;
  getOperatorList: (options?: Record<string, unknown>) => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  render: (options: Record<string, unknown>) => PdfRenderTask;
  cleanup?: (resetStats?: boolean) => boolean;
}

export interface PdfDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  cleanup?: (keepLoadedFonts?: boolean) => Promise<void>;
  destroy?: () => Promise<void>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  onPassword?: (updatePassword: (password: string) => void, reason: number) => void;
  destroy?: () => Promise<void>;
}

export interface PdfJsLibrary {
  getDocument: (source: Record<string, unknown>) => PdfLoadingTask;
  OPS: Record<string, number>;
  ImageKind?: Record<string, number>;
  PasswordResponses?: {
    NEED_PASSWORD?: number;
    INCORRECT_PASSWORD?: number;
  };
}

export interface OpenPdfResult {
  pdfjs: PdfJsLibrary;
  document: PdfDocumentProxy;
}

export class CancelledError extends Error {
  constructor(message = "Conversion cancelled.") {
    super(message);
    this.name = "CancelledError";
  }
}

export class CancellationController implements CancellationToken {
  private value = false;

  get cancelled(): boolean {
    return this.value;
  }

  cancel(): void {
    this.value = true;
  }
}

export function throwIfCancelled(token: CancellationToken): void {
  if (token.cancelled) throw new CancelledError();
}

export async function yieldToInterface(): Promise<void> {
  const timerWindow = activeDocument.defaultView ?? activeWindow;
  await new Promise<void>((resolve) => {
    if (typeof timerWindow.requestAnimationFrame === "function") {
      timerWindow.requestAnimationFrame(() => resolve());
    } else {
      timerWindow.setTimeout(resolve, 0);
    }
  });
}

function destroyLoadingTask(task: PdfLoadingTask): void {
  const result = task.destroy?.();
  if (result) void result.catch(() => undefined);
}

export async function openPdfDocument(
  bytes: ArrayBuffer,
  passwordProvider?: PasswordProvider
): Promise<OpenPdfResult> {
  const pdfjs = (await loadPdfJs()) as PdfJsLibrary;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
    stopAtErrors: false,
    enableXfa: false,
    enableScripting: false
  });

  let passwordCancelled = false;
  if (passwordProvider) {
    loadingTask.onPassword = (updatePassword, reason) => {
      const incorrect = reason === pdfjs.PasswordResponses?.INCORRECT_PASSWORD;
      void passwordProvider(incorrect)
        .then((password) => {
          if (password === null) {
            passwordCancelled = true;
            destroyLoadingTask(loadingTask);
            return;
          }
          updatePassword(password);
        })
        .catch(() => {
          passwordCancelled = true;
          destroyLoadingTask(loadingTask);
        });
    };
  }

  try {
    return {
      pdfjs,
      document: await loadingTask.promise
    };
  } catch (error) {
    if (passwordCancelled) throw new CancelledError("PDF password entry was cancelled.");
    throw error;
  }
}
