import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, ".build-local");
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const tscCandidates = [
  join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),
  "tsc"
];
let compiled = false;
let lastError;
for (const tsc of tscCandidates) {
  if (tsc.includes("node_modules") && !existsSync(tsc)) continue;
  try {
    execFileSync(tsc, [
      "--noCheck",
      "--target", "ES2021",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--rootDir", join(root, "src"),
      "--outDir", buildDir,
      "--skipLibCheck",
      "--esModuleInterop",
      "--noEmitOnError", "false",
      "--inlineSourceMap", "false",
      "--inlineSources", "false"
    ], { cwd: root, stdio: "inherit" });
    compiled = true;
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!compiled) throw lastError ?? new Error("TypeScript compiler not found.");

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const modules = collect(buildDir).sort();
const definitions = modules.map((file) => {
  const id = relative(buildDir, file).split("\\").join("/");
  const source = readFileSync(file, "utf8");
  return `${JSON.stringify(id)}: function(module, exports, require) {\n${source}\n}`;
}).join(",\n");

const bundle = `"use strict";
const __nativeRequire = require;
const __modules = {
${definitions}
};
const __cache = Object.create(null);
function __resolve(from, request) {
  if (!request.startsWith(".")) return request;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const parts = (base + request).split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  let id = stack.join("/");
  if (!id.endsWith(".js")) id += ".js";
  return id;
}
function __load(id, from = "main.js") {
  const resolved = __resolve(from, id);
  if (!resolved.endsWith(".js") || !Object.prototype.hasOwnProperty.call(__modules, resolved)) {
    return __nativeRequire(resolved);
  }
  if (__cache[resolved]) return __cache[resolved].exports;
  const module = { exports: {} };
  __cache[resolved] = module;
  const localRequire = (request) => __load(request, resolved);
  __modules[resolved](module, module.exports, localRequire);
  return module.exports;
}
const __entry = __load("main.js");
module.exports = __entry && Object.prototype.hasOwnProperty.call(__entry, "default") ? __entry.default : __entry;
`;
writeFileSync(join(root, "main.js"), bundle, "utf8");
rmSync(buildDir, { recursive: true, force: true });
console.log(`Built main.js from ${modules.length} modules.`);
