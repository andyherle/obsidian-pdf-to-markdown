# PDF to Markdown Native

Convert PDFs in your Obsidian Vault into clean Markdown without Python, terminal commands, external services, or network access.

The plugin uses Obsidian's own PDF engine and Vault APIs. It is built for Obsidian desktop and mobile.

## Features

- Extract text from text-based PDFs.
- Detect simple tables and export them as readable Markdown.
- Optionally export detected tables as compact, minified SVG files.
- Extract embedded PDF images.
- Compress images as WebP, JPEG, or PNG.
- Limit image dimensions and ignore small icons.
- Preserve scanned or image-only pages as compressed page images.
- Preview the PDF, rendered Markdown, source Markdown, and output files before saving.
- Keep the source PDF, move it to Obsidian Trash, or move it to a Vault folder.
- Update links that resolve to the source PDF while keeping existing aliases.
- Save plain Markdown with no generated frontmatter.
- Normalize Markdown tables and remove HTML `<br>` tags from table cells.

## What the plugin does not do

- It does not use OCR. A scanned PDF has no extractable text unless the PDF already contains a text layer.
- It does not send files to a server.
- It does not read or write outside the Vault.
- It does not permanently delete source PDFs.
- It does not guarantee perfect layout recovery. PDF files store positioned drawing commands, not document structure. Complex tables and unusual reading orders can need manual cleanup.

## Use

1. Put a PDF inside the Vault.
2. Right-click the PDF.
3. Select **Convert PDF to Markdown**.
4. Review the preview and output paths.
5. Select **Convert**.

You can also open a PDF and run **PDF to Markdown Native: Convert current PDF to Markdown** from the command palette.

## Image compression

The default format is WebP at 82% quality with a maximum edge of 2200 pixels. Change these values in **Settings → Community plugins → PDF to Markdown Native**. Very large output canvases are limited to 16 megapixels to protect memory on desktop and mobile. When no resize is needed, WebP and PNG encoding reuse the source canvas to avoid a second full-size copy.

If a platform cannot encode WebP, the plugin uses PNG and shows a warning. It never saves non-WebP data with a `.webp` extension.

## Table output

The table setting has three options:

- **Editable Markdown**: best for notes and data that you will edit.
- **Compact SVG**: best when visual layout is more important. SVG output is minified and scalable.
- **Markdown and SVG**: saves both forms.

The SVG option is not `.svgz`. Standard `.svg` is more reliable in Obsidian and across mobile platforms. The generated SVG markup is compact and has no embedded scripts, external fonts, or external resources.

## Source PDF safety

Source actions run after the Markdown, assets, and link updates are saved.

- **Leave in place** does not change the PDF.
- **Move to Trash** uses Obsidian's configured Trash behavior.
- **Move to folder** uses Obsidian's file manager and stays inside the Vault.

The plugin never calls a permanent delete operation for a source PDF.

## Privacy

Conversion is local. The plugin does not make network requests, collect analytics, or store PDF passwords. See [PRIVACY.md](PRIVACY.md).

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder inside your Vault:

   `.obsidian/plugins/pdf-native-notes/`

3. Copy the three files into that folder.
4. Reload Obsidian.
5. Enable **PDF to Markdown Native** in Community Plugins.

## Upgrade from the old 0.1.x build

Version 0.2.0 is a complete native rewrite of the earlier desktop-only plugin. It keeps the `pdf-native-notes` plugin ID so existing installations can upgrade. The native runtime ignores old Python and staging files, but those unused files can remain after a manual upgrade.

For a clean one-time upgrade from 0.1.x:

1. Disable the old plugin.
2. Remove `.obsidian/plugins/pdf-native-notes/`.
3. Create the folder again and copy in the 0.2.0 `main.js`, `manifest.json`, and `styles.css` files.
4. Reload Obsidian and enable **PDF to Markdown Native**.

Old settings that do not match the new format are replaced with safe defaults. No Python, setup script, or external staging folder is used.

## Development

Requirements:

- Node.js 20 or newer.
- npm.

Commands:

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
npm run validate
```

`npm run build` creates `main.js` in the repository root. The release files are:

```text
main.js
manifest.json
styles.css
```

## Release

The Git tag must match the version in `manifest.json`, without a `v` prefix.

For the native rewrite release:

```bash
npm run validate
git tag 0.2.0
git push origin main 0.2.0
```

For later releases, use `npm version patch`, `npm version minor`, or `npm version major`. The release workflow builds the plugin and uploads the required files to a GitHub release.

## Licence

MIT. See [LICENSE](LICENSE).
