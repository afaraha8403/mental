# Cross-PC Mental continuity — Part 1 backup / restore

**Playbook:** inception (circuit) + 2026-09-21 human correction  
**Canvas:** `.balakit/plans/cross-pc-session-sync.md`  
**Split:** Part 1 (this plan, now) = portable **backup + restore**. Part 2 = live/sync — parked, not this build.

## Outcome

A person can `mental backup` their whole Mental home into a portable directory, carry it (USB, rsync, AirDrop), and `mental restore` onto another PC. Restore **merges per ProjectSlice**. Work that is ahead on the destination (project B on PC B, project C on PC C) is never overwritten by a backup taken on a machine that is lagging on those projects. Slices the backup is ahead on still land. No Mental cloud. No project-git of the store.

The backup directory is the **portable unit**. Part 2 (later) may reuse that format; it does not ship in this build.

## Two parts (do not mix)

| Part | What | When |
| --- | --- | --- |
| **1. Backup / restore** | CLI packages `HomeStore` OKF + PortableIdentity; restore is a per-slice merge | **Now** |
| **2. Sync** | Ongoing two-way / scheduled / live | `--status later`. Not in these units |

User speech that got cut off (“portable download that could act as…”) is treated as: the Part 1 archive **is** that portable download. If they meant a URL, signed installer, or `mental://` scheme, that is Part 2 / a docs surface — do not invent it here.

## Named data shape

There is still no store object named session. Continuity is OKF in UUID slices.

| Type | Meaning | Cross-PC role |
| --- | --- | --- |
| **ProjectSlice** | `~/.mental/projects/<uuid>/` OKF | Merge unit. Laptop can be ahead on A while desktop is ahead on B |
| **PersonalBundle** | `~/.mental/{journal,decisions,attention,notes}` | In default backup (whole home). Same merge rules |
| **HomeStore** | `bindings.json` + slices + personal | Backup reads it. Default restore **never** wholesale-replaces dest. `--replace --confirm REPLACE` wipes **only slices present in the archive** |
| **Binding** | `{ id, name, origins[], paths[], updatedAt }` | UUID = join key. `paths[]` are this machine only |
| **PortableIdentity** | `{ id, name, origins[] }` | What the archive carries (no absolute paths) |
| **BackupArchive** | Snapshot of **all** slices + personal + identities | Directory **outside** any git worktree. Version 1 |
| **SliceJoin** | Restore result for one uuid | `adopted` \| `merged` \| `skipped-ambiguous` \| `skipped-hours` |
| **RestoreReport** | List of SliceJoins | Partial success is success. One slice must not abort the rest |
| **ConceptClock** | Freshness | OKF frontmatter `timestamp`, else mtime — already `conceptTimeMs` in `bin/lib/delta.mjs:19-30` |

**SoT vs derived (unchanged):** OKF in; FTS sqlite and `*.pulse.json` out; `status/` out; `time.sqlite` out of default backup; `config.json` out (host option flags stay per-machine).

## Merge law (the product)

Restore runs **on the destination**. The backup is a **hint of what the source knew**, not a wipe.

For each PortableIdentity / slice in the archive:

1. **Unknown uuid, origin unique or empty** → **adopt**: insert binding (`paths: []` until a later write in a matching clone fills it), copy OKF. First later write on a clone of that origin reuses this uuid (`resolveOrCreateBinding`). Do not write `.mental-id` into foreign absolute paths (they were stripped).
2. **Unknown uuid, origin already bound to a different id** → **skipped-ambiguous** for **this slice only**. Dest slice stays. Other slices in the same restore continue. TTY + JSON name both ids and say `mental remap --to` if the human really wants the backup brain.
3. **Uuid already on dest** → **merge** (never `cpSync force` of the tree, never delete dest-only files):

Per dest path vs pack path:

