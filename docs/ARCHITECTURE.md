# Architecture

## Runtime boundary

The runtime has two dependencies:

1. Obsidian APIs.
2. Browser APIs available inside Obsidian.

There is no Python bridge, temporary operating-system staging folder, shell process, CDN, or conversion server.

## Conversion flow

```text
Vault PDF
  → Vault.readBinary
  → Obsidian loadPdfJs
  → positioned text, table candidates, and image canvases
  → in-memory preview
  → Vault Markdown and binary writes
  → exact link updates through Vault.process
  → optional FileManager trash or move for the PDF
```

The source action is the last step.

## Text

PDF text items are grouped into lines by baseline position. Lines are placed in a reading order with a conservative two-column detector. Repeated margin text is removed only when it occurs on most pages.

## Tables

Table detection is heuristic. It finds repeated horizontal text anchors across adjacent lines. A confidence score uses cell density, anchor distance, row count, column count, and cell length.

Markdown tables are padded for Source mode. Numeric columns are right aligned. HTML line breaks are replaced with semicolons.

SVG tables use text and rectangle elements only. The SVG is minified, has no scripts, and uses a `viewBox` for scaling.

## Images

PDF image drawing operations are decoded to a canvas. Images are resized before they are encoded as WebP, JPEG, or PNG. Duplicate byte hashes share one saved file.

Image-only pages are rendered as one compressed page image. The plugin does not use OCR.

## Link updates

The plugin uses `MetadataCache.resolvedLinks` to find notes that resolve to the source PDF. It changes only exact cached link ranges in normal Markdown content. Frontmatter and ordinary text are not changed.

Aliases, embeds, Markdown labels, and link titles are preserved. PDF page links become Markdown page-heading links when page headings are enabled.
