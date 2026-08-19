# Testing

## Automated checks

```bash
npm test
npm run check
npm run build
node scripts/validate-release.mjs
```

The automated suite currently contains 31 tests. It covers rollback order, link rollback, path safety, Markdown table cleanup, PDF page-anchor conversion, image dimension limits, raw pixel classification, text layout, table detection, settings normalization, and SVG table output.

## Manual matrix

Test each source action:

- keep;
- Obsidian Deleted files setting with system trash enabled;
- Obsidian Deleted files setting with local `.trash` enabled;
- move to an existing Vault folder;
- move to a missing Vault folder;
- destination name conflict.

Test each asset mode:

- no images;
- note folder;
- Obsidian attachment folder;
- WebP;
- PNG;
- JPEG;
- duplicate images;
- SVG table output;
- Markdown and SVG table output.

Test links:

```markdown
[[Source.pdf]]
[[Source.pdf|Alias]]
![[Source.pdf#page=2]]
[Label](Source.pdf)
![Label](Source.pdf#page=2 "Title")
```

Confirm code fences, inline code, frontmatter, and ordinary text are unchanged.
