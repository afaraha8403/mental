# Unofficial: Explodex (macOS only)

**Not an OpenAI product, not supported by OpenAI, and macOS-only.** Use the official Plugin Extensions path (`SKILL.md`) for anything you ship. Mention Explodex only if the user explicitly wants to change the app chrome itself (for example a button above the composer) and accepts the risk.

Source: `https://github.com/dan-dr/explodex` (`docs/sdk-api.md`, `docs/sdk-fragility.md`), npm `explodex`.

## What it is

A launcher that starts the unmodified Codex app with the Chrome DevTools Protocol enabled, then injects JavaScript into the renderer. It does not patch the app bundle.

## Plugin shape

A folder in `~/.explodex/plugins/<id>/` with `plugin.json` (`id`, `name`, `version`, `entry`, `description`) and an `index.js` that registers:

```js
Explodex.plugins.register({ id: "hello", name: "Hello", version: "1.0.0" }, (api) => {
  api.mount("aboveComposer", () =>
    api.components.button({ label: "Insert greeting", onClick: () => api.composer.insertText("Hello! ") }),
  );
  return () => {}; // teardown: remove listeners, observers, timers, DOM
});
```

Mount zones include `aboveComposer`, `sidebar` and `composerActions`. Types: `sdk/explodex-sdk.d.ts`.

## Why it is risky

- Depends on renderer internals (React fibers, class names, English UI labels, bridge message shapes) that can change every app release. Its own fragility analysis rates several mechanisms as likely to break.
- Needs a debug port and code injection into a signed app.
- macOS only; it does not support the Windows desktop app.

## Rules

- Never enable it on the user's machine without explicit consent.
- Never patch the app bundle (asar) as an alternative; it is unsupported and breaks updates.
- Pin the Explodex version, and re-test after every app update.
- Keep plugin teardown complete so disabling leaves no residue.
