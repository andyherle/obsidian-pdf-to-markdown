import test from "node:test";
import assert from "node:assert/strict";
import { TFile } from "../.test-build/node_modules/obsidian/index.js";
import { applyLinkPlans } from "../.test-build/links/links.js";
import { DEFAULT_SETTINGS } from "../.test-build/types.js";

function file(path, content = "") {
  const value = new TFile(path);
  value.content = content;
  value.stat = { mtime: 10, size: new TextEncoder().encode(content).byteLength };
  return value;
}

function reference(original) {
  return {
    start: 0,
    end: original.length,
    original,
    style: "wiki",
    embed: false,
    alias: "",
    subpath: ""
  };
}

test("partial link updates are restored when a later note fails", async () => {
  const original = "[[Invoice.pdf]]";
  const first = file("Notes/A.md", original);
  const second = file("Notes/B.md", original);
  const note = file("Docs/Invoice.md");
  const source = file("Docs/Invoice.pdf");
  const events = [];

  const app = {
    metadataCache: {
      fileToLinktext() {
        return "Invoice";
      }
    },
    vault: {
      async process(target, change) {
        if (target === second) throw new Error("second link write failed");
        target.content = change(target.content);
        events.push(`${target.path}:${target.content}`);
        return target.content;
      }
    }
  };

  const plans = [first, second].map((target) => ({
    file: target,
    references: [reference(original)],
    originalMtime: target.stat.mtime,
    originalSize: target.stat.size
  }));

  await assert.rejects(
    () => applyLinkPlans(app, plans, note, source, { ...DEFAULT_SETTINGS, sourceAction: "trash", title: "Invoice" }),
    /second link write failed/
  );
  assert.equal(first.content, original);
  assert.equal(second.content, original);
  assert.equal(events.at(-1), `Notes/A.md:${original}`);
});


test("same-stem note links use an explicit Markdown path", async () => {
  const original = "[[Invoice.pdf]]";
  const sourceFile = file("Notes/A.md", original);
  const note = file("Docs/Invoice.md");
  const source = file("Docs/Invoice.pdf");
  const app = {
    metadataCache: {
      fileToLinktext() {
        return "Invoice";
      }
    },
    vault: {
      async process(target, change) {
        target.content = change(target.content);
        return target.content;
      }
    }
  };
  const plan = {
    file: sourceFile,
    references: [reference(original)],
    originalMtime: sourceFile.stat.mtime,
    originalSize: sourceFile.stat.size
  };

  await applyLinkPlans(
    app,
    [plan],
    note,
    source,
    { ...DEFAULT_SETTINGS, sourceAction: "trash", title: "Invoice" }
  );
  assert.equal(sourceFile.content, "[[Docs/Invoice.md]]");
});
