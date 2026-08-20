# Changelog

## 0.2.2

- Fixed cascading Community Plugin review warnings caused by incomplete Obsidian 1.13 `HistoryHandler` declarations.
- Added full dependency declaration checking so unresolved API types cannot be hidden by `skipLibCheck`.
- Added strict unsafe-value lint rules and made all lint warnings fail CI.
- Updated the TypeScript and ESLint analysis toolchain used for release validation.
- Kept the runtime fully local and compatible with Obsidian desktop and mobile.

## 0.2.1

- Added searchable declarative settings for Obsidian 1.13 and kept the existing settings screen for older versions.
- Hardened saved-settings and PDF-engine boundaries so unknown data is validated before use.
- Fixed Obsidian UI helper and browser timer guideline warnings.
- Fixed ESLint type-aware project configuration so Obsidian API types resolve correctly.
- Added signed GitHub build provenance attestations for release assets.

## 0.2.0

- Added local PDF text extraction through Obsidian's PDF engine.
- Added compressed WebP, JPEG, and PNG image export.
- Added compressed page snapshots for image-only PDFs.
- Added file-signature checks and a 16-megapixel memory limit for image exports.
- Added Markdown table detection and normalization.
- Added optional compact SVG table export.
- Added PDF, Markdown, source, and file previews.
- Added safe source PDF handling through Obsidian Trash or Vault moves.
- Added exact PDF link updates with alias and page-link preservation.
- Added desktop and mobile support without Node.js or external runtime tools.
- Added image-only page fallback, lower temporary canvas use, and graceful Markdown preview errors.
- Added transaction rollback for partial asset and link-update failures.
- Added UTF-8 filename limits, Windows reserved-name handling, and collision-safe output naming.
- Added source-PDF change checks before the final keep, Trash, or move action.
