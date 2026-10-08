# Mod templates

Copy, rename, then validate (`claude plugin validate ./my-mod`). Replace `my-mod` with a kebab-case name that does **not** start with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-`.

## `.claude-plugin/plugin.json`

```json
{
  "name": "my-mod",
  "displayName": "My Mod",
  "version": "0.1.0",
  "description": "One sentence about what this mod changes.",
  "author": { "name": "Your Name" },
  "license": "MIT",
  "userConfig": {
    "threshold": {
      "type": "number",
      "title": "Threshold",
      "description": "Warn when a value goes above this.",
      "default": 10,
      "min": 1,
      "max": 100
    }
  }
}
```

Mods add no required manifest fields. Add `"types": "./types/index.d.ts"` only if you use `$.state` or add a namespace.

## `hooks/hooks.json`

```json
{
  "modules": ["./register.js"]
}
```

Exactly one path, relative to this file. This key is what makes the plugin a mod.

## `hooks/register.js`

```js
// Guard: block a risky shell pattern, announce it, fail safe.
export function register(on, options) {
  on('tool.call', 'Bash', async ($, e, next) => {
    const cmd = e.input?.command ?? '';
    if (/\brm\s+-rf\s+\/(\s|$)/.test(cmd)) {
      $.ui.toast('Blocked: rm -rf /');
      return { deny: 'Refusing to delete the filesystem root.' };
    }
    return next(e);
  }).catch(async ($, err) => {
    // A gating hook needs a .catch; deny rather than silently allow.
    $.ui.log(`guard failed: ${String(err)}`);
    return { deny: 'Safety guard failed; refusing the call.' };
  });

  // Register commands last: a taken name throws and skips the whole hook.
  on('session.start', async ($, e, next) => {
    try {
      $.command.register({ name: 'mod-ping', description: 'Check the mod is alive' });
    } catch (err) {
      $.ui.log(`command not registered: ${String(err)}`);
    }
    return next(e);
  });

  on('command.run', { command: 'mod-ping' }, async () => ({
    text: `my-mod is active (threshold ${options.threshold})`,
  }));
}
```

Confirm the exact result shapes (`{ deny }`, `{ text }`) and the `$.command.register` argument shape in the generated `.d.ts`.

## `hooks/register.test.ts`

```ts
import { expect, test } from 'claude-code/testing';
import { register } from './register.js';

test('blocks rm -rf /', async ($, on) => {
  register(on, { threshold: 10 });
  const result = await $.tool.call({ name: 'Bash', input: { command: 'rm -rf /' } });
  expect(result).toBeDefined();
});
```

Notes: stubs must be registered before the first `$` call; `session.start` does not fire on its own in tests (fire it with `$.session.start(...)`); use `mock.clock`, `mock.store`, `mock.env` for time, storage, env. Each test file needs at least one `test()`. See [testing-and-troubleshooting.md](testing-and-troubleshooting.md). The exact helper shapes may differ by release: check `claude-code/testing` types.

## Marketplace entry (to ship it)

```json
{
  "name": "my-marketplace",
  "owner": { "name": "Your Name" },
  "plugins": [
    { "name": "my-mod", "source": "./my-mod", "description": "What it does." }
  ]
}
```

Install: `/plugin install my-mod@my-marketplace`, then `/reload-plugins`. See `claude-desktop-plugins` for the publish routes.
