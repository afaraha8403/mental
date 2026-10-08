# Manifest reference

Source: `https://developers.openai.com/plugins/build/plugins.md`. Confirm against the live page; field sets evolve.

## Portable format: root `plugin.json`

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "acme-notes",
  "version": "1.0.0",
  "description": "Search and edit Acme notes from the desktop app.",
  "author": { "name": "Acme", "email": "dev@acme.example", "url": "https://acme.example" },
  "homepage": "https://acme.example/notes",
  "repository": "https://github.com/acme/acme-notes",
  "license": "MIT",
  "keywords": ["notes"],
  "extensions": {
    "com.openai": {
      "interface": {
        "displayName": "Acme Notes",
        "shortDescription": "Find and edit notes",
        "longDescription": "Search, summarize and edit your Acme notes without leaving the app.",
        "developerName": "Acme",
        "category": "Productivity",
        "capabilities": ["Read", "Write"],
        "websiteURL": "https://acme.example/notes",
        "supportURL": "https://acme.example/support",
        "privacyPolicyURL": "https://acme.example/privacy",
        "termsOfServiceURL": "https://acme.example/terms",
        "defaultPrompt": ["Find my notes about the Q3 launch"],
        "brandColor": "#1F6FEB",
        "composerIcon": "./assets/composer.svg",
        "logo": "./assets/logo.png",
        "screenshots": ["./assets/screenshot-1.png"]
      }
    }
  }
}
```

Core fields: `name` (stable kebab-case identity), `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`.

### `extensions.com.openai`

| Key | Purpose |
| --- | --- |
| `interface` | Listing UI: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt` (array, up to 3), `brandColor`, `brandColorDark`, `composerIcon`, `composerIconDark`, `logo`, `logoDark`, `screenshots`. Asset paths are `./assets/...` |
| `onboardingSkill` | Skill run after install to finish setup |
| `review` | Submission test cases (below) |
| `publication` | `countries`, `release_notes`, `translations` keyed by locale with `subtitle` and `description` |
| `apps` | `./.app.json`. Blocks public submission |
| `hooks` | Explicit hooks path. Blocks public submission |

### `review` block

```json
{
  "extensions": {
    "com.openai": {
      "review": {
        "test_cases": {
          "positive": [
            {
              "description": "Search notes",
              "prompt": "Find my notes about the Q3 launch",
              "tools_triggered": ["search_notes"],
              "expected_behavior": "Returns matching notes with titles and dates"
            }
          ],
          "negative": [
            {
              "description": "Unrelated request",
              "prompt": "What is the weather today?"
            }
          ]
        },
        "demo_recording_url": "https://acme.example/demo.mp4",
        "commerce": false
      }
    }
  }
}
```

Positive cases may add `file_attachment_urls` and `expected_output_url`. Provide 5 positive and 3 negative in real submissions. If `commerce` is true, add `commerce_description`.

## MCP config (portable): `mcp.json`

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "acme-notes": {
      "type": "streamable-http",
      "url": "https://mcp.acme.example/mcp"
    }
  }
}
```

## Codex compat format: `.codex-plugin/plugin.json`

```json
{
  "name": "acme-notes",
  "version": "1.0.0",
  "description": "Search and edit Acme notes.",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Acme Notes",
    "shortDescription": "Find and edit notes",
    "category": "Productivity",
    "logo": "./assets/logo.png"
  }
}
```

`.mcp.json` here is `{ "mcpServers": { "acme-notes": { "url": "https://mcp.acme.example/mcp" } } }` (no `$schema`, no `type`).

## Skills

`skills/<name>/SKILL.md` is auto-discovered. Optional folders per skill: `references/`, `assets/`, `scripts/`, `agents/openai.yaml`. See `codex-desktop-skills`.

## Path rules

Start with `./`, relative to the plugin root, stay inside it. No absolute paths, no `..`.
