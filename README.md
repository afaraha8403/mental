<p align="center">
  <img src="assets/logo.svg" alt="Mental" width="128" height="128">
</p>

<h1 align="center">Mental</h1>

<p align="center">
  <strong>Never reconstruct where you left off.</strong>
</p>

<p align="center">
  Local-first continuity for humans and coding agents.<br>
  Offload the resume, the residue, and the decisions git cannot see<br>
  so working memory can do the work — not reconstruct it.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@balacode/mental"><img src="https://img.shields.io/npm/v/@balacode/mental.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@balacode/mental"><img src="https://img.shields.io/node/v/@balacode/mental.svg" alt="node >=18"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/deps-0-brightgreen.svg" alt="zero runtime dependencies"></a>
  <a href="https://agent-plugins.org/specification"><img src="https://img.shields.io/badge/Agent%20Plugins-1.0.0-111111.svg" alt="Agent Plugins 1.0.0"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-stdio-555555.svg" alt="MCP stdio"></a>
</p>

<p align="center">
  <a href="https://cursor.com"><img src="https://img.shields.io/badge/Cursor-plugin-111111.svg" alt="Cursor"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Claude%20Code-plugin-d97706.svg" alt="Claude Code"></a>
  <a href="https://code.visualstudio.com"><img src="https://img.shields.io/badge/VS%20Code-plugin-007ACC.svg" alt="VS Code"></a>
  <a href="https://github.com/features/copilot"><img src="https://img.shields.io/badge/GitHub%20Copilot-plugin-000000.svg" alt="GitHub Copilot"></a>
  <a href="https://agent-plugins.org/specification"><img src="https://img.shields.io/badge/Agent%20Skills-portable-111111.svg" alt="Agent Skills"></a>
</p>

Git records **what** changed. Mental records the small amount git cannot: where you left off, why a decision was made, what is still in the air after a hop, and the next exact action.

That hop — a new agent, another repo, Monday morning — is a known **resumption** problem. Developers feel it as decision fatigue and brain fatigue. The literature already measured the tax. Mental is the external cue those papers asked for.

**OKF markdown is the source of truth.** SQLite is a derived cache. Agents call `mental … --json` — they do not grep YAML.

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

One shot. Then exit. Not a menu.

## Why this exists

A new agent, a second clone, Monday morning — someone has to reconstruct intent from chat and `git log`. That reconstruction is the tax. It burns working memory that should be spent on the work. Mental removes it.

| You already have | Mental adds |
| --- | --- |
| Git history | Exact resume line (prospective cue) |
| `PLAN.md` / issues | Decisions git cannot explain |
| Chat (gone next session) | Attention residue, written down (capped at 7) |

It is not a todo app. It is not a transcript store. It does not replace the plan file — `--against PLAN.md` points at it.

### The research

Orchestrating several projects and several agents is the interruption problem with more hops. Three results, then we stop:

