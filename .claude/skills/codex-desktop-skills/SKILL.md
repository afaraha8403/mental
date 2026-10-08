---
name: codex-desktop-skills
description: >-
  Author Agent Skills for the ChatGPT desktop app (formerly the Codex app):
  SKILL.md frontmatter, trigger-rich descriptions, references/assets/scripts
  layout, agents/openai.yaml MCP tool dependencies, @skill-creator, and
  activation testing with direct, indirect, incomplete, negative and edge-case
  prompts. Use when the user wants to write, fix or test a skill that runs in
  the ChatGPT or Codex desktop app, including one bundled in a plugin.
license: MIT
compatibility: Works in the ChatGPT desktop app (Chat and Work modes) and Codex. Skills may be standalone or bundled in a plugin under skills/<name>/. Optional agents/openai.yaml declares MCP tool dependencies.
metadata:
  author: Ali Farahat
  tags: chatgpt-desktop,codex,skills,agent-skills,activation
  verified-against: developers.openai.com/plugins/build/skills
when_to_use: |
  USE WHEN:
  - The user wants to write, review, fix or test a SKILL.md for the ChatGPT or
    Codex desktop app, or asks why a skill does not trigger.
  - They mention agents/openai.yaml, @skill-creator, $skill-creator or skill
    activation in the desktop app.

  DO NOT USE WHEN:
  - The task is the plugin manifest or distribution: use codex-desktop-plugins.
  - The task is UI via MCP Apps: use codex-desktop-extensions.
  - The target is Claude Desktop skills: use the claude-desktop-* skills.
---

# ChatGPT / Codex desktop skills

A skill is a folder with a `SKILL.md`. The app reads only `name` and `description` up front and loads the body when the task matches, so **the description decides whether the skill ever runs**. Source (re-check): `https://developers.openai.com/plugins/build/skills.md`.

## Layout

```text
my-skill/
  SKILL.md             required: name + description, then instructions
  references/          long docs loaded on demand
  assets/              templates, sample files
  scripts/             deterministic helpers
  agents/openai.yaml   optional: MCP tool dependencies
```

Inside a plugin the folder is `skills/<name>/` and is auto-discovered (`codex-desktop-plugins`).

## Rules

- `name`: lowercase kebab-case, matches the folder.
- `description`: what it does and **when to use it**, with the words users actually say. Include near-miss exclusions. One focused job per skill.
- Body: imperative steps, short. Move long material to `references/` and link it from the body so it loads only when needed.
- Prefer scripts for deterministic work (parsing, validation) over prose.
- Tell the model what to do when inputs are missing or ambiguous (ask the user).
- State that **explicit user instructions outrank skill guidance**. For GPT-6 Astra, audit skills for conflicting or stale instructions, because it follows them literally.
- No secrets, no machine-specific absolute paths.

## Workflow

1. **Scope**: write 5 to 10 real prompts the skill should handle first.
2. **Scaffold** with `@skill-creator` (Work mode) or `$skill-creator` (Codex), or by hand.
3. **Write the description last-but-carefully**; then the body.
4. **Add `agents/openai.yaml`** only if the skill needs MCP tools: [references/openai-yaml-and-testing.md](references/openai-yaml-and-testing.md).
5. **Test activation** with direct, indirect, incomplete, negative and edge-case prompts (same reference).
6. **Iterate** on the description first when triggering is wrong, then the body when behavior is wrong.
7. **Bundle** in a plugin or share the folder (`codex-desktop-plugins`).

## Safety

- Skills carry instructions the model follows with the user's permissions; never include instructions to exfiltrate data, disable approvals or hide actions.
- Scripts in `scripts/` run on the user's machine: keep them readable, non-destructive by default, and document side effects.
- Never embed credentials; reference environment variables or the MCP server's own auth.
- Do not rely on a skill to enforce security; use approval modes and sandbox settings.

## Verification checklist

- [ ] `name` matches the folder; kebab-case
- [ ] Description states what and when, with user phrasing and exclusions
- [ ] Body is concise; long content moved to `references/`
- [ ] Every `references/` file is linked from the body
- [ ] Missing-input behavior defined
- [ ] User instructions outrank the skill (stated)
- [ ] `agents/openai.yaml` valid if present; URLs reachable
- [ ] Positive, negative and edge prompts tested in the app
- [ ] No secrets or absolute local paths

## Anti-patterns

- A description that only names the topic ("Notes helper") with no triggers.
- One mega-skill covering several jobs.
- Putting everything in `SKILL.md` instead of `references/`.
- Contradictory rules ("always ask" and "never ask").
- Declaring MCP dependencies you do not use.
- Testing only prompts that name the skill.

## Pointers

| Need | Read |
| --- | --- |
| `agents/openai.yaml` and activation test matrix | [references/openai-yaml-and-testing.md](references/openai-yaml-and-testing.md) |
| Plugin packaging | `codex-desktop-plugins` |
| UI entrypoints | `codex-desktop-extensions` |