| Dest | Pack | Action |
| --- | --- | --- |
| missing | present | Copy pack file in |
| present | missing | Keep dest |
| both, different identity (path) | — | Keep both (union of filenames) |
| both, same journal file | — | **Union hops** by `## HH:MM` heading. Hop only in pack → append. Hop only in dest → keep. Same heading, different body → **keep both**: dest hop stays; pack hop is appended as `## HH:MM — Title (from backup)`. Second restore of the same body must not add a third hop |
| both, same decision/attention/note file | — | Compare `conceptTimeMs`. Pack newer → replace dest file. Dest newer or equal → keep dest. Never delete dest |

**Why file-level LWW plus journal hop-union:** Ali’s picture is **disjoint project work** (A on laptop, B on desktop, C on the third box). A backup from the laptop is ahead on A and **behind** on B and C. Dest-newer files on B/C stay. Pack-newer files for A land. Same-day journals on the same project still union hops so a stale backup cannot drop a dest hop. Same heading + different body is rare; Ali picked **keep both, rename the incoming hop** so neither machine silently loses text.

**`--replace --confirm REPLACE` (v1, disaster only):** for each slice **in the archive**, dest OKF for that uuid is replaced by the backup (delete dest files not in the pack for that slice). Slices that exist only on dest are **not** deleted. Personal: replaced iff the archive includes personal. Missing `--confirm REPLACE` is usage (same pattern as `uninstall --delete-data --confirm DELETE`). Default `mental restore --from` stays merge.

**Whole-archive abort is forbidden.** Restore of laptop-A backup onto B must still adopt/merge A even if C is `skipped-ambiguous`.

`copyOkfTree` (`bin/lib/okf.mjs:839-855`) is the wrong primitive (`force: true`). Restore needs a new `mergeOkfTree` (or equivalent) that implements the table. Leftover ingest dest-skip-existing (`import-legacy.mjs:122-124`) is also wrong: dest-skip would **refuse** to land laptop-A’s newer files for project A if dest already had a stale copy.

## Units

Do not implement from this hop. Part 2 is not a unit.

### 1. Vocabulary — `docs/identity.md`, `docs/why.md`, `docs/cli.md`, `README.md` FAQ

“Two PCs” = backup then restore. Merge, not replace. Live Dropbox of `~/.mental` unsupported. No store type named session. Command names **`backup` / `restore`** (not `sync`; not `pack`/`unpack` — those collide with “one slice” and with `local --import`). `export` is taken by `mental track export`.

**Done when:** FAQ answers “laptop + desktop” with backup/restore + “will not overwrite newer work on this PC.”

### 2. Archive format — `bin/lib/backup.mjs` (new)

```js
/** @typedef {{ version: 1, packedAt: string, personal: PackedFiles | null, slices: PackedSlice[] }} BackupArchive */
/** @typedef {{ identity: { id: string, name: string, origins: string[] }, files: Record<string, string> }} PackedSlice */
```

- `version !== 1` → throw (same as `BINDINGS_VERSION`).
- Default: **every** binding’s slice + personal OKF. No `--id` required. Optional later `--id` is a filter, not the default.
- Strip `paths[]`, `store`, legacy import fields.
- Files: `journal/`, `decisions/`, `attention/`, `notes/` only.
- `--out <dir>` required. Refuse git worktree (reuse `assertExportOutPath` in `bin/lib/time.mjs:1379-1391`). Directory tree, stdlib only; user may zip.
- Unbound `id: null` is **not** usage if other slices exist: backup is home-wide, not cwd-slice-only. Empty home (no bindings, no personal OKF) is usage.

**Done when:** `test/backup.test.mjs` two slices in one `tempHome()`, `backup --out`, archive has **both** uuids, **no** absolute paths, **no** sqlite, **no** `status/`.

### 3. `mental backup` — `bin/lib/catalog.mjs`, `bin/cli.mjs`, `bin/commands/backup.mjs`

Identity group.

```text
mental backup --out <dir>
```

