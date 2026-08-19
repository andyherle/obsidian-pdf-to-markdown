# Contributing

Use focused pull requests. Explain the PDF type that the change improves and include a test when practical.

Before opening a pull request, run:

```bash
npm install
npm run validate
npm run lint
```

Do not add runtime network access, analytics, external converters, child processes, direct filesystem access, or permanent PDF deletion.

PDF fixtures can contain private data. Use generated or public-domain fixtures only.
