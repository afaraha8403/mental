---
name: Mental CLI
overview: "New product repo at `/home/ali/Development/Projects/mental` (own git root, public github.com/afaraha8403/mental — not balacodeio). Ship the CLI, then deprecate and remove Mental from Balakit so Balakit no longer owns or ships it."
todos:
  - id: phase-0-repo
    content: "Create /home/ali/Development/Projects/mental, PLAN.md, then public GitHub repo github.com/afaraha8403/mental (NOT balacodeio); git push -u origin main"
    status: completed
  - id: phase-1-where
    content: Implement resolve/bindings/git lib + mental where (--json) + unit tests (origin normalize, walk-up, MENTAL_DIR, git root)
    status: completed
  - id: phase-2-okf-cli
    content: OKF templates, status, journal, decide/note; CLI-first skill + tiny always-on rule (zero Balakit strings)
    status: completed
  - id: phase-3-install-doctor
    content: mental install to user skill/rule dirs; doctor; ignore-check before creating ./.mental
    status: completed
  - id: phase-4-search
    content: search/list/show + sqlite FTS or file-scan fallback + reindex
    status: completed
  - id: phase-5-local-remap
    content: mental local --import/--move, remap/split/link, identity tests (mv, fork, two clones, worktree)
    status: completed
  - id: phase-6-optional
    content: uninstall (no data wipe), hooks off-by-default, optional mental serve MCP (heartbeat is the TTY no-args surface; no standing TUI)
    status: completed
  - id: phase-7-deprecate-balakit
    content: Deprecate Mental in Balakit — changelog, README pointer to @balacode/mental, remove skill/rule/plugin/CLI policy flags/PERSONAL_RULES, tests, generated AGENTS/CLAUDE mentions
    status: completed
  - id: phase-9-agent-plugin
    content: "Ship as Agent Plugins 1.0.0 — root plugin.json, mcp.json stdio (./bin/cli.mjs serve), skills/mental; tests lock the closed schemas"
    status: completed
  - id: cli-ux-0-catalog
    content: "Single command catalog (groups, flags, examples, effects) driving help, schema, completions, MCP inputSchema"
    status: pending
  - id: cli-ux-a-help-traps
    content: "Per-command help; grouped -h vs --help; mental --json → heartbeat; reject unknown flags; POSIX --"
    status: pending
  - id: cli-ux-b-envelope-caps
    content: "error.hint + usage exit 2; doctor ok:false; list/search caps + truncated; schema --json; journal requires --resume"
    status: pending
  - id: cli-ux-c-human-polish
    content: "NO_COLOR / TERM=dumb / --plain; TTY heartbeat footer; shell completions; TTY-only did-you-mean (never auto-run)"
    status: pending
  - id: cli-ux-d-skill-fields
    content: "Split SKILL.md (procedure vs flags); heartbeat --fields; CI skill against schema; additive id/mode on heartbeat JSON"
    status: pending
isProject: false
---

# Mental CLI — standalone product (verbose execution plan)

This document is the **source of truth for the next agent session**. After approval, that session must:

1. Create `/home/ali/Development/Projects/mental` as **its own git repository** (own product, own GitHub). On disk it sits next to Balakit only because both live under `Projects/` — **not** because Mental remains a Balakit subproject. **Do not nest it inside the Balakit tree.**
2. `git init`, MIT license, `README.md` pointing at this spec.
3. **Copy this entire plan verbatim into `PLAN.md` at the repo root** (plus `docs/` mirrors if useful). Do not summarize away detail.
4. **Create a public GitHub repository on the personal account `afaraha8403`, never under the `balacodeio` org.** Canonical URL: `https://github.com/afaraha8403/mental`. `git remote add origin git@github.com:afaraha8403/mental.git` (or HTTPS), `git push -u origin main`.
5. Implement Mental CLI in that repo (phases 0–6).
6. **Then deprecate Mental out of Balakit** (phase 8, required — not optional). Balakit must stop shipping Mental skill/rule/plugin/CLI flags. Point users at `@balacode/mental` / `github.com/afaraha8403/mental`. User `.mental/` data is never deleted.

### GitHub hosting (personal, public)

- **Owner:** `afaraha8403` (personal). **Visibility:** public.
- **Forbidden:** `balacodeio/mental`, any org under `balacodeio`, transferring the repo to the org without an explicit later ask.
- **Create command (executing agent):** `gh repo create afaraha8403/mental --public --source=/home/ali/Development/Projects/mental --remote=origin --push` after local init + first commit. If `gh` is logged into an org token, **switch to personal**: `gh auth login` as `afaraha8403` (this machine’s `GITHUB_TOKEN` was invalid at plan time). Confirm `gh api user --jq .login` prints `afaraha8403` **before** `repo create`.
- `package.json` `repository.url`: `https://github.com/afaraha8403/mental.git`. Same for `homepage` / `bugs`.
- LICENSE MIT is correct for a public personal repo. Do **not** put secrets, `~/.mental` dumps, or Balakit private notes in the public tree. `PLAN.md` is product spec (OK to be public).

**Decision already made (do not reopen unless a Must breaks):** Option A (home-canonical OKF + CLI-first agents), absorbing Option B’s **stable UUID identity** and **MCP as a peer**, rejecting overlay-by-default and hooks-on-by-default.

