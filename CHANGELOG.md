# Changelog

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
