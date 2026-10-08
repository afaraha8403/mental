# VS Code extensions for Cursor

Cursor is built on Code OSS, so VS Code extensions run in it. This is the supported way to add real UI (panels, views, commands). Primary doc for Cursor behavior: `https://cursor.com/help/customization/extensions`. API docs: `https://code.visualstudio.com/api`. Open VSX publishing: `https://github.com/eclipse/openvsx/wiki/Publishing-Extensions`.

Verified from the Cursor doc: Cursor uses Open VSX, proxied and scanned; the same `publisher.extension` ID can point to different code on Open VSX than on the Microsoft Marketplace; Anysphere ships replacement builds for some extensions; admins can allowlist, require signatures and set an install cooldown.

Not verified here: the exact set of VS Code APIs that Cursor lacks. Test in Cursor.

## Build

1. Scaffold with the Yeoman generator (`npx --package yo --package generator-code -- yo code`) or by hand.
2. UI surfaces: `vscode.window.createWebviewPanel`, `registerWebviewViewProvider` (sidebar or panel view), tree views, commands, status bar items.
3. Keep `engines.vscode` compatible with the Code OSS version Cursor reports under Help, About.
4. Webviews: set a strict Content Security Policy, load local assets through `webview.asWebviewUri`, and validate every message from the webview.

## Test in Cursor

- Run the Extension Development Host from the repo, or
- Package with `vsce package` and install the `.vsix` through Extensions, Install from VSIX.

Do not assume VS Code behavior matches Cursor. Check activation and the webview in Cursor itself.

## Publish to Open VSX

```bash
npm i -g ovsx
ovsx create-namespace <publisher> -p $OVSX_TOKEN
ovsx publish ./extension.vsix -p $OVSX_TOKEN
```

- Create an Open VSX account, sign the publisher agreement, and generate a token. Keep it in a CI secret named for its purpose; never print or commit it.
- The `publisher` in `package.json` must be a namespace you own.
- Publishing to the Microsoft Marketplace (`vsce publish`) is separate and does not reach Cursor.
- Request a verification badge from the publisher page after the first release if wanted.

## Maintenance

- Re-publish on every release; Cursor's proxy re-scans new versions.
- Enterprise users may be blocked by allowlist or cooldown. That is an admin policy, not a bug.
