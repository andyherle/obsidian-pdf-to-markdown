/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- The hosted Obsidian review scanner resolves public Obsidian API declarations as error types in this file; runtime boundaries are validated separately. */
import { normalizePath, TFolder, type App, type TAbstractFile } from "obsidian";

const WINDOWS_RESERVED_STEM = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;
const MAX_FILE_NAME_BYTES = 180;
const MAX_EXTENSION_BYTES = 32;
const UTF8_ENCODER = new TextEncoder();

function utf8Length(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const size = utf8Length(character);
    if (bytes + size > maxBytes) break;
    output += character;
    bytes += size;
  }
  return output;
}

function cleanFileName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|#[\]]/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\./g, ".")
    .replace(/[. ]+$/g, "");
}

function splitExtension(value: string): { stem: string; suffix: string } {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { stem: value, suffix: "" };
  const suffix = value.slice(dot);
  return utf8Length(suffix) <= MAX_EXTENSION_BYTES
    ? { stem: value.slice(0, dot), suffix }
    : { stem: value, suffix: "" };
}

function truncateFileName(value: string): string {
  if (utf8Length(value) <= MAX_FILE_NAME_BYTES) return value;
  const { stem, suffix } = splitExtension(value);
  const stemBudget = Math.max(1, MAX_FILE_NAME_BYTES - utf8Length(suffix));
  return `${truncateUtf8(stem, stemBudget)}${suffix}`.replace(/[. ]+$/g, "");
}

function avoidWindowsReservedName(value: string): string {
  const firstDot = value.indexOf(".");
  const stem = firstDot > 0 ? value.slice(0, firstDot) : value;
  if (!WINDOWS_RESERVED_STEM.test(stem)) return value;
  return firstDot > 0 ? `${stem}_${value.slice(firstDot)}` : `${value}_`;
}

function collisionName(
  value: string,
  index: number,
  fallback: string,
  preserveExtension: boolean
): string {
  const cleaned = cleanFileName(value) || cleanFileName(fallback) || "Converted PDF";
  const marker = ` (${index})`;
  const parts = preserveExtension ? splitExtension(cleaned) : { stem: cleaned, suffix: "" };
  const stemBudget = Math.max(
    1,
    MAX_FILE_NAME_BYTES - utf8Length(marker) - utf8Length(parts.suffix)
  );
  const stem = truncateUtf8(parts.stem, stemBudget).replace(/[. ]+$/g, "") || "File";
  return avoidWindowsReservedName(`${stem}${marker}${parts.suffix}`);
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function withoutExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function joinPath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
  return joined ? normalizePath(joined) : "";
}

export function safeFileName(value: string, fallback = "Converted PDF"): string {
  const cleaned = cleanFileName(value) || cleanFileName(fallback);
  if (!cleaned) return "";
  return truncateFileName(avoidWindowsReservedName(cleaned));
}

export function sanitizeVaultFolder(value: string): string {
  const raw = value.trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^(?:\/|[A-Za-z]:|~(?:\/|$))/.test(raw)) {
    throw new Error("Use a relative path inside the Vault, not an absolute path.");
  }

  const rawParts = raw.split("/").filter(Boolean);
  if (rawParts.length === 0 || rawParts.some((part) => part === "." || part === "..")) {
    throw new Error("The folder must stay inside the Vault.");
  }
  const parts = rawParts.map((part) => safeFileName(part, ""));
  if (parts.some((part) => !part)) {
    throw new Error("The folder contains a name that cannot be used.");
  }
  return normalizePath(parts.join("/"));
}

function findLoadedPath(app: App, path: string): TAbstractFile | null {
  const normalized = normalizePath(path);
  const exact = app.vault.getAbstractFileByPath(normalized);
  if (exact || !normalized) return exact;

  const getRoot = app.vault.getRoot?.bind(app.vault);
  if (typeof getRoot !== "function") return null;
  let current: TAbstractFile = getRoot();
  for (const part of normalized.split("/")) {
    if (!(current instanceof TFolder)) return null;
    const folded = part.normalize("NFC").toLowerCase();
    const child = current.children.find(
      (item) => item.name.normalize("NFC").toLowerCase() === folded
    );
    if (!child) return null;
    current = child;
  }
  return current;
}

function canonicalFolderPath(app: App, path: string): string {
  const normalized = path ? normalizePath(path) : "";
  if (!normalized) return "";
  const getRoot = app.vault.getRoot?.bind(app.vault);
  if (typeof getRoot !== "function") return normalized;

  let current: TFolder = getRoot();
  const parts = normalized.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    const folded = parts[index].normalize("NFC").toLowerCase();
    const child = current.children.find(
      (item) => item.name.normalize("NFC").toLowerCase() === folded
    );
    if (!(child instanceof TFolder)) {
      return joinPath(current.path, ...parts.slice(index));
    }
    current = child;
  }
  return current.path;
}

export function availableFilePath(app: App, desiredPath: string): string {
  const normalized = normalizePath(desiredPath);
  const folder = canonicalFolderPath(app, dirname(normalized));
  const name = basename(normalized);
  const desired = joinPath(folder, name);
  if (!findLoadedPath(app, desired)) return desired;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = dot > 0 ? name.slice(dot) : "";
  for (let index = 2; index < 10000; index += 1) {
    const candidateName = collisionName(`${stem}${suffix}`, index, "Converted PDF", true);
    const candidate = joinPath(folder, candidateName);
    if (!findLoadedPath(app, candidate)) return candidate;
  }
  throw new Error(`Could not find an available path for ${desired}.`);
}

export function availableFolderPath(app: App, desiredPath: string): string {
  const normalized = normalizePath(desiredPath);
  const folder = canonicalFolderPath(app, dirname(normalized));
  const name = basename(normalized);
  const desired = joinPath(folder, name);
  if (!findLoadedPath(app, desired)) return desired;
  for (let index = 2; index < 10000; index += 1) {
    const candidateName = collisionName(name, index, "Converted PDF", false);
    const candidate = joinPath(folder, candidateName);
    if (!findLoadedPath(app, candidate)) return candidate;
  }
  throw new Error(`Could not find an available folder for ${desired}.`);
}

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = folderPath ? normalizePath(folderPath) : "";
  if (!normalized) return;
  const existing = findLoadedPath(app, normalized);
  if (existing) {
    if (!(existing instanceof TFolder)) throw new Error(`A file already exists at ${normalized}.`);
    return;
  }

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    const requested = joinPath(current, part);
    const item = findLoadedPath(app, requested);
    if (!item) {
      await app.vault.createFolder(requested);
      current = requested;
    } else if (!(item instanceof TFolder)) {
      throw new Error(`A file blocks the folder path ${requested}.`);
    } else {
      current = item.path;
    }
  }
}

export function relativeVaultPath(fromFilePath: string, toFilePath: string): string {
  const fromParts = dirname(fromFilePath).split("/").filter(Boolean);
  const toParts = normalizePath(toFilePath).split("/").filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const up = Array.from({ length: fromParts.length - common }, () => "..");
  const down = toParts.slice(common);
  const result = [...up, ...down].join("/");
  return result || basename(toFilePath);
}

export function encodeMarkdownLinkPath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/%3A/gi, ":"))
    .join("/");
}

/* eslint-enable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Match the hosted-review compatibility scope declared at the top of this file. */