- **Resumption is slow.** [Parnin and Rugaber (2011)](https://doi.org/10.1007/s11219-010-9104-9) — 10,000 sessions, 86 programmers. Only **10%** start coding again within a minute. Only **7%** edit without first wandering the codebase to remember. [62% of Microsoft developers](https://doi.org/10.1145/1134285.1134355) already called recovering from interruptions a serious problem. Developers leave sticky notes; [an explicit cue doubled success](https://doi.org/10.1145/1753326.1753342) versus notes alone. `mental` is that cue.
- **Unfinished work leaks.** [Leroy (2009)](https://doi.org/10.1016/j.obhdp.2009.04.002) named **attention residue**: thoughts about Task A stay loaded on Task B, and performance drops. Mental’s “In the air” is that residue, written down so working memory can drop it. The journal `Resume:` line is [prospective goal encoding](https://doi.org/10.1016/S1071-5819(03)00023-5) — what you will do when you come back.
- **You pay in stress even when you keep up.** [Mark, Gudith, and Klocke (CHI 2008)](https://doi.org/10.1145/1357054.1357072): interrupted people finished *faster*, with more stress, frustration, time pressure, and effort. Mental does not stop the hop. It stops the second tax: reconstructing intent on top of the first.

Citations, what we do not claim, and the map to commands: [docs/research.md](docs/research.md). Product contract: [docs/why.md](docs/why.md).

## Numbers we measured

Reproducible. Not marketing.

| | | |
| ---: | --- | --- |
| **0** | runtime npm dependencies | Node `>=18`, MIT |
| **96** | automated tests | identity, search, install, MCP |
| **51 ms** | `mental heartbeat --json` | p50, fresh process |
| **11 ms** | same pulse in-process | what MCP does after `mental serve` |
| **46 ms** | search over **2,000** notes | p50 CLI; **1.2 ms** in-process |

Host: Node v22.14.0, linux/x64, 4 CPUs. 21 runs, 3 warmup. This Node build has no FTS5 — search uses SQLite LIKE with title-first ranking. When FTS5 is present, ranking is bm25.

```bash
npm test
npm run bench
```

Full table and method: [docs/benchmarks.md](docs/benchmarks.md).

## Start in 30 seconds

```bash
npm i -g @balacode/mental
mental install
cd your-repo
mental
```

`mental install` puts the CLI on PATH **and** teaches your agents the skill. After that, they journal, decide, and record residue for you. You type `mental` when you want the pulse yourself.

The unscoped npm package [`mental`](https://www.npmjs.com/package/mental) is a different project. Install **`@balacode/mental`**. The binary is `mental`.

### Paste this into your agent

```text
Install Mental from https://github.com/afaraha8403/mental.

Mental is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skill at skills/mental/, MCP at mcp.json.

Use this client's native plugin install if you have one, then put the CLI on PATH and finish setup:

  npm i -g @balacode/mental
  mental install
  mental doctor

Do not enable hooks unless I ask. Optional MCP is `mental install --mcp`. After doctor, tell me what it reports.
```

Client one-liners (Cursor, Claude Code, VS Code, Copilot) and what `install` actually copies: [docs/install.md](docs/install.md).

## Who writes — you or the agent?

**The agent writes it on your behalf.** After `mental install`, a skill plus a tiny always-on rule tell Cursor, Claude Code, Copilot, Codex, and the rest to call `mental … --json` while you work. You do not keep a journal by hand.

They write when it matters, not on every chat turn:

- Start or finish of real work → journal + exact resume
- A choice that constrains the future → decision
- Residue in the air (“Tom said…”, a concern, park this) → attention
- Orientation (“where did we leave off?”) → heartbeat, then answer from that

They do **not** dump the transcript. They do **not** clone `PLAN.md`. Missing Mental must not block coding (fail open). Session hooks stay **off** unless you turn them on — the skill is the contract, not a hidden logger.

You will see a receipt at the end of a turn that used Mental:

```text
────────
🧠 Mental  
  📓 Journal: Recorded  “Resolver landed”
  🚦 Attention: Recorded  “Tom said ship”
────────
```

Want the pulse yourself? Type `mental`. Same CLI, same files. Humans and agents share one write path.

## Daily loop

1. You (or the agent) run `mental` / `mental heartbeat --json` — where did we leave off?
2. Do the work. The agent records residue and decisions as they happen.
3. At a real task boundary the agent appends one journal section (you can type the same thing):

```bash
mental journal --title "What landed" --body "Evidence git cannot see." --resume "Exact next action — open loops: none" --against PLAN.md
```

Same `--title` updates the existing decision or attention file. Paths are identities.

```bash
mental status              # git + resume + residue + open decisions + notes
mental heartbeat --json    # same pulse agents use
mental search overlay
mental list --type Decision --kind direction
```

## How agents use it

Always:

```bash
mental where --json
mental heartbeat --json
```

Mid-chat, not just start/finish: search before you change an approach, record attention the moment residue surfaces (do not leave it in working memory), re-pulse when other agents may have written. The pulse is cheap. Shared home slice — the next agent should not reconstruct from chat.

If `mental` is missing, try `npx @balacode/mental …`. If that fails, continue the coding task and mention install.

Full procedure: [agent guide](docs/agents.md) and the [skill](skills/mental/SKILL.md).

Mental is an [Agent Plugins 1.0.0](https://agent-plugins.org/specification) package: `plugin.json` + `skills/mental/` + `mcp.json`. Compatible clients load one directory. Hooks and MCP stay **off** until you ask.

## Docs

| | |
| --- | --- |
| [Why Mental](docs/why.md) | Contract, non-goals, architecture |
| [The research](docs/research.md) | Resumption lag, attention residue, citations |
| [Install](docs/install.md) | npm, plugins, clone, doctor, uninstall |
| [CLI reference](docs/cli.md) | Commands, flags, exit codes, layout |
| [Agents](docs/agents.md) | `--json`, skill, MCP, receipts |
| [Identity](docs/identity.md) | UUID bindings, remap / split / local |
| [Benchmarks](docs/benchmarks.md) | Measured p50/p95 and how to reproduce |
| [Skill](skills/mental/SKILL.md) | The procedure agents load |
| [Spec](PLAN.md) | Full product spec |

## Identity, in one table

Identity lives in `~/.mental/bindings.json`. Two clones of the same origin share one brain until you split. `where` does not create a UUID — first write does.

| Situation | Command |
| --- | --- |
| Use an existing UUID | `mental remap --to <uuid>` |
| This clone should diverge | `mental split` |
| Opt in to `./.mental` | `mental doctor --fix-ignore` then `mental local` |

[Identity →](docs/identity.md)

## Privacy

- Default store: `~/.mental/` (never commit)
- Project `.mental/` is opt-in and must be gitignored (`mental doctor --fix-ignore`). Agents must not edit `.gitignore`
- Never store secrets, tokens, or private keys
- `mental uninstall` does not delete OKF unless you type `DELETE`

## Optional: hooks and MCP

```bash
mental hooks on
mental install --mcp
mental serve
```

Default off. Skill + rule are the contract. [Agents →](docs/agents.md)

---

**npm:** [@balacode/mental](https://www.npmjs.com/package/@balacode/mental) · **repo:** [afaraha8403/mental](https://github.com/afaraha8403/mental) · **license:** [MIT](./LICENSE)
