# Publishing

This project is a VS Code extension. The Marketplace package is produced from the compiled `dist` directory and the manifest in `package.json`.

## One-Time Setup

1. Create a publisher in the Visual Studio Marketplace publisher management page.
2. Make sure `package.json` has the matching `publisher` value.
3. Install the VS Code Extension Manager:

```sh
npm install -g @vscode/vsce
```

4. Authenticate:

```sh
vsce login <publisher-id>
```

Microsoft recommends Entra ID based automated publishing for CI/CD. Personal Access Tokens still work today, but global Azure DevOps PATs are scheduled for retirement on December 1, 2026.

## Package Locally

```sh
npm run package
```

This creates a `.vsix` file. Install it locally with:

```sh
code --install-extension jpsql-runner-0.0.1.vsix
```

## Publish

```sh
npm run publish:marketplace
```

## GitHub Release

1. Commit all source changes.
2. Create a tag, for example `v0.0.1`.
3. Upload the generated `.vsix` to the GitHub release.
