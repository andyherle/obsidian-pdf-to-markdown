import { readFileSync, writeFileSync } from "node:fs";

const target = process.env.npm_package_version;
if (!target) throw new Error("npm_package_version is missing.");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
manifest.version = target;
versions[target] = manifest.minAppVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
