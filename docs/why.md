# Why Mental

You should not have to reconstruct a project from chat history.

That reconstruction is the fatigue: decision fatigue and brain fatigue from orchestrating several projects and several agents. The literature calls the mechanisms **resumption lag** and **attention residue**. Mental is the external cue those papers asked for.

Git already records **what** changed. The expensive part of a hop — a weekend, a new agent, a second clone — is the rest: where you left off, why a decision was made, what is still in the air, and the next exact action. That is the only thing Mental stores.

Write for the human who comes back in two weeks. The agent is a scribe.

Citations: [The research](./research.md).

## Git vs Mental

| Git knows | Mental knows |
| --- | --- |
| Files and diffs | Current focus |
| Commit messages | Why a choice constrains the future |
| Branch / dirty | Residue still in the air after a hop |
| History | One exact resume line |

Mental does not replace git, issues, or `PLAN.md`. It holds the small amount those systems cannot see.

## The contract

1. **OKF markdown is the source of truth.** Deleting the sqlite file must not lose knowledge.
2. **The CLI is the write path.** Humans type `mental`. Agents call `mental … --json`.
3. **Home by default.** Data lives in `~/.mental`, partitioned by a UUID. Project `./.mental` only after `mental local`.
4. **Identity survives a move.** Two clones of the same origin share one brain until you `split`.
5. **Fail open.** Missing Mental must not block coding.
6. **Private by default.** Never commit the store. Never write secrets.

```mermaid
flowchart LR
  OKF["OKF files"] --> CLI["mental CLI"]
  CLI --> OKF
  CLI --> IDX["Derived sqlite"]
  IDX --> Search["search / list / show"]
  Rule["Tiny always-on rule"] --> Skill["Mental skill"]
  Skill --> CLI
  MCP["Optional MCP"] --> CLI
```

Layers never invert: files → resolver → CLI → index → skill / rule / hooks / MCP.

## What Mental is not

- Not a todo app, GTD system, or issue tracker
- Not a chat transcript store — extract residue, throw the dump away
- Not a second `PLAN.md` — point at the plan with `--against`, do not copy it
- Not a secret store
- Not a hosted SaaS, vector database, or graph as source of truth
- Not a standing TUI. `mental` prints a pulse and exits.

## Vocabulary

| Type | Path | When to write |
| --- | --- | --- |
| Journal | `journal/YYYY-MM-DD.md` | One section per real task boundary |
| Decision | `decisions/YYYY-MM-DD-slug.md` | A choice that constrains the future |
| Attention | `attention/YYYY-MM-DD-slug.md` | Residue in the air (direction, concern, thread) |
| Note | `notes/slug.md` | A durable fact that saves future investigation |
| Status | `status/current.md` | Disposable cache. Not SoT. |

Heartbeat shows at most **7** open or later attention items. Residue that cannot close is a graveyard — resolve it.

See [identity](./identity.md) for how a repo finds its brain, and the [CLI reference](./cli.md) for the write commands.
