import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

const runtimeSource = sourceFiles("src").map((path) => readFileSync(path, "utf8")).join("\n");
for (const [label, pattern] of [
  ["network request", /\b(?:fetch|requestUrl|ajax|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/],
  ["Node.js runtime import", /(?:from\s+["'](?:node:|fs["']|path["']|child_process["']|electron["'])|require\(["'](?:node:|fs["']|path["']|child_process["']|electron["']))/],
  ["direct Vault adapter access", /\.vault\.adapter\b/],
  ["permanent Vault deletion", /\.vault\.delete\s*\(/],
  ["global browser context", /\b(?:globalThis|window)\s*(?:\.|\[)/],
  ["full-vault file iteration", /\.vault\.(?:getAllLoadedFiles|getFiles)\s*\(/]
]) {
  if (pattern.test(runtimeSource)) throw new Error(`Runtime source contains ${label}.`);
}

const settingsSource = readFileSync("src/settings.ts", "utf8");
if (/createEl\(\s*["']h[1-6]["']/.test(settingsSource)) {
  throw new Error("Settings must use Setting.setHeading(), not manual HTML headings.");
}

const required = ["main.js", "manifest.json", "styles.css"];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing release file: ${file}`);
  if (statSync(file).size === 0) throw new Error(`Release file is empty: ${file}`);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));

requireText(manifest.id, "manifest.json id");
requireText(manifest.name, "manifest.json name");
const description = requireText(manifest.description, "manifest.json description");
requireText(manifest.author, "manifest.json author");
requireText(manifest.minAppVersion, "manifest.json minAppVersion");

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("manifest.json version must use x.y.z format.");
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
  throw new Error("manifest.json minAppVersion must use x.y.z format.");
}
if (manifest.version !== pkg.version) {
  throw new Error("manifest.json and package.json versions do not match.");
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error("versions.json does not match manifest.json.");
}
if (!/^[a-z0-9-]+$/.test(manifest.id) || manifest.id.includes("obsidian")) {
  throw new Error("The plugin ID must be lowercase, unique, and must not contain obsidian.");
}
if (description.length > 250 || /[\r\n]/.test(description)) {
  throw new Error("The manifest description must be one line and no more than 250 characters.");
}
if (manifest.isDesktopOnly !== false) {
  throw new Error("The plugin must remain cross-platform.");
}
if (pkg.main !== "main.js" || pkg.type !== "module") {
  throw new Error("package.json must keep the standard Obsidian main and module fields.");
}
if (pkg.repository?.url !== "git+https://github.com/andyherle/obsidian-pdf-to-markdown.git") {
  throw new Error("package.json repository URL is incorrect.");
}

const bundle = readFileSync("main.js", "utf8");
for (const forbidden of [
  'require("fs")',
  "require('fs')",
  'require("node:fs")',
  "require('node:fs')",
  'require("child_process")',
  "require('child_process')",
  'require("node:child_process")',
  "require('node:child_process')",
  'require("electron")',
  "require('electron')"
]) {
  if (bundle.includes(forbidden)) throw new Error(`Runtime bundle contains forbidden access: ${forbidden}`);
}
if (!bundle.includes('require("obsidian")') && !bundle.includes("require('obsidian')")) {
  throw new Error("Runtime bundle does not reference the Obsidian API.");
}
if (/sourceMappingURL|sourcesContent/.test(bundle)) {
  throw new Error("Runtime bundle contains an embedded source map.");
}

console.log(`Validated ${manifest.name} ${manifest.version}.`);
