# Mental CLI identity

Mental CLI identity is a UUID in `~/.mental/bindings.json`. Origin is a hint (SSH ≡ HTTPS). The folder path is not the id. `mental where` reports the active bundle and does **not** create a UUID. First write (`status`, `journal`, `install`, …) does.

Two clones of the same origin share one brain until you split.

## Commands

| Situation | Command |
| --- | --- |
| This clone should use an existing UUID | `mental remap --to <uuid>` (or `mental link --to <uuid>`) |
| This clone should diverge | `mental split` (`--copy` keeps OKF files) |
| List bindings | `mental remap` |
| Opt in to `./.mental` in this repo | `mental doctor --fix-ignore` then `mental local` |
| Copy home slice into `./.mental` | `mental local --import` |
| Same, and mark store=local | `mental local --move` |

## How a bundle is chosen

1. `MENTAL_DIR` (or `--dir`) if it is a directory → mode `env`
2. Walk-up `./.mental/` **with** the `.mental-local` marker → mode `local`
3. Git repo → `~/.mental/projects/<uuid>/` → mode `home`
4. Not a git repo → `~/.mental` → mode `personal`

Exclusive: never concatenate personal + project trees in `status` / `search`.

Origin matching treats `git@github.com:org/repo` and `https://github.com/org/repo.git` as the same hint. A fork (new origin, `upstream` matches an old origin) does **not** inherit silently — remap or split. A git worktree shares the main worktree’s UUID. A monorepo binds the git root, not `packages/foo`.

## Leftover project `.mental/`

Leftover Balakit `./.mental` (no `.mental-local` marker) is ingested into `~/.mental/projects/<uuid>/` on the first **write**. Files are classified onto canonical OKF paths and frontmatter is normalized. The leftover folder is not deleted. After import, `where` reports **home** unless you ran `mental local`.

## Privacy

- Default store: `~/.mental/` (never commit)
- Project `.mental/` is opt-in and must be gitignored (`mental doctor --fix-ignore`)
- Agents must not edit `.gitignore`
- Never store secrets, tokens, or private keys in Mental files
- Uninstall does not delete OKF unless you type `DELETE`

## On-disk shape

```text
~/.mental/
  bindings.json
  projects/<uuid>/
    journal/YYYY-MM-DD.md
    decisions/
    attention/
    notes/
    status/current.md
```

Cache (rebuildable, never SoT):

```text
${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.sqlite
```
