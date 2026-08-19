# Repository instructions

## Runtime boundary

The plugin runtime can use only public Obsidian APIs and browser APIs available inside Obsidian.

Do not add:

- network requests or analytics;
- Node.js filesystem access;
- Electron access;
- child processes or shell commands;
- external converters;
- direct Vault adapter access;
- permanent source PDF deletion.

Use `Vault`, `FileManager`, `MetadataCache`, and `loadPdfJs()` where applicable.

## Source safety

The source PDF action must remain the final conversion step. The allowed actions are keep, `FileManager.trashFile()`, and `FileManager.renameFile()` to a Vault-relative folder.

Generated output rollback can use Obsidian Trash. It must never target the source PDF.

## Validation

Run before a pull request:

```bash
npm install
npm run validate
node --check main.js
```

Add or update a unit test for each parser, path, table, link, image, or transaction change. Do not commit private PDF fixtures.
