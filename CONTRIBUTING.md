# Contributing

Thanks for helping improve JPSQL Runner.

## Development

```sh
npm install
npm run check
```

Use VS Code's `Run Extension` launch configuration to open an Extension Development Host.

## Pull Requests

- Keep changes focused.
- Run `npm run check` before opening a pull request.
- Update `README.md` or `CHANGELOG.md` when behavior changes.
- Do not add product names or trademarks unless they are needed for compatibility documentation.

## Release Checklist

1. Update `CHANGELOG.md`.
2. Run `npm run check`.
3. Package with `npm run package`.
4. Smoke test the generated `.vsix`.
5. Publish with `npm run publish:marketplace`.