**Inspiration to steal (pattern, not vendor lock-in):** [okf-tools](https://github.com/hdean-ssp/okf-tools) — files remain SoT; SQLite sidecar is gitignored and rebuildable; hybrid search later. [Graphify](https://github.com/Graphify-Labs/graphify) — Skill + tiny always-on rule tell agents to shell the CLI; MCP optional.

---

## 1. Problem, product, non-goals

### Problem

Today Mental is a **Balakit personal capability**: skill + always-on rule + gitignore policy. Data lives in **per-repo `.mental/`**. Agents **read/write markdown and YAML directly**. As the OKF bundle grows, grep is noisy (frontmatter keys vs body vs tags). Continuity is trapped in one clone; moving a repo orphans the “where” story unless the folder moves with it. Balakit `doctor` owns ignore setup. That coupling blocks Mental as its own product.

### Product

**Mental CLI** is a local-first continuity layer for a human and their coding agents:

- **OKF markdown + YAML frontmatter** is the only source of truth.
- A **derived SQLite index** answers structured queries (type, status, tags, FTS, links).
- **Default store is user-global** (`~/.mental/`), partitioned per project identity.
- A **project may break off** into `./.mental/` (exclusive nearest-wins; no silent merge of personal + project).
- Humans use a **CLI** (TTY heartbeat or named commands). Agents use the **same CLI with `--json`**, instructed by a **tiny always-on rule** + a **Skill**. Hooks and MCP are **optional**.

### Reader of `.mental/`

The **user** (and future-them in two weeks). The agent is a scribe. Write for a human, not for RAG dumps.

### Musts

- OKF files remain SoT. Deleting the sqlite file must not lose knowledge.
- Default data location: home. Project-local only after explicit `mental local`.
- **Exclusive** active bundle: never auto-overlay personal journal into a project session.
- Agents **must not grep** OKF; they call `mental … --json`.
- Identity **survives path change** (UUID, not filesystem path, not raw origin URL as id).
- Works **without** hooks, MCP, or even a successful index (fallback: read files via CLI still).
- Private by default; never store secrets; never commit `~/.mental` or project `.mental/` unless the user later opts into tracked (out of v1 if it complicates).
- Missing Mental **must not block coding** (fail open).
- Uninstall **must not delete OKF** without a typed confirmation phrase.
- Existing Balakit users with `./.mental/`: **process into `~/.mental/projects/<uuid>/`** on first **write** resolve (`install`, `status`, `journal`, … — not `where` or the TTY heartbeat). Classify onto canonical OKF paths, normalize frontmatter, rebuild the derived sqlite index. Never delete the leftover folder. After import, `where` reports **home** unless the user ran `mental local` (writes `.mental-local` marker).

### Non-goals (v1)

- Hosted SaaS, Neo4j, Graphify as store, vector DB as SoT.
- Replacing git, GitHub issues, READMEs, or task managers.
- Silent merge of all projects into one context window.
- Auto-journal on every agent Stop hook.
- Windows-first polish (must not break POSIX; Windows PATH/home is a test later).
- Keeping Mental as a Balakit-owned capability. **Deprecation in Balakit is in scope** (after CLI exists so users have somewhere to go).

---

## 2. Architecture

```mermaid
flowchart TB
  subgraph sources [Source of truth]
    OKF["OKF files: journal, decisions, attention, notes, status"]
  end
  subgraph resolve [Resolve active bundle]
    Env["MENTAL_DIR"]
    Walk["Walk-up ./.mental/"]
    Bind["~/.mental/bindings.json UUID"]
    Home["~/.mental/projects/UUID/"]
    Env --> Walk
    Walk --> Bind
    Bind --> Home
  end
  subgraph cli [mental CLI]
    Where["where / status"]
    Search["search / list / show"]
    Write["journal / attention / decide"]
    Doctor["doctor / remap / local"]
  end
  subgraph derived [Derived]
    SQLite["~/.cache/mental/UUID.sqlite"]
  end
  subgraph agents [Agents]
    Rule["Tiny always-on rule"]
    Skill["mental skill"]
    Hooks["Optional hooks"]
    MCP["Optional mental serve"]
  end
  OKF --> resolve
  resolve --> cli
  cli --> OKF
  cli --> SQLite
  SQLite --> Search
  Rule --> Skill
  Skill --> cli
  Hooks --> Where
  MCP --> cli
```



**Layers (never invert):**

1. **OKF files** — SoT.
2. **Resolver** — which directory is active (`mental where`).
3. **CLI** — only supported write path; `--json` for agents.
4. **Index** — cache. Rebuild from files.
5. **Skill / rule / hooks / MCP** — tell agents to use (3), never to parse YAML themselves.

---

## 3. On-disk layout

### 3.1 User store (default)

```text
~/.mental/
  mental.toml                 # user config: privacy, editor, default mode
  bindings.json               # UUID ↔ origins[], paths[], name
  journal/                    # cross-project personal journal (only when active root is ~/.mental itself)
  notes/
  decisions/
  index.md                    # OKF bundle index
  log.md                      # optional OKF log
  projects/
    <uuid>/
      index.md
      status/current.md
      journal/YYYY-MM-DD.md
      decisions/YYYY-MM-DD-slug.md
      attention/YYYY-MM-DD-slug.md
      notes/slug.md
```

Use `**~/.mental**` (user asked for a `.mental` folder in home). Do **not** bikeshed XDG for the bundle root in v1. **Do** put the sqlite cache in XDG cache:

```text
${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite
${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite-wal
```

Never commit cache. `mental doctor` rebuilds it.

### 3.2 Project-local store (opt-in)

```text
<repo>/.mental/               # same OKF shape as a project slice
<repo>/.mental-id             # optional, gitignored, uuid only (remap hint)
```

Default git policy for `./.mental/` and `.mental-id`: **not tracked**. Installer may append to user global gitexcludes (same spirit as today’s `global-exclude` in [bin/lib/mental-policy.mjs](bin/lib/mental-policy.mjs)) **only via `mental doctor --fix-ignore`**, never silently from the skill. Skill/agent **must not** edit `.gitignore`.

### 3.3 OKF concept types (keep Mental’s current vocabulary)

Port templates from [skill/mental/references/templates.md](skill/mental/references/templates.md):


| `type` (required) | Path                           | `status` values                                |
| ----------------- | ------------------------------ | ---------------------------------------------- |
| Journal           | `journal/YYYY-MM-DD.md`        | n/a (append-only sections)                     |
| Decision          | `decisions/YYYY-MM-DD-slug.md` | `open` | `deferred` | `decided` | `superseded` |
| Attention         | `attention/YYYY-MM-DD-slug.md` | `open` | `later` | `resolved`                  |
| Note              | `notes/slug.md`                | `draft` | `active` | `superseded`              |
| Status            | `status/current.md`            | regenerated cache, not SoT                     |


Frontmatter: `type` required; recommend `title`, `description`, `timestamp`, `tags`. Attention also has `kind` (`direction` | `concern` | `thread` | `verify`) and optional `from` / `against` / `via`. Paths are identities (don’t rename to “archive”). Links are relative markdown links. Attention is residue, not a todo list — heartbeat shows at most 7 open+later items (`verify` first as Needs eyes; `--status later` as Later, not a note and not a new command).

**Journal section contract** (keep):

```text
## HH:MM — <outcome>
<what changed, evidence, decisions git cannot explain>

Against: <optional repo-relative plan, e.g. PLAN.md>
Resume: <one exact next action> — open loops: <none or list>
```

One section per coherent **task**, not per chat turn. Skip trivial/read-only turns.

---

## 4. Bundle resolution (must be deterministic)

`mental where` prints path, uuid, mode, reason. Agents call this first.

**Order:**

1. If `MENTAL_DIR` is set and is a directory → that path, mode `env`.
2. Walk from `cwd` to git root (or filesystem root, stop at `$HOME`). If `<dir>/.mental/` exists **and** contains the `.mental-local` marker (`mental local`) → that path, mode `local`.
3. Else if git repo: compute binding (section 5). Active path = `~/.mental/projects/<uuid>/` (create skeleton on first write, not necessarily on `where`). `where` and the TTY heartbeat are **read-only** (no binding create, no leftover ingest). If a leftover `./.mental/` exists without the marker, **ingest** it on the next write (`status`, `journal`, `install`, …): classify files onto canonical OKF paths, normalize frontmatter, skip dest files that already exist, never delete the source, then rebuild `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite`.
4. Else (not a git repo): `~/.mental` personal root, mode `personal`. Leftover `./.mental` in a non-git folder is **not** imported (no UUID).

**Exclusive:** never concatenate personal + project trees in `status`/`search` unless a later flag `--also-personal` is implemented (not v1).

**Leftover Balakit import (migration):**

- Leftover `./.mental/` without `.mental-local` is a **source**, not the write root.
- On `mental install` / `status` / `journal` / other **write** resolve: **process** leftover files into `~/.mental/projects/<uuid>/` — not a byte copy.
  - Canonical paths: `notes/<slug>.md`, `decisions/<date>-<slug>.md`, `attention/<date>-<slug>.md`, `journal/<YYYY-MM-DD>.md`. Root `journal.md` → `journal/imported-root.md`. Other root `*.md` → `notes/`.
  - Normalize frontmatter: required `type`; default `status` (`Note`/`Journal` → `active`, `Decision` → `decided` if missing); `title` / `timestamp` / `tags`.
  - Skip `status/` (disposable cache). Skip dest paths that already exist. Never delete the leftover folder.
  - Rebuild the derived sqlite index (`concepts` + FTS5 + `links`) at `${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite`.
- `where` is read-only. After a write import, `where` reports **home**. Write-command JSON may include `imported: { from, copied, skipped }` and `indexed: { path, concepts, backend }`.
- `mental doctor` warns: leftover still on disk (will import / already imported). Checks index presence.
- `mental local` snapshots leftover into home first, then writes `.mental-local` so subsequent resolve stays **local**.
- **Writes** go only to the resolved root. Never write to two trees.

---

## 5. Identity and remap (UUID, not origin)

**Do not use git origin as the id.** Origin is a hint.

`~/.mental/bindings.json` (array of objects):

```json
{
  "version": 1,
  "bindings": [
    {
      "id": "9f3c0a1e-…",
      "name": "balakit",
      "origins": ["github.com/balacodeio/balakit"],
      "paths": ["/home/ali/Development/Projects/balakit"],
      "updatedAt": "2026-08-24T21:00:00Z"
    }
  ]
}
```

Normalize origins: strip `.git`, lowercase host, strip userinfo, treat `git@github.com:org/repo` ≡ `https://github.com/org/repo`.

**Resolve uuid for a git worktree:**

1. If `./.mental-id` exists and matches a binding → use it; append cwd to `paths` if new.
2. Else unique match on normalized origin → use it; append path.
3. Else unique match on cwd in `paths` → use it (repo moved, origin same or not yet updated).
4. Else **fork heuristic:** origin is new but `upstream` matches an existing origin → **do not auto-bind**. Print: `mental remap --from <id>` or `mental new` (new uuid).
5. Else no match → **create new uuid**, record origin+path. First `status`/`journal` creates `projects/<uuid>/`.
6. Ambiguous (two bindings share origin — user ran `split` wrong, or copy-paste) → refuse to guess; `mental remap`.

**Commands:**

- `mental remap` — list bindings, or `mental remap --to <id>` / `--from <id>` for this cwd (writes `.mental-id`).
- `mental split` — this clone gets a **new** uuid (`--copy` duplicates OKF). `mental new` is an alias.
- `mental link --to <id>` — point this cwd at an existing uuid (second clone of same project).

**Default for two clones of the same origin:** **share uuid** (same project brain). User `split` if they want divergence.

**Tests (non-negotiable before calling remap “done”):**

- `mv` repo, origin unchanged → same uuid.
- origin SSH ↔ HTTPS → same uuid.
- two clones, same origin → same uuid.
- fork (origin ≠ old, upstream = old) → no silent inherit.
- `git init` no origin → uuid by path; adding origin later **merges** if that origin already bound (prompt if conflict).
- git worktree → same uuid as main worktree.
- monorepo `cwd=packages/foo` → bind **git root**, not package dir.

Optional `./.mental-id`: write on first bind, add to global exclude. Helps remap before git is available.

---

## 6. CLI surface

**Package:** Node **ESM**, `bin` name `mental`. npm name `@balacode/mental` (unscoped `mental` is taken; set `"bin": { "mental": "bin/cli.mjs" }`).

**Runtime:** Node `>=18`. Dependencies: keep lean. No standing TTY session in v1 (no `@clack/prompts`). `better-sqlite3` or `node:sqlite` if Node version allows — prefer **sql.js / better-sqlite3** with a documented native-build fallback. If native modules are painful, v1 search can be **in-process scan of frontmatter + ripgrep-like filter** and sqlite in v1.1. **Do not block v1 on vectors.**

**No args + TTY:** print a one-shot **heartbeat** (resume, last outcome + when, git one-liner, residue in the air, unsettled decisions) and exit. Not a standing session. UUID, sqlite path, mode, and root belong on `mental where` / `mental doctor`. **Named commands** are one-shot (print or write, then exit). **`--json` never prompts.** **No args + not TTY:** print help, exit 2. Agents use `mental heartbeat --json` for the cheap pulse. There is no `mental ui` / `mental menu` in v1.

**Global flags:** `--json`, `--dir <path>` (overrides resolve, like `MENTAL_DIR`), `--help`, `--version`.


| Command                                        | Behavior                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mental` (no args, TTY)                    | Print heartbeat (resume, last outcome, git, hops, Needs eyes, In the air, Later, unsettled, settled) and exit                                                                                    |
| `mental heartbeat`                             | Same cheap reload as TTY no-args; agents pass `--json`. Read-only for pulse watermark; delta is counts only. Lists capped at 7. `later` / `laterCount` are `--status later` residue. |
| `mental pulse`                                 | Cross-project compact rows from bindings (id, name, resume, counts). No journal bodies. Writes pulse watermark for the active bundle. |
| `mental where`                                 | Active root, uuid, mode, reason. Read-only: does not create a binding or ingest leftover.                                                                 |
| `mental status`                                | Regenerated view: git snapshot + latest Resume + residue + open/deferred decisions + notes. Writes `status/current.md` as cache. Creates identity + leftover ingest on first write. |
| `mental search <q>`                            | Index or file scan; `--type`, `--status`, `--tag`, `--kind`. Hits include `description` + `snippet`; FTS ordered by bm25. |
| `mental list`                                  | Concepts with filters (`--type`, `--status`, `--tag`, `--kind`); includes `description`. |
| `mental show <path>`                           | One file, relative to bundle root. JSON includes `backlinks`. |
| `mental park --resume`                         | Encode at an interruption (default title `"Parked"`). Optional `--attention` + `--kind`. Then heartbeat; writes watermark. |
| `mental handoff --title --resume`              | Planned boundary sugar: journal then heartbeat. Both flags required. Writes watermark. |
| `mental journal [--title] [--resume] [--against]` | Append today’s journal section. `--against` binds resume to a repo-relative plan path. Missing `--title` prints usage. Agents pass `--title` `--body` `--resume` `--json`. |
| `mental attention`                             | Create or update residue (`--kind direction\|concern\|thread\|verify`, `--status open\|later\|resolved`, optional `--via`). Update by `--title` or `--path`. |
| `mental decide`                                | Create or update a decision (`--title` or `--path`; `--status decided` closes)                                                                          |
| `mental note`                                  | Scaffold a note                                                                                                                                         |
| `mental local [--import | --move]`             | Create `./.mental/`. `--import` copies home slice. `--move` copies and stops using home for this uuid (keep files in home unless user confirms delete). |
| `mental remap` / `split` / `link`              | Identity                                                                                                                                                |
| `mental doctor`                                | One writer, ignore policy, index age, PATH, skill install presence; warn on decision budget + stale residue (`--days`)                                   |
| `mental install [--project] [--hooks] [--mcp]` | Copy skill+rule to user agent dirs; optional project vendor; optional hooks; optional MCP config snippet                                                |
| `mental hooks on|off`                          | User-level Claude/Cursor hook snippets calling `mental status --json`                                                                                   |
| `mental serve`                                 | Optional MCP stdio wrapping the same commands                                                                                                           |
| `mental uninstall`                             | Remove installed skills/rules/hooks from **user** agent dirs. Does **not** delete `~/.mental` unless `--delete-data` + typed `DELETE`.                  |
| `mental reindex`                               | Rebuild sqlite from files                                                                                                                               |


**Agent JSON shape (stable):** always `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message" } }`. Optional sibling `update` (`current`, `latest`, `hint`) when npm is ahead — from a 7-day cache, not a live check on every command. `where` data: `{ root, id, mode, reason, gitRoot }`.

**Exit codes:** 0 ok, 1 usage/resolve error, 2 no TTY help, 3 doctor found problems (still print JSON).

---

## 7. Index (steal okf-tools, implement small)

v0.2 schema:

- `concepts(path PK, type, title, description, status, kind, from_val, against, tags_json, mtime, body_text)`
- `links(src, dest, raw)` — dest is bundle-relative; `show` queries backlinks
- FTS5 on `title + body_text`, `ORDER BY bm25(concepts_fts)`, `snippet()` on body

`INDEX_VERSION` in `bin/lib/index.mjs`: mismatch drops and recreates tables. Rebuild: walk `*.md` except `index.md`/`log.md` special cases per OKF. Incremental mtime skip is still later.

Typed filters (`type`, `status`, `tag`, `kind`) apply **in SQL before LIMIT**, not as a JS post-filter.

If `better-sqlite3` is too heavy for first merge: implement `search` as gray-matter parse + substring, with `--json`, and leave sqlite behind a `mental reindex` stub. **Prefer sqlite in v1** if install is smooth.

**No embeddings in v1.** Optional later (`sqlite-vec` + local model), same DB.

---

## 8. Agent contract: skill, rule, hooks, MCP

### 8.1 Skill vs rule (doctrine)

From [skills/authoring-skills-and-rules](skills/authoring-skills-and-rules/SKILL.md):

- **Skill** = procedure (when to journal, commands, privacy). Model-invocable + user `/mental`.
- **Rule** = ~8 lines always-on **pointer**. Not the full lifecycle (today’s [rules/mental.mdc](rules/mental.mdc) is too fat — shrink it).

### 8.2 Tiny rule (copy into user AGENTS.md / CLAUDE.md managed block + Cursor `alwaysApply`)

Approximate text:

- Continuity is Mental CLI. On start/finish of real work, or orientation questions, use the Mental skill.
- Run `mental where` then `mental status --json` (or `search --json`). Do not grep `.mental` or `~/.mental`.
- If `mental` is not on PATH, try `npx @balacode/mental …`. If that fails, continue the user’s coding task and mention install.
- Never commit Mental data. Never write secrets. Never edit gitignore; tell the user to run `mental doctor`.

### 8.3 Skill body (port from [skill/mental/SKILL.md](skill/mental/SKILL.md), rewrite)

**Delete:** Balakit `installed.json`, `npx balakit doctor`, “read YAML files yourself.”

**Add:** CLI-first; `--json`; journal at **task boundary**; derive from git + Resume + open decisions via `status`; create decisions only when they constrain the future; notes only if durable.

**Triggers:** same as today (orientation, start/finish substantive work, decisions).

**Install targets** (`mental install`):

- `~/.claude/skills/mental/SKILL.md` (+ references)
- `~/.cursor/skills/mental/`
- `~/.agents/skills/mental/`
- `~/.config/opencode/skills/mental/`
- Optional: `.github/skills/mental` only with `--project`

Mirror layout like Balakit: **one source** in the mental repo `skill/mental/`, copy to user dirs. Do not maintain five hand-edited copies in the product repo beyond documented mirrors if you use a tiny `scripts/install-skills.mjs`. Plugin hosts load `skills/mental-setup/` only (install the CLI).

### 8.4 Hooks (optional, default off)

`mental hooks on` writes **user** hooks:

- Claude Code: SessionStart + PreCompact → `mental status --json` (cap output, e.g. 2–4 KB).
- Cursor: `~/.cursor/hooks.json` sessionStart — **best-effort**. Known bug: `additional_context` may drop. Document that the **skill+rule** are the real contract.

Never Stop auto-journal.

### 8.5 MCP (optional)

`mental serve`: tools `heartbeat`, `pulse`, `where`, `status`, `search`, `list`, `show`, `park`, `handoff`, `journal`, `attention`, `decide`, `note` wrapping CLI functions in-process (don’t spawn a nested CLI if you can import lib). Search/list accept `type`/`status`/`tag`/`kind`. Tool JSON is compact (not pretty-printed). `mental install --mcp` registers `mental serve` in user-level MCP configs (`~/.cursor/mcp.json`, `~/.claude.json`); `mental uninstall` removes only Mental’s entry. MCP exists so tool-only agents (parallel sessions, orchestrators) can re-pulse and record mid-chat; still keep CLI for everyone else.

### 8.6 Agent Plugins package (portable)

The repo root **is** the plugin root ([Agent Plugins 1.0.0](https://agent-plugins.org/specification)). Skills-only: missing `mcp.json` is not an error.

- `plugin.json` — closed manifest (`$schema` + `name` required). No inline MCP, hooks, or rules in this file.
- `skills/mental-setup/SKILL.md` — discovered as the immediate child of `skills/`. Bootstrap: install or upgrade the CLI (`npm i -g` + `mental install` + `mental doctor`). Not a second procedure. Do not skip `mental install` just because `mental` is already on PATH.
- `skill/mental/` — full CLI-first procedure + `references/`. Copied by `mental install` only. **Not** under `skills/` (same reason track lives in `optional/`).
- No `mcp.json` / `.mcp.json`. Native plugin does **not** start MCP. Optional MCP is PATH `mental serve` via `mental install --mcp` only.

Rules and hooks stay client-specific (`rules/mental.mdc`, `hooks/session-start.sh`) and install via `mental install` / `mental hooks on`. They are not portable v1 components. Cursor-facing extras live in `.cursor-plugin/plugin.json` (`logo: assets/logo.png`). Claude Code extras live in `.claude-plugin/plugin.json` (`displayName: Mental`) with **no** `mcpServers`. Do not put `logo` on the portable `plugin.json` — the schema is closed.

---

## 9. Privacy and gitignore

v1: **always private.**

- Home bundle: never an install-time git question.
- Project `.mental/`: `mental doctor --fix-ignore` may add `mental/` / `.mental/` to **user global excludes** (same as Balakit `global-exclude`). Do **not** have the agent edit `.gitignore`.
- Skill: if creating `./.mental/` and `git check-ignore` fails, **refuse create**, tell user `mental doctor --fix-ignore`.

Tracked/shared Mental is a later policy flag (Balakit already has `tracked` / `repo-gitignore`). Do not implement four policies on day one unless copying [bin/lib/mental-policy.mjs](bin/lib/mental-policy.mjs) is cheaper than arguing — **prefer one private path in v1**.

---

## 10. Install, doctor, uninstall

**Human:**

```bash
npm i -g @balacode/mental    # or npx
mental install          # skills + tiny rule, user-global; creates ~/.mental skeleton
```

`**mental install --project`:** vendor skill into the current repo (team shares procedure, not data).

**Doctor checks:** binary on PATH; active `where`; bindings sane; ignore for local mode; index mtime; skills present in at least one agent dir; two-writer warning.

**Uninstall:** remove skill/rule/hooks copies Mental installed (leave user edits to AGENTS.md with a managed begin/end comment, same idea as Balakit `BEGIN`/`END` in [bin/lib/pkg.mjs](bin/lib/pkg.mjs)). Data stays.

---

## 11. Edge cases (implement as tests where possible)


| Case               | Behavior                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `MENTAL_DIR`       | Wins                                                              |
| Legacy `./.mental` | Local wins                                                        |
| Repo `mv`          | Rebind path                                                       |
| Two clones         | Shared uuid                                                       |
| Fork               | Prompt / new uuid                                                 |
| Not git            | Personal `~/.mental`                                              |
| Monorepo subdir    | Git root                                                          |
| Sandbox no HOME    | Fail open; no writes                                              |
| Cloud agent        | No home store; skip                                               |
| Stale index        | Rebuild on mtime mismatch                                         |
| Uninstall          | No data delete                                                    |
| Secrets in files   | Don’t scan-for-secrets in v1 beyond “never write tokens” in skill |


---

## 12. New repo layout (`/home/ali/Development/Projects/mental`)

```text
PLAN.md                 # this plan, verbatim
README.md               # install + mental where/status/search + privacy
LICENSE                 # MIT
package.json
plugin.json             # Agent Plugins 1.0.0 manifest
bin/cli.mjs             # argv router
bin/commands/*.mjs      # where, status, search, journal, local, remap, doctor, install, hooks, serve
bin/lib/resolve.mjs     # bundle resolution
bin/lib/bindings.mjs
bin/lib/okf.mjs         # parse/write frontmatter, templates
bin/lib/index.mjs       # sqlite or scan
bin/lib/git.mjs         # origin normalize, git root
bin/lib/install-skills.mjs
skill/mental/SKILL.md   # full procedure (mental install)
skill/mental/references/templates.md
skills/mental-setup/SKILL.md  # plugin bootstrap: install the CLI
rules/mental.mdc        # tiny alwaysApply pointer (Cursor source)
hooks/session-start.sh  # calls mental status --json
test/*.test.mjs         # resolve, bindings, origin normalize (node:test)
.gitignore              # node_modules, .sqlite
```

**Do not** copy Balakit’s whole installer. Steal only Mental-relevant snippets: templates, journal contract, privacy wording, ignore-check pattern.

---

## 13. Deprecate Mental from Balakit (required)

Mental **leaves Balakit**. The new repo is the only product. Balakit must not keep a fork of the skill.

**Order:** ship a working `mental` CLI + install path first (phases 0–3 minimum), **then** change Balakit in a **separate Balakit commit/PR** so users are never left with no installer.

**Balakit changes (phase 8):**

- Changelog `[Unreleased]` **Changes:** Mental is deprecated; install `@balacode/mental` / see `https://github.com/afaraha8403/mental`.
- README / kit description: drop “flexible Mental continuity layer” as a Balakit feature.
- Remove personal Mental from the installer: `PERSONAL_RULES`, `RULE_BUNDLED_SKILLS.mental` in [bin/lib/pkg.mjs](bin/lib/pkg.mjs); `mentalTooling` / `mentalDataPolicy` flags in [bin/cli.mjs](bin/cli.mjs) / [bin/commands/init.mjs](bin/commands/init.mjs); [bin/lib/mental-policy.mjs](bin/lib/mental-policy.mjs), [bin/lib/mental-exclude.mjs](bin/lib/mental-exclude.mjs); doctor/status branches that exist only for Mental.
- Delete (or replace with a one-line stub that says “moved”) [skills/mental](skills/mental), [rules/mental.mdc](rules/mental.mdc), mirrors under `.cursor/skills/mental`, `.claude/skills/mental`, `.agents/skills/mental`, and [plugins/balakit-mental](plugins/balakit-mental). Run the existing plugin/sync scripts so generated files do not resurrect Mental.
- Tests: drop Mental-policy install tests; keep ignore/doctor tests only if they still apply to other features.
- Generated `AGENTS.md` / `CLAUDE.md` templates: remove Mental always-on blocks.
- Optional compatibility: if `balakit add mental` remains, it should **fail with a message** (or exec `npx @balacode/mental install`) — do not keep shipping the old skill.

**Do not:** delete anyone’s `~/.mental` or repo `.mental/` data. Deprecate **tooling in Balakit**, not user journals.

**Do not:** put the Mental CLI *inside* the Balakit git repo. Own git root + own GitHub (`afaraha8403/mental`).

---

## 14. Implementation phases (execute in order)

### Phase 0 — Repo, this plan, and public GitHub

- `mkdir /home/ali/Development/Projects/mental`
- `git init -b main`
- Write `PLAN.md` (full text of this plan)
- `README.md` stub (link `https://github.com/afaraha8403/mental`), `LICENSE`, `package.json` (`repository`: `afaraha8403/mental`)
- `.gitignore`
- First commit
- Verify `gh api user --jq .login` is `afaraha8403` (not an org)
- `gh repo create afaraha8403/mental --public --source=. --remote=origin --push`
- **Do not** create `balacodeio/mental`

### Phase 1 — Resolver + where

- `resolve.mjs`, `bindings.mjs`, `git.mjs`
- `mental where` human + `--json`
- Tests: origin normalize, walk-up `.mental`, `MENTAL_DIR`, git root vs nested cwd

### Phase 2 — OKF skeleton + status + journal

- Create home/project slice templates (from current Mental templates)
- `mental status` (git + last Resume + open decisions; write `status/current.md`)
- `mental journal` append
- `mental decide` / `mental note` scaffolds
- Port skill **CLI-first** into `skills/mental/SKILL.md`
- Tiny `rules/mental.mdc`

### Phase 3 — install + doctor

- Copy skill/rule to `~/.claude`, `~/.cursor`, `~/.agents` (and AGENTS.md/CLAUDE.md managed blocks if you can do it safely)
- `mental doctor`
- Ignore check before creating `./.mental`

### Phase 4 — search

- sqlite FTS or file scan + filters `--type --status --tag`
- `mental reindex`

### Phase 5 — local / remap / split / link

- Full identity tests (mv, SSH≡HTTPS, two clones, fork, path-then-origin merge, worktree, monorepo)
- `mental local --import|--move`
- `mental remap` / `split` / `link`

### Phase 6 — optional hooks + MCP

- Default off (`mental hooks on|off`; `mental install --hooks` opt-in)
- `mental serve` MCP stdio (where/status/search/show/journal)
- `uninstall`

### Phase 7 — polish (Mental repo)

- TTY heartbeat (shipped — print and exit; no standing session)
- `uninstall`

### Phase 8 — deprecate Mental in Balakit (required)

Work in `/home/ali/Development/Projects/balakit` **after** Mental CLI install works:

- CHANGELOG + README: Mental moved to `github.com/afaraha8403/mental`
- Remove installer/policy/plugin/skill/rule/mirrors/tests as listed in §13
- `./sync` / plugin build so copies do not come back
- Do not wipe user `.mental/` data
- README: how humans and agents use it; remap; fail-open

### Phase 9 — Agent Plugins package

- Root `plugin.json` targeting `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`
- Skills-only plugin: no `mcp.json`. Hosts load `skills/mental-setup/` (install the CLI)
- Full procedure source is `skill/mental/` (`mental install` only — not under `skills/`)
- Tests: skills-only plugin still valid; `bin/cli.mjs` exists as the CLI product
- Optional MCP is PATH `mental serve` via `mental install --mcp` only
- Do **not** treat rules/hooks as portable components

---

## 15. Testing and acceptance

- `node --test` for resolver/bindings (no network).
- Manual: install, `journal` in a git repo, `where` (same uuid), move directory, `where` same uuid.
- Agent acceptance: skill installed, agent asked “where did we leave off?” → must run `mental status --json` (or skill that does), **not** Grep on `Resume:`.

---

## 16. Documentation the next agent should write in-repo

- `README.md` — install, commands, privacy, “agents use --json”.
- `PLAN.md` — this file (do not replace with a short summary).
- Skill `when_to_use` — orientation, handoff, decisions.

---

## 17. Explicit non-actions

- Do not publish to npm until the user asks.
- Do not create or push to **`balacodeio/*`**. GitHub owner is **`afaraha8403`** only.
- Do not leave Mental living as a Balakit feature after phase 8 (deprecate it).
- Do not nest the Mental git repo inside Balakit.
- Do not delete user `.mental/` data when removing Balakit tooling.
- Do not enable hooks by default.
- Do not overlay personal + project search in v1.
- Do not use Graphify `graph.json` as SoT.
- Do not commit `.mental/` user data or tokens to the public repo.

---

## 18. CLI UX — humans + agents (post-0.5.1)

Research (Aug 2026): clig.dev, 12-factor CLI, CLI Spec 0.3, Arcjet agent CLI, Anthropic tool-writing + Agent Skills, Claude Code `--help` learning, gh `--json` field projection, git porcelain vs plumbing, .NET CLI guidance, WCAG2ICT / GitHub CLI a11y, Nielsen errors, Cursor Shell Mode. Canvas: session `cli-ux-research`.

**Verdict:** Dual surface is already right (TTY heartbeat vs `--json`). Do not redesign the command tree. Improve discoverability, honest envelopes, and bounded output.

### Invariants (do not reopen)

- Same binary, two renderers. CLI is the write path. MCP remains optional peer.
- TTY heartbeat may evolve (git human `status`). `--json` is `--porcelain=v2`: additive fields only, no ANSI, ignore-unknown.
- Do **not** default named commands to JSON when piped (breaks `mental where | grep`). Skill already forces `--json`.
- Do **not** rename `park` / `handoff` / `heartbeat` / `pulse` / `status` / `where`. Fix **help language** (identity vs cheap reload vs notes dump vs cross-repo rows).
- Do **not** noun-verb rewrite (`mental decision create`).
- Do **not** `--dry-run` / `--confirm` on journal. Confirm stays on uninstall wipe and optional-feature consent.
- Do **not** fuzzy-auto-run typos. TTY may *suggest*; `--json` hard-fails.
- Do **not** MCP-wrap identity (`remap` / `split` / `link` / `local`) or dump the full CLI schema into MCP context.
- Do **not** add `--verbose` on heartbeat that dumps notes. That is `status`.
- Do **not** grow SKILL.md. Flag grammar belongs in `--help` / `schema`; procedure stays in the skill. Unread `references/` cost zero tokens.
- Do **not** design for Warp typing into a PTY. Cursor Shell Mode: 30s, no prompts.
- Color never carries meaning. Labels stay words. `--json` never SGR. 4-bit ANSI only if we color TTY later.

### Foundation — `cli-ux-0-catalog`

One table in `bin/lib/catalog.mjs` (name TBD) is the source of truth:

- `group`: Daily | Lookup | Write | Identity | Setup
- `summary` (one line), `usage`, 2–3 copy-paste `examples` (human + `--json`)
- `flags`: name, required, enum, default
- `effects`: `read_only` | `idempotent` | `non_idempotent`
- `rest`: whether positionals exist; honor POSIX `--`

`parseArgv`, `usage()`, `mental schema --json`, completions, and MCP `inputSchema` all read this table. Do not hand-maintain three lists.

Dispatch change in `bin/cli.mjs`: handle `--help` **after** command parse so `mental handoff --help` is per-command. Global `-h` / no-command `--help` stay grouped.

### Phase A — Help + agent traps (`cli-ux-a-help-traps`)

Highest leverage. Unblocks Claude Code’s “run `--help` then use it.”

1. **Per-command help** from the catalog. Examples first. Required vs optional. Enums (`--kind direction|concern|thread|verify`). Distinct one-liners for where / heartbeat / status / pulse.
2. **Progressive disclosure:** `mental -h` = one screen (what it is + Daily core: heartbeat, park, handoff, decide, attention, search + pointer to `--help` / `--json`). `mental --help` = full 25 grouped. jq/clap pattern.
3. **`mental --json` with no command** → heartbeat envelope (exit 0), not usage text exit 2. Tiny; stops the #1 agent trap. TTY no-args unchanged.
4. **Reject unknown flags.** Today `--josn` becomes `flags.josn = true` and is ignored. Error with `hint` listing legal flags for that command.
5. **POSIX `--`:** `mental search -- -label` is a query, not a flag.
6. Tests: `test/heartbeat.test.mjs` (no-command `--json`), new `test/help-catalog.test.mjs` (per-command help contains examples; unknown flag fails; `--` search). Update `test/attention.test.mjs` help assertion.

Docs: `docs/cli.md` command table generated or kept in lockstep with the catalog.

### Phase B — Honest machine contract (`cli-ux-b-envelope-caps`)

`--json` stays a versioned API.

1. **`error.hint`** (copy-paste next argv). Optional `retryable` (default omit/false). Usage failures **exit 2** (POSIX). Keep exit 2 for non-TTY no-args *without* `--json` (help). `--json` no-args is heartbeat after Phase A. Update `docs/cli.md` exit-code table. This is a minor contract bump (was exit 1 for missing `--title`).
2. **Human errors → stderr.** `--json` envelope stays **stdout** (do not break skill/tests).
3. **`doctor --json`:** `ok: false` when process exit is 3 (error-level problems). Warn-only checks stay `ok: true` with `level: "warn"` (current stale/budget behavior). Agents that only read `ok` currently miss PATH/ignore failures.
4. **Caps:** `list` default cap (match search or 50) + `truncated` + `total`. Search already caps 50 — emit `truncated` / `total`. Do not cap `status` notes into heartbeat; keep status explicit.
5. **`mental schema --json`:** dump the catalog (no auth, no network). `mental heartbeat --json` with `--fields` omitted may later list legal field names (gh trick) — implement field listing in Phase D; schema command here.
6. **`journal` requires `--resume`** (align with park/handoff). Kill the silent `"Continue. — open loops: none"` default. Skill already requires it.
7. Additive (safe): include `id` / `mode` on heartbeat JSON so agents can skip a `where` round-trip. Do not put notes on heartbeat.

Unknown-command `--json`: envelope `code: unknown-command` + `hint` listing Daily names (not fuzzy execute). TTY may print “similar: …” as a hint only.

### Phase C — Human polish (`cli-ux-c-human-polish`)

1. Honor `NO_COLOR` (non-empty), `TERM=dumb`, optional `--plain` / `--no-color`. `MENTAL_ASCII` stays for emoji. Doctor `✓/✖` must respect ASCII/plain.
2. TTY heartbeat footer: `more · mental doctor · mental search · mental --help`. clig “suggest the next command.”
3. Shell completions (bash/zsh/fish) generated from the catalog. `mental completion bash` or install-time snippet — pick the smaller of the two; do not add a completion framework dep.
4. TTY-only “did you mean” for unknown commands. Never auto-run. `--json` hard-fail.
5. Optional later: 4-bit ANSI on TTY labels only. Not required to close this phase.

### Phase D — Skill + field masks (`cli-ux-d-skill-fields`)

Depends on A+B (help and schema exist).

1. **SKILL.md** keeps *when* to write (orient / residue / park vs handoff / fail-open / receipt). Move flag cheatsheet to `skill/mental/references/cli.md` or tell agents to run `mental <cmd> --help`. Target: body stays procedure; Anthropic Level 3 for flags. Always-on rule stays tiny.
2. **`--fields`** on heartbeat (and maybe search): `mental heartbeat --json --fields resume,attention`. Compact default unchanged. Do not add a third dump command.
3. **CI:** test that skill/rule command names ⊆ catalog. Prevents SKILL.md drift (`--foo` that the CLI renamed).
4. MCP `inputSchema` generated from the catalog for the **existing** tool subset. Do **not** 1:1 map all 25 CLI verbs (OpenAI/Vertex: start with under 20 tools; Anthropic always-loaded band is 3–5). Keep `option` / `track` deferred until those features are on. Add `against` on journal MCP (today missing). Enum `kind` / `status` where the CLI already has a closed set.

### Out of scope (explicit)

- Standing TUI / pager / interactive wizards.
- JSON-when-piped default for named commands.
- Renaming pulse/heartbeat/status.
- `--dry-run` on OKF writes.
- `--verbosity` five-level ladder.
- `mental alias`.
- Wrapping remap/split/link as MCP tools.

### Semver

Ship as **0.6.0**. Additive help/schema/fields + small error-code change (usage 1→2) + journal `--resume` required. Cut CHANGELOG `[Unreleased]` when the first phase lands, not when this section is written.

### Acceptance

- `mental handoff --help` shows handoff examples, not the 25-command wall.
- `mental --json` (no command) is a heartbeat envelope, `ok: true`.
- `mental journal --json --title X` without `--resume` is `ok: false`, exit 2, `error.hint` names `--resume`.
- `mental nosuch --json` does not suggest-and-run a neighbor.
- `mental doctor --json` with real problems has `ok: false` and exit 3.
- `mental list --json` includes `truncated` and `total` when over cap.
- `NO_COLOR=1 mental` has no ANSI.
- `npm test` green. Skill still teaches `--json` and fail-open.

