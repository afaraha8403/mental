# `agents/openai.yaml` and activation testing

Source: `https://developers.openai.com/plugins/build/skills.md`. Confirm field names against the live page.

## `agents/openai.yaml`

Declares MCP tools the skill depends on, so the app can prompt to install or connect them.

```yaml
dependencies:
  tools:
    - type: mcp
      value: acme-notes
      description: Search and edit Acme notes
      transport: streamable_http
      url: https://mcp.acme.example/mcp
```

Keys: `type: mcp`, `value` (server name), `transport`, `url`. Keep it in sync with the plugin's MCP config. Omit the file when no tools are needed.

## Activation test matrix

For each skill write at least one prompt per row, run in a fresh chat, and record whether the skill triggered and behaved.

| Kind | Example for a "release notes" skill | Expected |
| --- | --- | --- |
| Direct | "Use the release-notes skill to draft v2.1 notes" | Triggers |
| Indirect | "Summarize what changed since the last tag for customers" | Triggers |
| Incomplete | "Write release notes" (no range) | Triggers, then asks for the missing range |
| Negative | "Explain how git tags work" | Does not trigger |
| Edge | Very large diff, empty diff, non-English request | Degrades gracefully |

## Fixing misses

- Did not trigger on an indirect prompt: add the user's phrasing and synonyms to `description`.
- Triggered on a negative prompt: add a "Not for ..." clause, narrow the scope.
- Triggered but followed the wrong steps: shorten and de-conflict the body; move detail to `references/`.
- Stops early or over-asks: define defaults and when to ask.

## Review for conflicts

Search the body for contradictory directives (always/never, ask/don't ask) and stale references. For GPT-6 Astra, which follows instructions literally, resolve every conflict and add: "Explicit user instructions override this skill."

## Creators

- Work mode: `@skill-creator`
- Codex: `$skill-creator`

Use them to scaffold, then edit by hand against the checklist in `SKILL.md`.
