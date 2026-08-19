# Build report

Date: 2026-08-19

Release: 0.2.0

Plugin ID: `pdf-native-notes`

## Completed

- Replaced the old Python and staging workflow with a native Obsidian plugin.
- Added local PDF text extraction through Obsidian's `loadPdfJs()` API.
- Added editable Markdown table output and optional compact standard SVG table output.
- Added WebP, JPEG, and PNG image compression with dimension and memory limits.
- Added compressed page snapshots for scanned or image-only pages.
- Added PDF, rendered Markdown, source Markdown, and output-file previews.
- Added safe PDF keep, Obsidian Deleted files, and Vault-folder move actions.
- Added exact link migration with alias, embed, title, and page-anchor preservation.
- Added rollback for partial file and link-update failures.
- Added cross-platform filename and path checks.
- Added CI, release automation, issue templates, security, privacy, and Community submission documents.

## Local validation

- Unit tests: 33 passed, 0 failed.
- Strict TypeScript check: passed against the local Obsidian API test declarations.
- Local production bundle: passed.
- Bundle syntax and export smoke test: passed.
- Release consistency and runtime-boundary validation: passed.
- Runtime scan found no network calls, Node.js runtime imports, direct Vault adapter access, or direct permanent-delete API calls.

## Required live validation

The plugin still needs a final smoke test inside current Obsidian builds on representative desktop and mobile platforms. Test text PDFs, tables, embedded images, scanned pages, password-protected PDFs, large files, source actions, and link updates before Community directory submission.

The build environment could not install npm packages from the public registry. GitHub Actions must run the official Obsidian ESLint configuration and the normal esbuild production build after the source is pushed.
