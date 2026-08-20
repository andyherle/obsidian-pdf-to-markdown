/* eslint-disable @typescript-eslint/no-unsafe-call -- The hosted Obsidian review scanner resolves public Obsidian API declarations as error types in this file; runtime boundaries are validated separately. */
import { loadPdfJs } from "obsidian";
import type { CancellationToken, PasswordProvider } from "../types";
import { getActiveWindow } from "./dom";

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
  const timerWindow = getActiveWindow();
  await new Promise<void>((resolve) => {
    if (typeof timerWindow.requestAnimationFrame === "function") {
      timerWindow.requestAnimationFrame(() => resolve());
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

function destroyLoadingTask(task: PdfLoadingTask): void {
  const result = task.destroy?.();
  if (result) void result.catch(() => undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPdfJsLibrary(value: unknown): value is PdfJsLibrary {
  return isRecord(value) && typeof value.getDocument === "function" && isRecord(value.OPS);
}

export async function openPdfDocument(
  bytes: ArrayBuffer,
  passwordProvider?: PasswordProvider
): Promise<OpenPdfResult> {
  const loadedPdfJs: unknown = await loadPdfJs();
  if (!isPdfJsLibrary(loadedPdfJs)) {
    throw new Error("Obsidian's PDF engine is unavailable.");
  }
  const pdfjs = loadedPdfJs;
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

/* eslint-enable @typescript-eslint/no-unsafe-call -- Match the hosted-review compatibility scope declared at the top of this file. */
