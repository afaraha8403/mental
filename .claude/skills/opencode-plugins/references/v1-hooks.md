# OpenCode v1 plugins

Source: `https://opencode.ai/docs/plugins/`. Re-verify; v1 may be deprecated in favor of v2.

```ts
import type { Plugin } from "@opencode-ai/plugin";

export const Guard: Plugin = async ({ project, client, $, directory, worktree }) => ({
  "tool.execute.before": async (input, output) => {
    // inspect input.tool and output.args; throw to block
  },
});
```

- Context: `project`, `client`, `$` (Bun shell), `directory`, `worktree`.
- Config key: `plugin` (array) in `opencode.json`.
- Local files: `.opencode/plugin/` or `.opencode/plugins/`, and `~/.config/opencode/plugins/`.
- npm packages are installed by Bun into `~/.cache/opencode/node_modules/`.
- Hooks and events: `tool.execute.before`, `tool.execute.after`, `shell.env`, `event`, `chat.*`, `permission.ask`, and more. List them from the live docs before use.
- Custom tools use a `tool` helper with Zod schemas.

Do not mix these APIs with v2.
