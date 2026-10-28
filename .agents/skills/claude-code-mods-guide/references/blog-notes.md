# Blog notes (explainx.ai, Oct 2-3, 2026)

Source: "Claude Code Mods: Official TypeScript Plugin Guide" by Yash Thakker, published Oct 2, 2026 (17-minute read). It summarizes the official getting-started guide by Addy Osmani on claude.dev (Oct 1, 2026). Specs are accurate as of Oct 2; the You Should Know section as of Oct 3. Confirm `claude --version` and the generated types before treating any snippet as a contract.

## Timeline

- Sep 14, 2026: community preview (Boris Cherny's post, GitHub issue #91870, demos: Tetris, Mindful Claude, a CI panel). A snapshot, not the spec.
- Claude Code 2.1.277: AGENTS.md support shipped as the first public built-in mod (`mods/agents-md`).
- Oct 1, 2026: official guide published. Mods generally available in **2.1.287+**, on by default. Launch thread reached about 1.3M views.
- Oct 3, 2026: ClaudeDevs announced the built-in You Should Know plugin.
- Oct 7, 2026 note on the blog: a viral claim that Claude Code's suggested next message is training data; Anthropic says it is not (separate post).

Verification: the full article text was read through a browser on 2026-10-28 (page includes an explainx.ai MCP Bootcamp promo, newsletter and footer, all ignored). The blog's own sources: launch thread tweet 2105721434807083061; ClaudeDevs You Should Know tweet 2106118517447876618 (about 1:55 AM Oct 3, about 424.8K views; about five hours later the same account said it is a mod using a sideagent).

## First-party mods

`/diff` (the pane beside the conversation) and AGENTS.md support are mods. Source and tests are under `mods/` in the public `anthropics/claude-code` repo. The blog lists four built-in directories there: `sec-default`, `diff`, `telemetry`, `agents-md`; the folder README says those four are the source built into the binary.

## You Should Know

- Enable with `/plugin enable cc-plugin-you-should-know@builtin`.
- A mod that spins off a side agent to observe Claude's output and flag things you or Claude might miss. 2.1.287 changelog: on for first-party sessions with telemetry on. 2.1.288: notes say "we", "the main agent" or "you" depending on who made a decision.
- Not a permission control; a note is not a hard block. Does not draw a Token Weather band.
- No readable source: there is no `you-should-know` directory in the public `mods/` tree.
- Open question: whether side-agent model calls count against a subscription. A user asked; the blog saw no official reply. Do not claim either way.

| Mod | Reads | Acts |
| --- | --- | --- |
| You Should Know | Claude's output (side agent) | Surfaces notes |
| Token Weather | Context usage only | Draws a forecast |
| Blast Radius | Bash tool calls | Can hold them |

## FAQ

- **Do I turn mods on?** Runtime is on by default in 2.1.287+. Only You Should Know needs enabling.
- **TypeScript?** Yes. Official samples use `.mjs` for the first module with `.d.ts` and `*.test.ts` beside it. The runtime is a sandbox, not Node.
- **Own slash command?** `$.command.register` on `session.start`, then answer `command.run`.
- **Does Blast Radius replace permission modes?** No.
- **Is Token Weather in the directory?** Treat it as a teaching sample; copy habits, not the file.

## Related reading the blog links

Claude Code commands reference, What are Agent Skills, Claude Code reads AGENTS.md, Claude Code function hooks, Claude Code permission modes, Top 25 Claude plugins (2026), the official guide on claude.dev, and `mods/` in anthropics/claude-code. Later updates (Oct 3) point to a touched-files tutorial, an `awesome-claude-code-mods` library (50 MIT mods), and a Desktop-app install guide. Verify these before citing; they were not fetched.

## Not in the blog

The blog gives no full module source, no `plugin.json` block, no complete event list, and no UI element tree. For those use `claude-desktop-mods` and its references, or the generated `.claude-plugin/types/`.
