# Migrating V1 to V2 and publishing

Source: `https://opencode.ai/v2/docs/build/plugins/migrate-v1`.

## Migration

1. Rename config key `plugin` to `plugins`; turn tuples into `{ package, options }`.
2. Replace `export const X: Plugin = async (ctx) => hooks` with `export default Plugin.define({ id, setup })`.
3. Map each V1 hook to its V2 domain API (the page has the full table; for example tool hooks become `ctx.tool.hook`).
4. Return a cleanup function from `setup` instead of a `dispose` hook.
5. Remove uses of the Bun `$` helper.
6. Swap the dependency from `@opencode-ai/plugin` to `@opencode/plugin`.

V1 implementations do not run in V2. There is no compatibility shim.

## Publishing

- `https://opencode.ai/v2/docs/build/plugins/publish` returned 404 when checked; there is no official publish page.
- Practical path: publish an npm package whose `package.json` depends on a compatible `@opencode/plugin` range, then users add its name to `plugins` in their config.
- The ecosystem page on opencode.ai says only to submit a PR to the opencode repo's docs. The exact process is unverified: read the repo's `CONTRIBUTING` first and do not open a PR without the user's go-ahead.
- The scoped name for Mental, if ever published, would reuse the existing npm package only if it ships a plugin entry. Mental today is a CLI and skill pack; it has no OpenCode plugin.
