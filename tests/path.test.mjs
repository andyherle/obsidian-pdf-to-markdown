import test from "node:test";
import assert from "node:assert/strict";
import { TFile, TFolder } from "../.test-build/node_modules/obsidian/index.js";
import {
  availableFilePath,
  availableFolderPath,
  encodeMarkdownLinkPath,
  relativeVaultPath,
  safeFileName,
  sanitizeVaultFolder
} from "../.test-build/path.js";

test("file names are safe on macOS, Windows, Linux, and mobile", () => {
  assert.equal(safeFileName('Invoice: ACME / Q1?.pdf'), "Invoice ACME Q1.pdf");
  assert.equal(safeFileName("CON"), "CON_");
  assert.equal(safeFileName("AUX.txt"), "AUX_.txt");
  assert.equal(safeFileName("name. "), "name");
  assert.ok(Array.from(safeFileName("x".repeat(400))).length <= 180);
});

test("custom folders stay inside the Vault", () => {
  assert.equal(sanitizeVaultFolder("PDF Archive/2026"), "PDF Archive/2026");
  assert.equal(sanitizeVaultFolder("Exports\\Tables"), "Exports/Tables");
  assert.equal(sanitizeVaultFolder("CON/Invoices"), "CON_/Invoices");
  assert.throws(() => sanitizeVaultFolder("../Outside"), /inside the Vault|stay inside/);
  assert.throws(() => sanitizeVaultFolder("/Users/admin"), /relative path/);
  assert.throws(() => sanitizeVaultFolder("C:\\Users\\admin"), /relative path/);
  assert.throws(() => sanitizeVaultFolder("~/Documents"), /relative path/);
});

test("relative and encoded Markdown paths are stable", () => {
  assert.equal(relativeVaultPath("Notes/Index.md", "Assets/My File.webp"), "../Assets/My File.webp");
  assert.equal(encodeMarkdownLinkPath("../Assets/My File.webp"), "../Assets/My%20File.webp");
});


test("collision suffixes stay inside the cross-platform byte limit", () => {
  const existing = new Map();
  const longName = `${"é".repeat(88)}.md`;
  existing.set(longName.toLowerCase(), { path: longName });
  const app = {
    vault: {
      getAbstractFileByPath(path) {
        return existing.get(path.toLowerCase()) ?? null;
      },
      getAllLoadedFiles() {
        return [...existing.values()];
      }
    }
  };
  const filePath = availableFilePath(app, longName);
  assert.ok(new TextEncoder().encode(filePath.split("/").at(-1)).byteLength <= 180);

  const folderName = "界".repeat(60);
  existing.set(folderName.toLowerCase(), { path: folderName });
  const folderPath = availableFolderPath(app, folderName);
  assert.ok(new TextEncoder().encode(folderPath.split("/").at(-1)).byteLength <= 180);
});


test("path collisions are detected without depending on filesystem case rules", () => {
  const root = new TFolder("");
  const records = new TFolder("Records");
  const invoice = new TFile("Records/Invoice.md");
  root.children = [records];
  records.children = [invoice];
  const existing = new Map([
    [records.path, records],
    [invoice.path, invoice]
  ]);
  const app = {
    vault: {
      getRoot() {
        return root;
      },
      getAbstractFileByPath(path) {
        return existing.get(path) ?? null;
      }
    }
  };

  assert.equal(availableFilePath(app, "records/invoice.md"), "records/invoice (2).md");
});
