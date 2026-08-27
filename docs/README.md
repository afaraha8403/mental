# Mental docs

Mental is a local-first continuity layer for you and your coding agents. This hub is the map. The [README](../README.md) is the landing page.

| Doc | Start here if you want… |
| --- | --- |
| [Why Mental](./why.md) | The problem, the contract, and what we refuse to be |
| [The research](./research.md) | Resumption lag, attention residue, interrupted-work stress |
| [Install](./install.md) | npm, Agent Plugins, Cursor, Claude Code, Copilot, a git clone |
| [CLI reference](./cli.md) | Every command, flag, and exit code |
| [Agents](./agents.md) | Skill, rule, `--json`, MCP, receipts, fail-open |
| [Identity](./identity.md) | UUID bindings, remap / split / link, `mental local` |
| [Benchmarks](./benchmarks.md) | Measured numbers and how to reproduce them |

Also in-repo, not rewritten here:

- [PLAN.md](../PLAN.md) — product spec (source of truth for behavior)
- [skills/mental/SKILL.md](../skills/mental/SKILL.md) — the procedure agents load
- [CHANGELOG.md](../CHANGELOG.md) — what shipped

OKF markdown is the source of truth. SQLite is a derived cache. Agents call `mental … --json`. They do not grep YAML.
