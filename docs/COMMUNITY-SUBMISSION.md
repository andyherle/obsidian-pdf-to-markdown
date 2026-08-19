# Community submission checklist

Repository: `andyherle/obsidian-pdf-to-markdown`

Plugin ID: `pdf-native-notes`

Release version: `0.2.0`

Before submission:

- [ ] Make the GitHub repository public.
- [ ] Confirm the default branch contains the complete source and current `manifest.json`.
- [ ] Run `npm install`.
- [ ] Run `npm run validate`.
- [ ] Confirm `manifest.json`, `package.json`, and `versions.json` use the same version.
- [ ] Create a Git tag that exactly matches the manifest version. Do not add a `v` prefix.
- [ ] Confirm the GitHub release contains `main.js`, `manifest.json`, and `styles.css`.
- [ ] Install the release in a clean test Vault on macOS, Windows, Linux, iOS, and Android where available.
- [ ] Test a text PDF, a table PDF, a scanned PDF, a password-protected PDF, and a PDF with embedded images.
- [ ] Confirm source PDFs are only kept, moved, or moved to Obsidian Trash.
- [ ] Submit the repository through the Obsidian Community directory.

Known review note: the plugin does not use OCR. Image-only pages are preserved as compressed images.
