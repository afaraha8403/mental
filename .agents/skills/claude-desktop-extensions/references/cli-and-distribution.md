# mcpb CLI, signing, distribution

Source: `https://github.com/modelcontextprotocol/mcpb` (`CLI.md`) and the Anthropic engineering post "Desktop Extensions".

## CLI

```
npm install -g @anthropic-ai/mcpb
mcpb init                       # interactive manifest.json
mcpb validate manifest.json
mcpb pack <dir> [output.mcpb]   # validates, excludes dev files, zips
mcpb info output.mcpb
mcpb sign output.mcpb --self-signed   # dev only
mcpb verify output.mcpb
mcpb unsign output.mcpb
```

`pack` validates the manifest and skips dev files; add a `.mcpbignore` (gitignore-style) to exclude more. Run `mcpb --help` for the flags of your installed version (certificate and key options on `sign`).

## Signing

- PKCS#7 signature over the bundle.
- `--self-signed` is for development and local testing.
- Production: sign with a real code-signing certificate so users and admins can verify the publisher.

## Install (end users)

Drag the `.mcpb` into Claude Desktop **Settings -> Extensions**, or double-click it. Claude Desktop prompts for `user_config` values and will not enable the extension until required ones are filled.

A plugin can also bundle a `.mcpb` via `mcpServers`; bundles extract to `.mcpb-cache/`. See `claude-desktop-plugins`.

## Directory submission

Test on Windows and macOS (whichever you declare), write clear `display_name`, `long_description`, icon, screenshots, a privacy policy if user data leaves the device, then submit through Anthropic's submission form (find the current link from the Desktop Extensions docs).

## Enterprise

Group Policy / MDM deployment, preinstalled extensions, blocklists, and private extension directories are supported for managed fleets. Prefer signed builds and pinned versions for rollouts.

## Release hygiene

- Bump `version` (semver) every release.
- Keep a changelog in the repo, not in the bundle.
- Re-run `mcpb validate` + `mcpb pack` in CI; fail on warnings.
- Build artifacts in CI from a clean checkout so `node_modules` match the declared runtime.