`--json`: `{ out, slices: [{ id, files }], personal: boolean }`. Not MCP in v1.

**Done when:** catalog lists `backup`; missing `--out` → usage exit 2; `--out` inside the test repo → usage.

### 4. `mergeOkfTree` + `mental restore` — `bin/lib/okf.mjs` or `bin/lib/restore.mjs`, `bin/commands/restore.mjs`, `bin/lib/bindings.mjs`

```text
mental restore --from <dir>
mental restore --from <dir> --replace --confirm REPLACE
```

Apply Merge law unless `--replace --confirm REPLACE`. JSON: `RestoreReport` (`adopted` \| `merged` \| `replaced` \| `skipped-ambiguous` \| `skipped-hours`). Exit 0 if at least one slice adopted/merged/replaced **or** dest already matched (idempotent). Exit 2 only for missing archive / bad version / `--replace` without confirm. `skipped-ambiguous` is a **row**, not a fatal. `--replace` does not skip ambiguous: it still refuses to point a dest uuid at a different packed id for the same origin (remap is the human verb). Rebuild FTS per touched uuid (`reindex`). Hours skipped. Personal is in the default archive and uses the same merge (or replace) table.

**Done when:** `test/backup.test.mjs` (three HOMEs):

1. **Adopt.** Empty B, restore A’s backup → B has A’s uuid + journal hop.
2. **Dest-ahead protected.** B journals project B after a first restore; A’s **older** backup restored again → B’s newer hop still in dest; A’s other slice still updates if pack is ahead.
3. **Pack-ahead lands.** A journals project A after B’s copy is stale; restore A → A’s new hop present on B; B’s dest-only hop on project B still present.
4. **Partial.** B minted a **different** uuid for the same origin as one packed slice → that row `skipped-ambiguous`, **other** packed slices still merge. Dest’s extra uuid files still on disk.
5. **Glance.** `where` on B before any write still does not mint; after restore, origin match on a clone uses the restored uuid.
6. **Hop keep-both.** Same `## HH:MM` different bodies → dest heading unchanged; pack hop present as `(from backup)`; second restore does not add a third hop.
7. **Replace.** `--replace --confirm REPLACE` on a dest-ahead slice → dest-only hop for that packed uuid is gone; a dest-only **other** uuid still exists. `--replace` without confirm → usage, dest unchanged.

### 5. Doctor — `bin/commands/doctor.mjs`

Warn-only `bindings-conflict` for Syncthing/Dropbox conflict copies. Message: use backup/restore; live folder sync unsupported. Do not delete WAL.

**Done when:** conflicted filename fixture warns; clean `tempHome` does not.

### 6. Skill / rule — `skill/mental/SKILL.md`, `rules/mental.mdc`

Agents: do not invent cloud, do not `git add` `.mental`, do not Syncthing `~/.mental`. Cross-PC Part 1 = `mental backup --out` / `mental restore --from`. Never put the archive in the repo.

**Done when:** install fixture skill text matches; existing skill-catalog tests pass.

### 7. Changelog + CLI docs — `CHANGELOG.md` `[Unreleased]` Features; `docs/cli.md`; `docs/identity.md` command table

**Done when:** lockstep check still passes (no version bump until release). One human-centric Features line.

## Out of scope

- **Part 2 sync** (live, scheduled, two-way daemon, command named `mental sync`).
- Mental-hosted SaaS / `mental://` download URL / signed installer.
- CRDT / 3-way merge of the **same hop body** (keep both; rename incoming).
- Packing FTS, pulse watermarks, `status/`, `config.json`, default `time.sqlite`.
- Committing `./.mental` to a git remote.
- Chat transcripts.
- `MENTAL_DIR` as the official two-PC product.
- MCP tools for backup/restore in v1.
- Overlay personal + project in heartbeat (exclusive bundle stays).
- Default restore wiping dest (only `--replace --confirm REPLACE`, and only slices in the archive).
- Writing `.mental-id` to another machine’s leftover absolute paths.

