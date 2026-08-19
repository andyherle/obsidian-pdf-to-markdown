# Security policy

## Supported versions

Security fixes are made on the latest release.

## Report a vulnerability

Do not publish a sensitive security report as a public issue. Use GitHub's private vulnerability reporting feature for this repository.

Include:

- the affected version;
- the platform and Obsidian version;
- the smallest PDF or reproduction steps that show the problem;
- the expected and actual behavior.

## Security boundaries

The plugin uses Obsidian's Vault, FileManager, MetadataCache, and bundled PDF APIs. It does not start processes, use Node.js filesystem APIs at runtime, or request data from the network.

Source PDFs are only kept, moved through Obsidian, or moved through Obsidian Trash. The plugin does not permanently delete a source PDF.
