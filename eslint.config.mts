import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";
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
    "eslint.config.mts",
    "scripts/**",
    "tests/**"
  ]),
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          mode: "loose",
          brands: ["Obsidian", "Markdown", "WebP", "Python", "Deleted files"],
          acronyms: ["PDF", "SVG", "PNG", "JPEG", "HTML", "OCR", "URL"],
          allowAutoFix: false,
          enforceCamelCaseLower: false
        }
      ]
    }
  },
  {
    files: ["src/settings.ts"],
    rules: {
      // Required only for the imperative fallback used by Obsidian before 1.13.0.
      "@typescript-eslint/no-deprecated": "off"
    }
  }
);
