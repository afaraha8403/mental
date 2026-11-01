# Mental CLI docs

Mental CLI is a local-first continuity layer for you and your coding agents. **I type mental.** This hub is the map. The [README](../README.md) is the landing page.

## Start here

1. **Install.** [Install Mental CLI](./install.md). Run `npm i -g @balacode/mental`, then `mental install`, then `mental doctor`.
2. **Open.** [Dashboard](./dashboard.md) in the browser. [Host UIs](./hosts.md) for the Claude panel or the Cursor sidebar.
3. **Look up.** [CLI reference](./cli.md) for a flag. [Decision models](./decide.md) only if you want a model key.

## The map

- [Why Mental CLI](./why.md). The contract, and what we refuse to be.
- [The research](./research.md). Verification load, supervisory work, stealth switching (2024–2026).
- [Optional time tracking](./track.md). Wall time and a customer export. Off until you turn it on.
- [For agents](./agents.md). Skill, rule, `--json`, MCP, receipts, fail-open.
- [Identity](./identity.md). UUID bindings, remap, split, `mental local`.
- [Benchmarks](./benchmarks.md). Measured numbers, and how to reproduce them.

Also in the repo, not on this site:

- [PLAN.md](../PLAN.md). Product spec.
- [skill/mental/SKILL.md](../skill/mental/SKILL.md). The procedure agents load.
- [CHANGELOG.md](../CHANGELOG.md). What shipped.

OKF markdown is the source of truth. SQLite is a derived cache. Agents call `mental … --json`. They do not grep YAML.
