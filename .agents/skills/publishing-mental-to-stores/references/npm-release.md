# npm and the GitHub release

Source of truth: `.github/workflows/release.yml`, `bin/lib/lockstep.mjs`, `scripts/bump-version.mjs`. The package is `@balacode/mental` (the unscoped `mental` is a different project). Node 22.13 or newer, zero runtime dependencies, binary `mental`.

## Steps

```text
node scripts/bump-version.mjs X.Y.Z
node scripts/bump-version.mjs --check
```

1. Edit `CHANGELOG.md`: move `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`.
2. Commit on `main` (production) or `staging` (beta, version `X.Y.Z-beta.N`).
3. With the user's confirmation, create the release. Tag `vX.Y.Z` exactly; for betas add `--prerelease`.

```text
gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes-file <notes>
```

4. Watch the workflow:

```text
gh run list --workflow Release --limit 3
gh run watch <run-id>
```

5. Verify:

```text
npm view @balacode/mental version
npm view @balacode/mental dist-tags
```

The first must equal `package.json`. For a prerelease, the version appears under the `beta` dist-tag, not `latest`.

## What `release.yml` does

- Triggers: `release: published` and `workflow_dispatch`.
- `test` job: ubuntu, macos, windows on Node 24; `npm ci`, `npm test`, `npm run check:install`.
- `publish` job (needs `test`): `npm ci`, tests again, then
  - on a release event, checks tag equals `v` plus the package version;
  - on dispatch, checks that tag `v${version}` exists;
  - runs `node scripts/bump-version.mjs --check`;
  - skips if `name@version` is already on npm;
  - runs `npm publish --access public --tag beta` for prereleases, otherwise `npm publish --access public`, with `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`.

## Failure playbook

| Symptom | Fix |
| --- | --- |
| Tag differs from `package.json` | Do not publish. Delete the bad release and tag only with the user's approval, correct the files, and release again under the right version. |
| `bump-version --check` fails | Run `node scripts/bump-version.mjs <package.json version>`; commit. |
| Publish skipped, npm still old | Confirm the version really is on npm. If not, fix the cause and `workflow_dispatch` against the existing tag. |
| `E401` or `E403` | The `NPM_TOKEN` secret is missing, expired or lacks publish rights to the `@balacode` scope. Ask the owner to rotate it in repository secrets. Never print it. |
| Tests fail on one OS | Fix forward on the branch; re-run the workflow. |

`npm test` carries known pre-existing failures on a clean baseline; compare against baseline, not zero.
