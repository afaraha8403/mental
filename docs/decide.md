# Decision models

A decision model is optional. Mental works with no key. After you store a key, a model can suggest links, tags, and a ranking. It does not block a write. If the model is down, over budget, or unconfigured, the CLI result stays the one you would have had without it.

The command is `mental option decide`. `mental option jev` is the same command. There is no `mental jev` command. **Jev** is the TypeSafe product name, and the name of the older files (`jev.mjs`, `jev-usage.json`). New copy says decision model.

Agents must not set a key. MCP refuses `option decide` and `option jev` for that reason. Run the commands below in your own terminal.

## Store a key

Keys live in `~/.mental/config.json` (mode `0600`). Mental does not read `MENTAL_JEV_KEY`, `TYPESAFE_API_KEY`, or `MENTAL_JEV_URL`. `key -` reads the key from stdin so it stays out of shell history.

```bash
mental option decide
printf '%s' "$KEY" | mental option decide key - --provider typesafe
mental option decide provider openai
mental option decide key clear --provider typesafe
```

`key <KEY>` also works. Prefer stdin. When no key is set, `mental retag` and `mental extract` name Cloudflare as the free tier.

| Provider | Flag | Default model | Also set |
| --- | --- | --- | --- |
| TypeSafe Jev | `typesafe` | `jev-latest` | Key from [typesafe.ai](https://typesafe.ai) |
| OpenAI Decisions | `openai` | `gpt-6-luna` | Key from the OpenAI API keys page |
| Cloudflare Clef | `cloudflare` | `clef` or `clef-flash` | Key and `account <ID>` |
| Custom | `custom` | Endpoint you set | `url` and a key |

```bash
mental option decide account <ACCOUNT> --provider cloudflare
mental option decide model clef-flash --provider cloudflare
mental option decide url https://example.test/v1 --provider custom
mental option decide fallback openai
mental option decide fallback off
mental option decide budget 20000
mental option decide budget off
```

`mental option decide` prints status and today's token use. It masks the key.

Request timeout defaults to 4 seconds. `MENTAL_JEV_TIMEOUT_MS` overrides it.

## What changes when a key is set

| You run | What the model adds |
| --- | --- |
| `mental search` with zero hits | `data.recovered` from a broader read. `--rank` reorders hits and does not drop any. |
| `journal`, `decide`, `note`, `attention`, `park` | Advisory `data.similar`. The write still lands. |
| `mental show` | `data.suggestedLinks` |
| `mental brief` | Relevance order. `--no-rank` skips it. |
| `mental relink` | A dry run of links (`supports`, `supersedes`, `contradicts`, `depends_on`, or plain `related`). `--apply` appends high-confidence links under `## Related`. |
| `mental retag` | A dry run of one topic tag for untagged files. `--apply` writes the `tags:` line only. |
| `mental extract <file\|->` | Proposed actions, decisions, and concerns. The raw text is not stored. `--apply` needs `--tag`. |
| `mental doctor` | Warn-only checks. `--apply` can write proposed tags and links (`--limit`, default 10). `--offline` skips the model. |

Personal-slice notes are not sent unless you opt in:

```bash
mental option decide personal off
mental option decide personal on
```

`personal on` still redacts obvious credentials before the request.

## Reminders and mute

With no key, heartbeat and a zero-hit search may attach `data.jev` at most once every 3 days per surface. That field is a reminder, not a judgment.

```bash
mental option decide off
```

`MENTAL_NO_HINTS=1` also stops the reminder. `option decide off` mutes the model even when a key is stored. `option decide on` turns it back on.

Spend for every provider shares one ledger: `${XDG_CACHE_HOME:-~/.cache}/mental/jev-usage.json`.

Command row: [CLI reference](./cli.md).
