# Dashboard

`mental dashboard` opens a read-only page on your own machine. It shows the same journal, attention, and decisions as the CLI. It does not write them.

Default address: `http://127.0.0.1:3847/`. The process stays in the foreground until you press Ctrl-C.

```bash
mental dashboard
mental dashboard --no-open
mental dashboard --port 3848 --no-open
mental dashboard --idle-exit 30
```

| Flag | What it does |
| --- | --- |
| `--port` | Port on `127.0.0.1`. Default `3847`. |
| `--no-open` | Print the URL. Do not open a browser. |
| `--idle-exit` | Exit after this many minutes with no requests. Use this for a detached launch. |

If `3847` is busy and you did not pass `--port`, Mental picks an ephemeral port and prints it. If you pass `--port` and that port is busy, Mental exits with an error. Free the port, or pass `--port 0` for an ephemeral port.

## Views

One server covers every project. The page selects a project with `?p=` in the hash. The letter after `g` switches view.

| View | Hash | Keys | What you see |
| --- | --- | --- | --- |
| Today | `#/today` | `g` then `t` | Where you left off |
| Attention | `#/attention` | `g` then `a` | Open residue |
| Library | `#/library` | `g` then `l` | Journals, decisions, notes |
| Decisions | `#/decisions` | `g` then `d` | Decisions |
| Map | `#/map` | `g` then `m` | How files link |
| Sit-downs | `#/sitdowns` | `g` then `s` | Time tracking, only when track is on |
| All projects | `#/projects` | `g` then `p` | Every bound project |

Sit-downs is hidden until you run `mental option track on`. See [Time tracking](./track.md).

## Read only

The server accepts GET and HEAD. Any other method gets `405`. It binds `127.0.0.1` and `::1`. It refuses a `Host` that is not loopback. It does not send CORS headers.

Attention actions that look like a resolve copy a CLI command, for example `mental attention --title … --status resolved --via dashboard --json`. Paste that into a terminal. The page does not POST a write.

While the server runs, it records `{ port, pid, url, startedAt }` in `~/.mental/dashboard.json`. The Claude panel and the Cursor sidebar read that file to find the port.

## Embed and the sample on the site

`?embed=1` hides the outer chrome. The Cursor sidebar uses it. The sample on [getmental.dev](https://getmental.dev/demo/index.html#/today) is a fixture of the same UI. It is not your files.

Agents still use `mental … --json`. The dashboard is for you.

Command row: [CLI reference](./cli.md). Host panels that open this page: [Host UIs](./hosts.md).
