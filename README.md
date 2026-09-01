<p align="center">
  <img src="assets/logo.png" alt="Mental CLI" width="160" height="160">
</p>

<h1 align="center">Mental CLI</h1>

<p align="center"><strong>I type mental</strong></p>

<p align="center">Never reconstruct where you left off.</p>

<p align="center">
  Local-first continuity for you and your coding agents.<br>
  CLI · MCP · Agent Skills — Cursor, Claude Code, Copilot, Codex, OpenCode.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@balacode/mental"><img src="https://img.shields.io/npm/v/@balacode/mental.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/deps-0-brightgreen.svg" alt="zero runtime dependencies"></a>
  <a href="https://agent-plugins.org/specification"><img src="https://img.shields.io/badge/Agent%20Plugins-1.0.0-111111.svg" alt="Agent Plugins 1.0.0"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="docs/research.md">Research</a> ·
  <a href="skill/mental/SKILL.md">Skill</a> ·
  <a href="#faq">FAQ</a>
</p>

Git records **what** changed. Mental CLI records the rest: the resume, the decision git cannot explain, and what’s still in the air. **Your agents write it for you.** You type `mental` when you want the pulse.

```text
$ mental
🧠 Ship the pointer, not the dump — open loops: none
Against PLAN.md

Now     Resolver landed  (today)
Git     main (dirty)
        feat: UUID bindings survive a repo move
Hops    2
Needs eyes
  [verify] Resolver tests not reviewed
In the air
  [direction] Tom said ship the pointer
Later
  [thread] Come back to MCP
Unsettled
  [open] Heartbeat only, no standing TUI
Settled
  UUID bindings survive a repo move
```

One shot. Then exit. Not a menu. Not a todo app.

## Quick start

PowerShell, cmd.exe, Windows Terminal, Git Bash, macOS, and Linux:

```text
npm i -g @balacode/mental
mental install
mental doctor
```

Then `cd your-repo` and type `mental`. npm owns the executable on every
platform; `mental install` copies the agent skill/rule and creates the local data
skeleton. Strict PowerShell policy: use `npm.cmd` / `mental.cmd`.

