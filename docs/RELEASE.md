# Release process

## Before the first Community submission

1. Make the GitHub repository public.
2. Install the source in a clean test Vault.
3. Test macOS, Windows, Linux, iOS, and Android where available.
4. Run the complete local validation:

```bash
npm install
npm run validate
node --check main.js
```

5. Confirm these values match:

- `manifest.json` version;
- `package.json` version;
- the matching key in `versions.json`;
- the Git tag.

## Publish 0.2.0

The old internal desktop build used plugin ID `pdf-native-notes` through version `0.1.2`. The native rewrite starts at `0.2.0` and keeps that ID so existing manual installations can replace the old plugin.

```bash
git switch main
git pull --ff-only
npm install
npm run validate
git add -A
git commit -m "Release PDF to Markdown Native 0.2.0"
git tag 0.2.0
git push origin main 0.2.0
```

The release workflow attaches these files as separate release assets:

```text
main.js
manifest.json
styles.css
```

## Community directory

After the release exists, submit the default branch through the Obsidian Community directory. The repository must be public, and the release tag must exactly match the manifest version without a `v` prefix.
