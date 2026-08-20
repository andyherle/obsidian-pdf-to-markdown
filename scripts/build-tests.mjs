import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".test-build");
const stubFolder = join(output, "node_modules", "obsidian");
rmSync(output, { recursive: true, force: true });
mkdirSync(stubFolder, { recursive: true });
writeFileSync(join(stubFolder, "package.json"), JSON.stringify({
  name: "obsidian",
  version: "0.0.0-test",
  type: "module",
  exports: "./index.js"
}, null, 2) + "\n");
writeFileSync(join(stubFolder, "index.js"), `
export class TAbstractFile {
  constructor(path = "") {
    this.path = path;
    this.name = path.split("/").pop() || "";
  }
}
export class TFile extends TAbstractFile {
  constructor(path = "") {
    super(path);
    const dot = this.name.lastIndexOf(".");
    this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.stat = { mtime: 0, size: 0 };
  }
}
export class TFolder extends TAbstractFile {
  constructor(path = "") {
    super(path);
    this.children = [];
  }
}
export function normalizePath(value) {
  return String(value)
    .replace(/\\\\/g, "/")
    .replace(/\\/{2,}/g, "/")
    .replace(/^\\.\\//, "")
    .replace(/^\\/+|\\/+$/g, "");
}
`);

const candidates = [
  join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
  "tsc"
];
const sources = [
  "src/types.ts",
  "src/path.ts",
  "src/markdown/tables.ts",
  "src/markdown/document.ts",
  "src/links/syntax.ts",
  "src/links/links.ts",
  "src/conversion/apply.ts",
  "src/svg/table-svg.ts",
  "src/pdf/dimensions.ts",
  "src/pdf/pixels.ts",
  "src/pdf/text.ts",
  "src/pdf/tables.ts"
].map((path) => join(root, path));

let built = false;
let lastError;
for (const compiler of candidates) {
  if (compiler.includes("node_modules") && !existsSync(compiler)) continue;
  try {
    execFileSync(compiler, [
      "--ignoreConfig",
      "--noCheck",
      "--target", "ES2022",
      "--module", "ES2022",
      "--moduleResolution", "Bundler",
      "--outDir", output,
      "--rootDir", join(root, "src"),
      ...sources
    ], { cwd: root, stdio: "inherit" });
    built = true;
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!built) throw lastError ?? new Error("TypeScript compiler not found.");

function compiledFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : compiledFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

for (const file of compiledFiles(output)) {
  const source = readFileSync(file, "utf8");
  const updated = source.replace(
    /(from\s+["']|import\s*["'])(\.{1,2}\/[^"']+?)(["'])/g,
    (match, prefix, specifier, suffix) => /\.[a-z0-9]+$/i.test(specifier)
      ? match
      : `${prefix}${specifier}.js${suffix}`
  );
  writeFileSync(file, updated);
}