Upgrading from Mental 0.8.1 or older on Windows? Run `mental-repair.cmd` once
after `npm i -g`; it quarantines only fingerprinted Mental-owned launchers that
can shadow npm. Journals stay. [Upgrade](docs/install.md#upgrade-already-installed).

After install, agents journal, decide, and record residue while you work. You do not keep a second journal.

The unscoped npm package [`mental`](https://www.npmjs.com/package/mental) is a different project. Install **`@balacode/mental`**. The binary is `mental`.

### Paste this into your agent

Works in Cursor, Claude Code, Copilot, Codex, and anything that can install a plugin or run a shell:

```text
Install Mental CLI with npm. Do not clone the GitHub repo to install. Do not install from a git clone or plugin cache. Never run a .mjs file — Windows will ask what to open it with.

Fresh install (PowerShell, cmd, Windows Terminal, Git Bash, macOS, Linux):
  npm i -g @balacode/mental
  mental install
  mental doctor

Existing Windows install from Mental 0.8.1 or older (one-time migration):
  npm i -g @balacode/mental
  mental-repair.cmd
  mental install
  mental doctor
  (If PowerShell blocks scripts, use npm.cmd and mental.cmd explicitly.)

Mental CLI is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air. After install, you write it on my behalf — I do not journal by hand.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skills-only. Hosts load skills/mental-setup (install the CLI). The full procedure lives in skill/mental and is copied by `mental install` — not plugin-discovered. Native plugin does not start MCP. Do not start a plugin MCP server.

If this client has a native plugin install, use only that host's flow (do not run other hosts' `/plugin`, `copilot plugin`, or Command Palette steps from this session). npm owns the executable; `mental install` only refreshes the copied skill/rule/config. Run the fresh-install block, or the Windows migration block for an existing 0.8.1-or-older install.

The plugin is discovery. npm is the source of truth for the executable; the install command is the source of truth for the copied procedure. After doctor, tell me what it reports. Then follow the Mental skill copied by install — not the plugin bootstrap.

Missing Mental must not block my coding task (fail open): continue the task, then tell me to run the fresh-install block. Never execute the package's .mjs file directly.

After doctor, ask whether I want optional hooks or time tracking, and whether MCP is needed for this client. Give a one-liner for each, then wait — never run `mental option … on` until I say yes this turn.

- hooks: session-start snippets so a new chat loads Mental status (default off)
- MCP: register `mental serve` for tool-only agents that cannot shell the CLI (skip if this client can run `mental`)
- time tracking: optional automated project record — wall/billable, private + customer-ready descriptions, dated client export (default off)
```

Plugin install for each host (you, not the agent paste): [docs/install.md](docs/install.md#install-as-a-plugin-you-this-host).

### Releasing this repo

`package.json` `version` is source of truth. Bump with `node scripts/bump-version.mjs X.Y.Z`, then `--check`. Tag **only** `vX.Y.Z`. Watch the `Release` workflow. The release is not done until:

```bash
npm view @balacode/mental version
```

equals that `package.json` string (no `v`). Agent rule: [`.cursor/rules/release.mdc`](.cursor/rules/release.mdc).

## Highlights

- **Agents are the scribe.** After install, a skill + tiny always-on rule tell your coding agents to call `mental … --json`. Not every chat turn. Not a hidden hook. The plugin is discovery only (`skills/mental-setup`); the procedure is copied by `mental install`.
- **A pulse, not a dump.** `mental` / `heartbeat --json` is resume + last outcome + git + residue + open decisions. [51 ms](docs/benchmarks.md) on a fresh process.
- **Markdown is the source of truth.** OKF files in `~/.mental`. SQLite is a derived cache. Deleting the db loses nothing.
- **Identity survives a move.** UUID in `bindings.json`, not the folder path. Two clones of the same origin share one brain until you `split`.
- **Fail open. Private by default.** Missing Mental CLI must not block coding. Never commit the store. Never write secrets.
- **Hours are optional.** Default off. Agents generate private + customer-ready descriptions, clock wall/billable, and refresh the record at task boundaries. Genuine ambiguity uses one renderer-safe single-select question; otherwise capture stays automatic. `--new` runs another clock; dated client exports omit private detail. [Track](docs/track.md).

## Who writes

| You | Your agents |
| --- | --- |
| Type `mental` for the pulse | Journal at a real task boundary |
| Ask “where did we leave off?” | Record a decision that constrains the future |
| Install once | Record residue the moment it surfaces |
| Read the receipt | Re-pulse when another agent may have written |

You will see this at the end of a turn that used Mental CLI:

```text
🧠 **Mental**
- 📓 **Journal** › *recorded* › Resolver landed
- 🚦 **Attention** › *recorded* › Tom said ship
```

Same CLI if you ever type it yourself. Same files.

## Why this exists

A new agent, another repo, Monday morning — someone reconstructs intent from chat and `git log`. That reconstruction is the tax. It is what developers feel as mental fry: verifying what the last agent did, deciding what the next one may touch, and holding residue across hops. Mental CLI removes it.

| You already have | Mental CLI adds |
| --- | --- |
| Git history | Exact resume line |
| `PLAN.md` / issues | Decisions git cannot explain |
| Chat (gone next session) | Attention residue, written down (capped at 7) |

The last two years measured the tax. Experienced developers using Cursor believed they were **20% faster** and were **19% slower** ([METR 2025](https://arxiv.org/abs/2507.09089)). Productivity ratings held while flow and cognitive load eroded ([Vella and Blincoe 2026](https://arxiv.org/abs/2605.23135)). AI users switched windows more over two years — **74% did not notice** ([ICSE 2026](https://doi.org/10.1145/3744916.3787811)). `mental` is the cue that hop needs.

Citations and what we do not claim: [docs/research.md](docs/research.md).

## Numbers

Measured. Reproducible. `npm test` · `npm run bench`

| | | |
| ---: | --- | --- |
| **0** | runtime npm dependencies | Node `>=18` |
| **224** | automated tests | identity, search, install, MCP, optional track |
| **51 ms** | `mental heartbeat --json` | p50, fresh process |
| **11 ms** | same pulse in-process | MCP after `mental serve` |
| **46 ms** | search over **2,000** notes | **1.2 ms** in-process |

Host and method: [docs/benchmarks.md](docs/benchmarks.md).

## FAQ

**Do I have to write the journal myself?**
No. Agents write it on your behalf. **I type mental** — you type `mental` when you want the pulse. [Who writes](#who-writes).

**Is this Mem0 / chat memory / a vector store?**
No. Mental CLI is project continuity, not conversation memory. Markdown files are the source of truth. No embeddings as SoT. No cloud.

**Does it replace git, issues, or PLAN.md?**
No. Git still records what changed. `--against PLAN.md` points at the plan. Mental holds the small amount those systems cannot see.

**Will it auto-journal every chat turn?**
No. Task boundaries, real decisions, residue in the air. Hooks stay **off** until you run `mental hooks on`.

**Park, handoff, pulse — when?**
`park` encodes an interruption mid-hop. `handoff` is a planned close (journal + heartbeat). `pulse` is a compact cross-project overview. The cheap mid-chat reload is still `mental` / `heartbeat --json`.

**How do I upgrade?**
Run `npm i -g @balacode/mental`, `mental install`, then `mental doctor`. Existing Windows installs from Mental 0.8.1 or older run `mental-repair.cmd` once after npm updates. Journals stay. The search index rebuilds on the next search. Skill copies refresh; the host plugin is a second channel — update it if `doctor` says it is behind. From a git checkout: `npm run mental -- install`. [Upgrade](docs/install.md#upgrade-already-installed).

**What if `mental` is not installed?**
Agents continue the coding task and mention the three-command install block. They never execute a `.mjs` file directly. Fail open.

**Where does data live?**
`~/.mental` (never commit). Project `./.mental` only after `mental local`. Uninstall does not delete OKF unless you type `DELETE`. [Identity](docs/identity.md) · [Privacy](#privacy)

**Does Mental CLI track my hours?**
Only if you turn it on (`mental option track on`). Agents automatically record private and customer-ready descriptions, wall time, and billable time (wall by default). If input is genuinely needed, they use a plain-text draft with short single-select choices that maps to native host question renderers and falls back to numbered text. Export produces dated customer rows with work descriptions and hours; it never reconstructs missing time from git. [Track](docs/track.md).

## Docs

| | |
| --- | --- |
| [Why Mental CLI](docs/why.md) | Contract, non-goals, architecture |
| [The research](docs/research.md) | Verification load, supervisory work, 2024–2026 citations |
| [Install Mental CLI](docs/install.md) | npm, plugins, clone, upgrade, doctor, uninstall |
| [Optional time tracking](docs/track.md) | Sit-down clock; what hours can and cannot do |
| [Mental CLI reference](docs/cli.md) | Commands, flags, exit codes |
| [Mental CLI for agents](docs/agents.md) | `--json`, skill, MCP, receipts |
| [Mental CLI identity](docs/identity.md) | UUID, remap / split / local |
| [Mental CLI benchmarks](docs/benchmarks.md) | p50 / p95 and how to reproduce |
| [Skill](skill/mental/SKILL.md) | The procedure agents load |
| [Spec](PLAN.md) | Full product spec |

## Privacy

- Default store: `~/.mental/` (never commit)
- Project `.mental/` is opt-in and must be gitignored (`mental doctor --fix-ignore`). Agents must not edit `.gitignore`
- Never store secrets, tokens, or private keys
- `mental uninstall` does not delete OKF unless you type `DELETE`

Optional: `mental install --mcp` · `mental hooks on` · `mental option track on` — default **off**. Skill + rule are the contract. Hours never go in git. [Track](docs/track.md).

---

**npm:** [@balacode/mental](https://www.npmjs.com/package/@balacode/mental) · **repo:** [afaraha8403/mental](https://github.com/afaraha8403/mental) · **license:** [MIT](./LICENSE)
