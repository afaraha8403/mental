# Cursor

Sources: `https://cursor.com/docs/plugins`, `https://cursor.com/docs/reference/plugins`.

## Mental today

- `plugin.json` at the root is an Agent Plugins 1.0.0 manifest (skills only: `skills/mental-setup`; no MCP is started).
- `.cursor-plugin/plugin.json` carries the Cursor extras, including `logo: assets/logo.png`.
- Version is kept in lockstep by `bump-version.mjs`.

## Install routes that exist now

- Customize, Plugins, add source `https://github.com/afaraha8403/mental`.
- Symlink the repo to `~/.cursor/plugins/local/mental`, then restart or run Developer: Reload Window.
- Teams: Dashboard, Plugins and MCPs, Import from Repo (see `docs/install.md`; re-check current Cursor docs for refresh behavior).
- Cursor CLI has no marketplace install (plugin directory flag only).

## Public marketplace listing (not done yet)

1. Confirm the repo is open source (it is MIT) and the manifest is valid: `name` lowercase kebab-case, paths start with `./`.
2. Submit at `https://cursor.com/marketplace/publish`.
3. Every plugin and every later update is manually reviewed. Expect a delay between a push and users seeing it.
4. Only after approval does `/add-plugin mental` work. Until then docs must say "after Mental is listed", as `docs/install.md` does.
5. The community directory `cursor.directory` is separate and not the official store.

Do not submit without the user's go-ahead.
