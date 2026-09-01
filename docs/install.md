# Install Mental CLI

Mental CLI is `@balacode/mental` on npm. The binary is `mental`.

The unscoped package [`mental`](https://www.npmjs.com/package/mental) is a **different project**. Do not install that one.

Node.js **>= 18**. Zero runtime npm dependencies.

## Fast path

**Windows PowerShell** (Windows Terminal default, Windows PowerShell 5.1 / pwsh). Do not run bare `mental` here — PowerShell picks `mental.ps1` and Windows may ask what to open `cli.mjs` with.

```powershell
npm i -g @balacode/mental
npx --yes @balacode/mental install
npx --yes @balacode/mental doctor
```

**Windows cmd.exe** (Command Prompt, or a Command Prompt profile in Windows Terminal):

```bat
npm i -g @balacode/mental
mental.cmd install
mental.cmd doctor
```

**macOS, Linux, and Git Bash** (bash, zsh, sh):

```bash
npm i -g @balacode/mental
mental install
mental doctor
```

`mental install` (or the `npx` / `mental.cmd` form above) puts `mental` on PATH (`~/.local/bin/mental` on Unix; npm's `mental.cmd` on Windows), copies the skill and a tiny always-on rule into `~/.claude`, `~/.cursor`, `~/.agents`, and `~/.config/opencode`, and creates a `~/.mental` skeleton.

That skill is what makes agents journal, decide, and record residue **for you**. You do not keep the log by hand. It does **not** turn on hooks or MCP, and it does not delete journals.

## Upgrade (already installed)

Journals, decisions, notes, and identity stay. Nothing to migrate.

Windows PowerShell / Windows Terminal (PowerShell profile):

```powershell
npm i -g @balacode/mental
npx --yes @balacode/mental install
npx --yes @balacode/mental doctor
npx --yes @balacode/mental --version
```

Windows cmd.exe:

```bat
npm i -g @balacode/mental
mental.cmd install
mental.cmd doctor
mental.cmd --version
```

macOS, Linux, Git Bash:

```bash
npm i -g @balacode/mental
mental install
mental doctor
mental --version
```

For a published install, `mental --version` should match `npm view @balacode/mental version` (no leading `v`).

What that does:

1. `npm i -g` puts the published CLI on PATH (last install wins; npm 11 overwrites the existing bin).
2. `mental install` (Windows PowerShell: `npx --yes @balacode/mental install`) from a published install also self-upgrades when npm is ahead, then recopies the skill and always-on rule so agents match this CLI. It does **not** turn on hooks, MCP, or time tracking. It does **not** refresh the host plugin cache.
3. The derived search index (`${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite`) rebuilds on the next search or write when the index version changes. `mental reindex` is optional.
4. `mental doctor` reports PATH, npm lag, copied-skill lag, and host-plugin lag.

From a git checkout (unpublished commits on this tree):

```bash
cd /path/to/mental
npm run mental -- install
```

`npm run mental` always launches Node. Never run a `.mjs` file as a command — Windows ignores the shebang and shows "how do you want to open this file?".

That checkout is the source of truth until you publish. It does not replace PATH with an older registry build.

**Agents after this CLI:** `mental decide --title` create requires `--body`. Search JSON includes `tokens` and `op`. Journal hops may appear as `journal/YYYY-MM-DD.md#HH:MM`. Heartbeat lists **Later** for `--status later` residue. Existing decision files on disk are unchanged.

**Plugin:** after a release, also update the host plugin (Claude / Copilot marketplace update, Cursor reload). `mental install` does not refresh that cache. `mental doctor` warns when it is behind.

## Paste this into your agent

Copy the block into Cursor, Claude Code, Copilot, Codex, or any other coding agent:

```text
Install Mental CLI with npm. Do not clone the GitHub repo to install. Do not install from a git clone or plugin cache. Never run a .mjs file — Windows will ask what to open it with.

Pick the block for this machine. Windows Terminal is a host — match the profile (PowerShell vs cmd vs Git Bash).

Windows (PowerShell, cmd, Windows Terminal):
  npm i -g @balacode/mental
  npx --yes @balacode/mental install
  npx --yes @balacode/mental doctor
  (cmd.exe may use mental.cmd instead of npx. Never run bare mental in PowerShell.)

macOS and Linux (bash, zsh, sh) and Git Bash:
  npm i -g @balacode/mental
  mental install
  mental doctor

Mental CLI is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air. After install, you write it on my behalf — I do not journal by hand.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skills-only. Hosts load skills/mental-setup (install the CLI). The full procedure lives in skill/mental and is copied by `mental install` — not plugin-discovered. Native plugin does not start MCP. Do not start a plugin MCP server.

If this client has a native plugin install, use only that host's flow (do not run other hosts' `/plugin`, `copilot plugin`, or Command Palette steps from this session). Then always put the CLI on PATH — including when `mental` is already there (that upgrades npm and recopies the skill). Run the three commands for this machine.

The plugin is discovery. npm + the install command for this OS are the source of truth for the binary and the procedure. After doctor, tell me what it reports. Then follow the Mental skill copied by install — not the plugin bootstrap.

Missing Mental must not block my coding task (fail open): try `npx --yes @balacode/mental` this turn, then tell me to install.

After doctor, ask whether I want optional hooks or time tracking, and whether MCP is needed for this client. Give a one-liner for each, then wait — never run `mental option … on` until I say yes this turn.

- hooks: session-start snippets so a new chat loads Mental status (default off)
- MCP: register `mental serve` for tool-only agents that cannot shell the CLI (skip if this client can run `mental`)
- time tracking: optional automated project record — wall/billable, private + customer-ready descriptions, dated client export (default off)
```

## Install as a plugin (you, this host)

These steps are for a **human in that client**. Do not paste this whole list into an agent — it will run the wrong host's commands. The agent paste above stays gated: this client only, then `mental install`.

Plugin install loads the setup skill from a git clone the host caches. It does **not** start MCP. Still run `mental install` so the CLI, full procedure, and tiny always-on rule land on this machine. Upgrading the CLI does **not** refresh that cache — after a release, update the plugin in the host. `mental doctor` warns when a host plugin or a copied skill is behind the CLI.

**Cursor** — [Customize](https://cursor.com/docs/plugins) → Plugins → install. From GitHub today: **+ Add** / install from source with `https://github.com/afaraha8403/mental`, or symlink for local load:

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /path/to/mental ~/.cursor/plugins/local/mental
```

Then reload the window. `/add-plugin mental` is the marketplace slash **after** Mental CLI is listed on [cursor.com/marketplace](https://cursor.com/marketplace) — it is not a documented GitHub-URL installer. Cursor CLI has no marketplace install (`--plugin-dir` only). Teams/Enterprise: Dashboard → Plugins → Import from Repo.

**Claude Code** — in a session (opens the plugin panel):

```text
/plugin marketplace add afaraha8403/mental
/plugin install mental@mental
```

From a terminal (no TUI; what to use when scripting):

```bash
claude plugin marketplace add afaraha8403/mental
claude plugin install mental@mental
```

After a release: `claude plugin marketplace update mental` then `claude plugin update mental@mental`, then restart.

**VS Code** — Command Palette → **Chat: Install Plugin From Source**, then `https://github.com/afaraha8403/mental`.

**GitHub Copilot CLI:**

```bash
copilot plugin marketplace add afaraha8403/mental
copilot plugin install mental@mental
```

After a release: `copilot plugin marketplace update` then `copilot plugin update mental`.

Mental CLI is packaged as a portable [Agent Plugins 1.0.0](https://agent-plugins.org/specification) plugin — the vendor-neutral format maintained by Amazon, Cursor, Microsoft, OpenAI, and Vercel. Compatible clients load the same directory.

| Piece | Where | Role |
| --- | --- | --- |
| `plugin.json` | repo root | Manifest (`$schema` + `name`). The portable schema has no icon field. |
| `skills/mental-setup/` | Agent Skills | Bootstrap: install the CLI |
| `skill/mental/` | `mental install` | Full procedure (not plugin-discovered) |

Cursor extras live in `.cursor-plugin/plugin.json` (logo). Claude Code extras live in `.claude-plugin/plugin.json` (`displayName: Mental`) and `.claude-plugin/marketplace.json`. Rules and hooks are **not** portable v1 components — they still come from `mental install` / `mental hooks on`.

## From a git checkout

For unpublished commits on this tree (developers). Agents must use `npm i -g @balacode/mental`, not a clone.

```bash
cd /path/to/mental
npm run mental -- install --json
```

`npm run mental` always launches Node. Never execute a `.mjs` file as a command.

A git checkout installs that tree and does not clobber it with the registry.

## What `mental install` does

Last install wins: an existing global `mental` bin is overwritten (npm 11 no longer fails with `EEXIST`). From a published install it also **upgrades** the CLI when npm has a newer version, then re-runs so skills match. It **removes leftover Balakit Mental skill/rule copies** (the old `npx balakit doctor` pointer) so they cannot fight the new rule. Already installed? See [Upgrade](#upgrade-already-installed).

Optional:

```bash
mental install --mcp    # register `mental serve` in ~/.cursor/mcp.json + ~/.claude.json
mental hooks on         # session-start hooks; default off
mental option track on  # per-UUID sit-down clock; never from install paste unless the user asked
mental doctor           # PATH, bindings, ignore, skills, npm update, host plugin lag, optionals[]
mental doctor --fix-ignore   # add .mental/ and .mental-id to your global git excludes
```

Install and doctor JSON include `optionals[]` (`id`, `enabled`, `scope`, `command`, `isNew`, `needsConsent: true`). After doctor, agents ask about hooks and time tracking, and whether MCP is needed, with a one-liner each. Do not pass `--hooks` / `--mcp` / `--track` until the user says yes this turn.

Time tracking is off by default. When enabled, agents generate private and customer-ready descriptions from current work, clock wall/billable time, and refresh the record at park, journal, or handoff. Billable defaults to wall. Genuine ambiguity uses one plain-text draft prompt with short single-select options through the host's native question renderer, or the same numbered-text fallback. `--new` starts another clock. Customer exports contain dated work descriptions and hours, never private detail. It does **not** reconstruct hours from git, guess a duration, or print hours on the TTY pulse. Hours live in bundle `time.sqlite` (never git). The track skill is copied from `optional/mental-track/` only when track is enabled — not from plugin `skills/`. Full contract: [What time tracking can and cannot do](./track.md).

## Uninstall

```bash
mental uninstall
mental uninstall --delete-data --confirm DELETE
```

Uninstall removes skill / rule / hooks / MCP / mental-track copies. `~/.mental` stays unless you type `DELETE` (`time.sqlite` stays with OKF).
