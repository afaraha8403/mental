# Claude Code marketplace and Anthropic directory

Sources: `https://code.claude.com/docs/en/plugins/publish`, `.../plugin-marketplaces`.

## Mental's own marketplace (already live)

`.claude-plugin/marketplace.json` has `name: "mental"`, an `owner`, and one plugin entry (`name: "mental"`, `source: "./"`). The entry name must equal the manifest name in `.claude-plugin/plugin.json` or installs fail with "not found". There is no `version` on the entry; `plugin.json` carries it.

Publishing through this route needs no form: pushing the repo is publishing.

Users:

```text
claude plugin marketplace add afaraha8403/mental
claude plugin install mental@mental
```

## Before each release

```text
claude plugin validate --strict .
```

A clean run prints `Validation passed`. Strict also fails on warnings such as a missing `version`. If `version` is set in `plugin.json` and not bumped, `claude plugin update` says "already at the latest version" and users keep the old copy; lockstep keeps this safe.

## Anthropic directory (optional)

- Catalog on claude.ai and Cowork; one listing also reaches Claude Code through account sync (`<name>@synced`).
- Submit from the developer portal at `https://claude.ai/directory/manage` (walkthrough at `https://claude.com/docs/plugins/submit`).
- Requires a paid claude.ai plan (Pro/Max from own account; Team/Enterprise via an Owner or a role with the Directory permission) and a GitHub repository holding the plugin.
- The portal applies extra rules the CLI does not check, so a clean local validate does not guarantee a clean submission. Run the pre-submission checklist at `https://claude.com/docs/plugins/pre-submission-checklist`.
- Check which components load outside Claude Code at `https://claude.com/docs/plugins/platform-support`. Mental's hooks and CLI are Claude Code-only concerns.
- `claude-plugins-official` does not take portal submissions; that route is through an Anthropic partner contact.
- Updates to a listing go through the portal's update flow, not just a push.

## Renames and tags

Never rename the plugin; installs are recorded by name. Use a `renames` map in the marketplace file if unavoidable. `claude plugin tag` creates `{name}--v{version}` tags and is needed only when other plugins declare version ranges on Mental.
