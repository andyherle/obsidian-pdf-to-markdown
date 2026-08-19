import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    ".test-build",
    ".build-local",
    "release",
    "main.js",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "versions.json",
    "esbuild.config.mjs",
    "scripts/**",
    "tests/**"
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mts", "manifest.json"]
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"]
      }
    }
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          mode: "loose",
          brands: ["Obsidian", "Markdown", "WebP"],
          acronyms: ["PDF", "SVG", "PNG", "JPEG", "HTML", "OCR", "URL"],
          allowAutoFix: false,
          enforceCamelCaseLower: false
        }
      ]
    }
  }
);
