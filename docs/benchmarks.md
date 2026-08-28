# Benchmarks

Mental is a pulse, not a daemon. The number that matters is “how long until I know where I left off?”

These numbers are measured, not estimated. Reproduce them:

```bash
npm test
npm run bench
```

`scripts/bench.mjs` builds an isolated git repo under a temp `HOME`, seeds continuity + N notes, and reports p50 / p95. It never writes into your real `~/.mental`.

## Snapshot (this repo)

Measured **2026-08-27** on Node **v22.14.0** (linux/x64, 4 CPUs), Mental **0.2.3**. Each row is the **p50 of 21 runs** after 3 warmup runs. p95 in parentheses.

This Node build’s `node:sqlite` has **no FTS5 module**. The index still writes a SQLite `concepts` + `links` table; search uses **LIKE** with title-first ranking. When FTS5 is present, search uses `MATCH` + `bm25` instead. Either way, `--type` / `--status` / `--tag` / `--kind` apply before the result cap.

| Surface | p50 (p95) | Notes |
| --- | ---: | --- |
| `node spawn` (`node -e 0`) | 14.0 ms (14.6 ms) | Process overhead |
| `mental where --json` | 43.8 ms (45.2 ms) | Fresh Node process |
| `mental heartbeat --json` | 50.5 ms (51.2 ms) | The agent pulse |
| `mental status --json` | 60.1 ms (61.1 ms) | Pulse + notes + writes `status/current.md` |
| `mental list --type Decision --json` | 44.4 ms (46.4 ms) | Typed filter |
| `collectHeartbeat` (in-process) | 11.2 ms (12.0 ms) | Same function MCP calls after `mental serve` |
| `mental search --json` (100 notes) | 45.5 ms (46.6 ms) | 6 hits, `--type Note` |
| `searchBundle` (100 notes, in-process) | 0.47 ms (0.58 ms) | |
| `mental search --json` (500 notes) | 45.9 ms (47.2 ms) | 30 hits |
| `searchBundle` (500 notes, in-process) | 0.64 ms (0.82 ms) | |
| `mental search --json` (2000 notes) | 46.2 ms (47.5 ms) | 50 hits (result cap) |
| `searchBundle` (2000 notes, in-process) | 1.17 ms (1.28 ms) | |

**Read of the table:** a fresh `mental heartbeat --json` is about **51 ms** on this machine, and **14 ms of that is Node starting**. The pulse itself is **11 ms**. Search at 2,000 notes stays in the same CLI band (~46 ms) because process spawn dominates; in-process search is **1.2 ms**.

That is why agents that can keep `mental serve` warm (MCP) should: the work is cheap; starting Node is most of the CLI cost.

## What we measure

- **CLI rows** — `spawnSync(process.execPath, ["bin/cli.mjs", …])`. This is how humans and shell-using agents invoke Mental.
- **In-process rows** — `import` of `collectHeartbeat` / `searchBundle`. This is how `mental serve` runs after the MCP process is up.
- **Search** — query `needleword` with `--type Note` against N seeded notes (every 17th note is a hit). Hits reported are what the CLI returned, capped at 50.

## What we do not claim

- Not a comparison against another product. Mental’s job is continuity, not grep-replacement throughput.
- Not an FTS5 bm25 number on this host. This Node binary has no `fts5` module. The fallback is tested and the numbers above use it.
- Not your laptop. Cold disk, antivirus, and a larger journal will move the p50. Run `npm run bench` and believe that output.

## Tests

```bash
npm test
```

**161** automated tests on this revision: identity (move, SSH ≡ HTTPS, two clones, fork, worktree, monorepo), leftover import, search filters and title ranking, plugin schemas, version lockstep, install / doctor / uninstall, heartbeat, MCP tools, optional time tracking.

Zero runtime npm dependencies. Node `>=18`.