## Open questions

**Resolved 2026-09-21 (Ali):**

1. Same journal heading, different body → **keep both**; dest heading stays; incoming renamed `(from backup)`. Idempotent on re-restore.
2. Personal OKF → **in default backup**; same merge/replace table as slices.
3. Disaster wipe → **v1 ships** `restore --replace --confirm REPLACE` (packed slices only). Default restore stays merge.
4. Easy locks → directory (user zips); no `--id` in v1; no hours in backup; no `pack`/`unpack` aliases.

None blocking.

## Verification

Prove on the CLI with **three** `tempHome()` fixtures (`test/helpers.mjs`), not a mock of `copyOkfTree`.

| Unit | Real path | Safety fact |
| --- | --- | --- |
| 2 Format | inspect `--out` | All slices; no `paths[]`; no sqlite |
| 3 `backup` | `--out` in repo | Usage; nothing written in worktree |
| 4 dest-ahead | B newer on slice B, restore old A backup | B hop remains |
| 4 pack-ahead | A newer on slice A, restore onto B | A hop appears; B hop remains |
| 4 hop keep-both | same heading, different bodies | dest hop + `(from backup)` hop; restore twice stays two |
| 4 replace | dest-ahead slice + `--replace --confirm REPLACE` | that slice wiped to pack; other dest uuid kept |
| 4 partial | ambiguous origin on one slice | Other slices merge; dest uuid files kept |
| 4 glance | before write | No extra uuid minted |
| 5 Doctor | conflicted bindings name | Warn only |
| 6 Skill | installed text | backup/restore; no “sync ~/.mental” |

Until execute runs those tests: **unproven**.

Named safety facts (prove in execute, not here):

1. Restore must not wipe a dest journal hop whose heading is absent from the backup.
2. Restore must not skip a pack file whose `conceptTimeMs` is newer than dest (project A on the laptop).
3. Same heading + different body must keep dest hop and add one `(from backup)` hop; a second restore must not add a third.
4. `--replace` without `--confirm REPLACE` must not mutate dest.
5. `--replace --confirm REPLACE` must not delete dest uuids that are absent from the archive.
6. One `skipped-ambiguous` slice must not roll back other slices already merged in that run.
7. `--out` / archive must stay outside the git worktree.
8. `time.sqlite` stays untracked.

## Fork record

Part 1 vs Part 2 is a **sequence**, not a fork. Part 1 is backup/restore with per-slice merge. Live folder-sync, `MENTAL_DIR`-as-product, git-tracked `.mental`, and cloud stay rejected for Part 1 (same evidence as the 2026-09-21 circuit shortlist).

`--replace` is in v1, default off, confirm required. Overturn dest-ahead **default** only if Ali later wants merge to wipe without the flag.

## Specialist log

Unchanged from inception except this correction: default archive is **whole home**, not cwd slice; merge law replaces dest-skip-existing; command names `backup`/`restore`; Part 2 parked.

## Resume

Do **not** `/execute` Part 2. When building Part 1: first failing test in `test/backup.test.mjs` (three HOMEs, dest-ahead + pack-ahead), then `bin/lib/backup.mjs` + `mergeOkfTree`. Do not start with doctor or docs.

## PACE_LOG

- Human override: pack/unpack cwd-slice → **backup/restore whole home**
- Human override: dest-skip-existing → **per-slice merge, dest-ahead kept, pack-ahead lands**
- Human override: fatal `ambiguous-origin` → **per-slice skip, rest of restore continues**
- Part 2 sync → later (not a unit)
- Human override: hop conflict dest-wins → **keep both, rename incoming `(from backup)`**
- Human override: `--replace --confirm REPLACE` **in v1** (packed slices only)
- Human override: personal in default backup; directory; no `--id`/hours/`pack` aliases
