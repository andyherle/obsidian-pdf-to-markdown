import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const version = manifest.version;
const releaseRoot = join("release", version);
const pluginFolder = join(releaseRoot, manifest.id);
const required = ["main.js", "manifest.json", "styles.css"];

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(pluginFolder, { recursive: true });

const checksums = [];
for (const file of required) {
  const bytes = readFileSync(file);
  copyFileSync(file, join(pluginFolder, file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  checksums.push(`${digest}  ${file}`);
}

writeFileSync(join(releaseRoot, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
writeFileSync(
  join(releaseRoot, "RELEASE-NOTES.md"),
  `# ${manifest.name} ${version}\n\n` +
    "This release is a native Obsidian plugin. It uses no Python, external converter, runtime download, or network service.\n\n" +
    "GitHub release assets required by Obsidian:\n\n" +
    required.map((file) => `- ${file}`).join("\n") +
    `\n\nManual install folder: \`${manifest.id}\`\n`
);

console.log(`Staged ${manifest.name} ${version} in ${releaseRoot}.`);
