# Codex / ChatGPT and OpenCode

## Codex / ChatGPT desktop

Sources: `https://developers.openai.com/plugins/build/plugins.md`, `.../deploy/submission.md`, index `https://developers.openai.com/llms.txt`. Packaging detail: the `codex-desktop-plugins` skill.

- Mental is **skills-only**. Codex receives its rules and skill through the CLI install subcommand (writes `~/.codex/AGENTS.md`) and through the root `plugin.json` when a user adds the repo as a plugin source.
- Public directory submission is a ZIP at `https://platform.openai.com/plugins`. It requires exactly one remote MCP server, 5 positive and 3 negative review test cases, a walkthrough video URL, privacy and terms URLs, domain verification, and a verified developer identity. Hooks and `apps` are not allowed in a submission.
- Because Mental does not ship a remote MCP server, **it is not eligible today.** Do not start a submission unless the user decides to build one.
- Workspace-only sharing and local marketplaces (`.agents/plugins/marketplace.json`) do not need the review process.

## OpenCode

Sources: `https://opencode.ai/v2/docs/build/plugins`, skill `opencode-plugins`.

- Mental has no OpenCode plugin. OpenCode users get instructions through the CLI install subcommand, which updates the OpenCode `AGENTS.md` if present.
- If a plugin is ever built: publish an npm package (compatible `@opencode/plugin` range), and users add it to `plugins` in config. No official publish page exists, and the ecosystem listing is an upstream PR whose process is unverified.
- Never reuse `@balacode/mental` for a plugin without adding a plugin entry point and checking `files` in `package.json`.
