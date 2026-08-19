import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = join(root, ".bundle-smoke");
const moduleFolder = join(temp, "node_modules", "obsidian");
rmSync(temp, { recursive: true, force: true });
mkdirSync(moduleFolder, { recursive: true });
writeFileSync(join(temp, "package.json"), '{"type":"commonjs"}\n');
writeFileSync(join(moduleFolder, "package.json"), '{"name":"obsidian","main":"index.js","type":"commonjs"}\n');
writeFileSync(join(moduleFolder, "index.js"), `
class Base {}
class Plugin extends Base {}
class PluginSettingTab extends Base {}
class Modal extends Base {}
class FuzzySuggestModal extends Base {}
class TAbstractFile extends Base {}
class TFile extends TAbstractFile {}
class TFolder extends TAbstractFile {}
class Setting extends Base {}
class Notice extends Base {}
class Menu extends Base {}
const MarkdownRenderer = { render: async () => {} };
const activeDocument = globalThis.document ?? { createElement: () => ({}) };
const activeWindow = globalThis;
const Platform = { isMobile: false };
const normalizePath = (value) => String(value).replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/").replace(/^\\/+|\\/+$/g, "");
module.exports = { Plugin, PluginSettingTab, Modal, FuzzySuggestModal, TAbstractFile, TFile, TFolder, Setting, Notice, Menu, MarkdownRenderer, activeDocument, activeWindow, Platform, normalizePath, loadPdfJs: async () => ({}) };
`);
copyFileSync(join(root, "main.js"), join(temp, "main.cjs"));
try {
  const require = createRequire(import.meta.url);
  const loaded = require(join(temp, "main.cjs"));
  const plugin = typeof loaded === "function" ? loaded : loaded?.default;
  if (typeof plugin !== "function") {
    throw new Error("main.js does not export an Obsidian plugin class.");
  }
  console.log(`Bundle smoke test passed: ${plugin.name || "plugin class"}.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
