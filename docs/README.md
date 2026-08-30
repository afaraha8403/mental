# Mental CLI docs

Mental CLI is a local-first continuity layer for you and your coding agents. **I type mental.** This hub is the map. The [README](../README.md) is the landing page.

| Doc | Start here if you want… |
| --- | --- |
| [Why Mental CLI](./why.md) | The problem, the contract, and what we refuse to be |
| [The research](./research.md) | Verification load, supervisory work, stealth switching (2024–2026) |
| [Install Mental CLI](./install.md) | npm, Agent Plugins, Cursor, Claude Code, Copilot, OpenCode, a git clone, upgrade |
| [Optional time tracking](./track.md) | Automated wall/billable record, customer copy, several clocks, dated export |
| [Mental CLI reference](./cli.md) | Every command, flag, and exit code |
| [Mental CLI for agents](./agents.md) | Skill, rule, `--json`, MCP, receipts, fail-open |
| [Mental CLI identity](./identity.md) | UUID bindings, remap / split / link, `mental local` |
| [Mental CLI benchmarks](./benchmarks.md) | Measured numbers and how to reproduce them |

Also in-repo, not rewritten here:

- [PLAN.md](../PLAN.md) — product spec (source of truth for behavior)
- [skill/mental/SKILL.md](../skill/mental/SKILL.md) — the procedure agents load
- [CHANGELOG.md](../CHANGELOG.md) — what shipped

OKF markdown is the source of truth. SQLite is a derived cache. Agents call `mental … --json`. They do not grep YAML.
