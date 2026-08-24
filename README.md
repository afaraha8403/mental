# Mental

Local-first continuity layer for a human and their coding agents.

**OKF markdown is the source of truth.** A CLI queries and writes it. Agents use `mental … --json` — they do not grep YAML.

- **Repo:** https://github.com/afaraha8403/mental
- **Spec:** [PLAN.md](./PLAN.md) — execute this plan. Do not invent a parallel design.

Mental is **not** a Balakit plugin. Balakit will stop shipping Mental after this CLI exists.

## Status

Phase 0: repository + plan. Implementation starts at PLAN.md phase 1 (`mental where`).

## Install (later)

```bash
npm i -g @mental/cli
mental install
```

Do not publish to npm until the maintainer asks.

## Privacy

Default store is `~/.mental/` (private). Project `.mental/` is opt-in and gitignored. Never commit journals or tokens here.
