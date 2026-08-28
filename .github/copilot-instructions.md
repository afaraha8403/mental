# Release versions (lockstep)

`package.json` `version` is source of truth. Git tag is `v` plus that string. npm must publish that same string. A GitHub Release is not done until `npm view @balacode/mental version` equals it.

Keep in sync with `.cursor/rules/release.mdc`.

## Before tagging

1. `node scripts/bump-version.mjs X.Y.Z` then `node scripts/bump-version.mjs --check`
2. Cut CHANGELOG `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`
3. Commit on `main` (prod) or `staging` (beta `X.Y.Z-beta.N`)
4. Tag **only** `vX.Y.Z` (or `vX.Y.Z-beta.N`). Never a tag that does not equal `package.json`.

## After GitHub Release

`.github/workflows/release.yml` publishes with `secrets.NPM_TOKEN` as `NODE_AUTH_TOKEN`. Watch the `Release` workflow, then:

```bash
npm view @balacode/mental version
```

That output **must** equal `package.json` (no `v`). If publish skipped or failed, the release is not done. Do not cut a new tag to “fix” npm — fix the workflow and `workflow_dispatch` (tag `v$(package.json version)` must already exist).

## Do not

- Ship a git tag whose npm version differs
- Put `version` on `.claude-plugin/marketplace.json` plugin entries
- Print or commit `NPM_TOKEN`
- Use `MENTAL_SKIP_HOST_PLUGIN_CHECK` outside tests
