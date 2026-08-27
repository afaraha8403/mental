<p align="center">
  <img src="assets/logo.png" alt="Mental" width="160" height="160">
</p>

<h1 align="center">Mental</h1>

<p align="center"><strong>Never reconstruct where you left off.</strong></p>

<p align="center">
  Local-first continuity for you and your coding agents.<br>
  CLI · MCP · Agent Skills — Cursor, Claude Code, Copilot, Codex.
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
  <a href="skills/mental/SKILL.md">Skill</a> ·
  <a href="#faq">FAQ</a>
</p>

Git records **what** changed. Mental records the rest: the resume, the decision git cannot explain, and what’s still in the air. **Your agents write it for you.** You type `mental` when you want the pulse.

```text
$ mental
🧠 Ship the pointer, not the dump — open loops: none
Against PLAN.md

Now     Resolver landed  (today)
Git     main (dirty)
        feat: UUID bindings survive a repo move
In the air
  [direction] Tom said ship the pointer
Unsettled
  [open] Heartbeat only, no standing TUI
```

One shot. Then exit. Not a menu. Not a todo app.

## Quick start

```bash
npm i -g @balacode/mental
mental install
cd your-repo
mental
```

`mental install` puts the CLI on PATH **and** teaches your agents the skill. After that they journal, decide, and record residue while you work. You do not keep a second journal.

The unscoped npm package [`mental`](https://www.npmjs.com/package/mental) is a different project. Install **`@balacode/mental`**. The binary is `mental`.

### Paste this into your agent

Works in Cursor, Claude Code, Copilot, Codex, and anything that can install a plugin or run a shell:

```text
Install Mental from https://github.com/afaraha8403/mental.

Mental is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air. After install, you write it on my behalf — I do not journal by hand.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skill at skills/mental/, MCP at mcp.json.

Use this client's native plugin install if you have one, then:

  npm i -g @balacode/mental
  mental install
  mental doctor

Do not enable hooks unless I ask. Optional MCP is `mental install --mcp`. After doctor, tell me what it reports.
```

Client one-liners: [docs/install.md](docs/install.md).

## Highlights

- **Agents are the scribe.** After install, a skill + tiny always-on rule tell your coding agents to call `mental … --json`. Not every chat turn. Not a hidden hook.
- **A pulse, not a dump.** `mental` / `heartbeat --json` is resume + last outcome + git + residue + open decisions. [51 ms](docs/benchmarks.md) on a fresh process.
- **Markdown is the source of truth.** OKF files in `~/.mental`. SQLite is a derived cache. Deleting the db loses nothing.
- **Identity survives a move.** UUID in `bindings.json`, not the folder path. Two clones of the same origin share one brain until you `split`.
- **Fail open. Private by default.** Missing Mental must not block coding. Never commit the store. Never write secrets.

## Who writes

| You | Your agents |
| --- | --- |
| Type `mental` for the pulse | Journal at a real task boundary |
| Ask “where did we leave off?” | Record a decision that constrains the future |
| Install once | Record residue the moment it surfaces |
| Read the receipt | Re-pulse when another agent may have written |

You will see this at the end of a turn that used Mental:

```text
🧠 **Mental**
- 📓 **Journal** › *recorded* › Resolver landed
- 🚦 **Attention** › *recorded* › Tom said ship
```

Same CLI if you ever type it yourself. Same files.

## Why this exists

A new agent, another repo, Monday morning — someone reconstructs intent from chat and `git log`. That reconstruction is the tax. It is what developers feel as decision fatigue and brain fatigue. Mental removes it.

| You already have | Mental adds |
| --- | --- |
| Git history | Exact resume line |
| `PLAN.md` / issues | Decisions git cannot explain |
| Chat (gone next session) | Attention residue, written down (capped at 7) |

The literature already measured the tax. [Parnin and Rugaber (2011)](https://doi.org/10.1007/s11219-010-9104-9): 10,000 sessions, only **10%** of programmers start coding again within a minute. [Leroy (2009)](https://doi.org/10.1016/j.obhdp.2009.04.002) named **attention residue** — unfinished Task A stays loaded on Task B. [An explicit cue doubled resumption success](https://doi.org/10.1145/1753326.1753342) versus notes alone. `mental` is that cue.

Citations and what we do not claim: [docs/research.md](docs/research.md).

## Numbers

Measured. Reproducible. `npm test` · `npm run bench`

| | | |
| ---: | --- | --- |
| **0** | runtime npm dependencies | Node `>=18` |
| **96** | automated tests | identity, search, install, MCP |
| **51 ms** | `mental heartbeat --json` | p50, fresh process |
| **11 ms** | same pulse in-process | MCP after `mental serve` |
| **46 ms** | search over **2,000** notes | **1.2 ms** in-process |

Host and method: [docs/benchmarks.md](docs/benchmarks.md).

## FAQ

**Do I have to write the journal myself?**
No. After `mental install`, agents write it on your behalf. You type `mental` when you want the pulse. [Who writes](#who-writes).

**Is this Mem0 / chat memory / a vector store?**
No. Mental is project continuity, not conversation memory. Markdown files are the source of truth. No embeddings as SoT. No cloud.

**Does it replace git, issues, or PLAN.md?**
No. Git still records what changed. `--against PLAN.md` points at the plan. Mental holds the small amount those systems cannot see.

**Will it auto-journal every chat turn?**
No. Task boundaries, real decisions, residue in the air. Hooks stay **off** until you run `mental hooks on`.

**Park, handoff, pulse — when?**
`park` encodes an interruption mid-hop. `handoff` is a planned close (journal + heartbeat). `pulse` is a compact cross-project overview. The cheap mid-chat reload is still `mental` / `heartbeat --json`.

**What if `mental` is not installed?**
Agents try `npx @balacode/mental`. If that fails they continue the coding task and mention install. Fail open.

**Where does data live?**
`~/.mental` (never commit). Project `./.mental` only after `mental local`. Uninstall does not delete OKF unless you type `DELETE`. [Identity](docs/identity.md) · [Privacy](#privacy)

## Docs

| | |
| --- | --- |
| [Why Mental](docs/why.md) | Contract, non-goals, architecture |
| [The research](docs/research.md) | Resumption lag, attention residue, citations |
| [Install](docs/install.md) | npm, plugins, clone, doctor, uninstall |
| [CLI reference](docs/cli.md) | Commands, flags, exit codes |
| [Agents](docs/agents.md) | `--json`, skill, MCP, receipts |
| [Identity](docs/identity.md) | UUID, remap / split / local |
| [Benchmarks](docs/benchmarks.md) | p50 / p95 and how to reproduce |
| [Skill](skills/mental/SKILL.md) | The procedure agents load |
| [Spec](PLAN.md) | Full product spec |

## Privacy

- Default store: `~/.mental/` (never commit)
- Project `.mental/` is opt-in and must be gitignored (`mental doctor --fix-ignore`). Agents must not edit `.gitignore`
- Never store secrets, tokens, or private keys
- `mental uninstall` does not delete OKF unless you type `DELETE`

Optional: `mental install --mcp` · `mental hooks on` — default **off**. Skill + rule are the contract.

---

**npm:** [@balacode/mental](https://www.npmjs.com/package/@balacode/mental) · **repo:** [afaraha8403/mental](https://github.com/afaraha8403/mental) · **license:** [MIT](./LICENSE)
