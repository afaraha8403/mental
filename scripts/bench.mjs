#!/usr/bin/env node
/**
 * Reproducible Mental micro-benchmarks.
 *
 * Measures the same surfaces agents and humans actually call: process-spawned
 * `mental … --json`, plus in-process heartbeat/search so you can see what
 * Node startup costs versus the work itself.
 *
 * Usage: node scripts/bench.mjs
 *        node scripts/bench.mjs --json
 *        node scripts/bench.mjs --sizes 100,500,2000 --iters 21
 *
 * This script never writes into ~/.mental. Everything lives under a temp HOME.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { collectHeartbeat } from "../bin/lib/heartbeat.mjs";
import { searchBundle, reindexBundle, indexPath } from "../bin/lib/index.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { VERSION } from "../bin/lib/pkg.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = { json: false, sizes: [100, 500, 2000], iters: 21, warmup: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--sizes") out.sizes = String(argv[++i] || "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    else if (a === "--iters") out.iters = Math.max(5, Number(argv[++i]) || 21);
    else if (a === "--warmup") out.warmup = Math.max(0, Number(argv[++i]) || 0);
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    samples: sorted.length,
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length ? sum / sorted.length : 0,
  };
}

function fmt(ms) {
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

function gitEnv(home) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Mental Bench",
    GIT_AUTHOR_EMAIL: "mental@bench.local",
    GIT_COMMITTER_NAME: "Mental Bench",
    GIT_COMMITTER_EMAIL: "mental@bench.local",
    MENTAL_SKIP_UPDATE_CHECK: "1",
    npm_config_update_notifier: "false",
  };
}

function git(cwd, args, env) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
}

function mental(home, cwd, args, env) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd, env });
}

function timeMs(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function measure(iters, warmup, fn) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = [];
  for (let i = 0; i < iters; i++) samples.push(timeMs(fn));
  return stats(samples);
}

function probeSqlite() {
  try {
    const mod = require("node:sqlite");
    const DatabaseSync = mod.DatabaseSync;
    if (!DatabaseSync) return { available: false, fts5: false };
    const db = new DatabaseSync(":memory:");
    let fts5 = false;
    try {
      db.exec("CREATE VIRTUAL TABLE t USING fts5(x)");
      fts5 = true;
    } catch {
      fts5 = false;
    }
    db.close();
    return { available: true, fts5 };
  } catch {
    return { available: false, fts5: false };
  }
}

function writeConcept(bundle, rel, data, body) {
  const abs = join(bundle, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function seedNotes(bundle, n) {
  for (let i = 0; i < n; i++) {
    const hit = i % 17 === 0;
    writeConcept(
      bundle,
      `notes/pad-${String(i).padStart(5, "0")}.md`,
      { type: "Note", title: hit ? `Needleword note ${i}` : `Pad ${i}`, status: "active", tags: ["bench"] },
      hit
        ? `This note mentions needleword once in a short body (${i}).\n`
        : `Padding document ${i}. lorem ipsum dolor sit amet. no signal here.\n`,
    );
  }
}

function initWorkspace(home) {
  const env = gitEnv(home);
  const root = join(home, "work", "repo");
  mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"], env);
  git(root, ["config", "user.email", "mental@bench.local"], env);
  git(root, ["config", "user.name", "Mental Bench"], env);
  writeFileSync(join(root, "README.md"), "# bench\n");
  writeFileSync(join(root, "PLAN.md"), "# plan\nNext: ship the pointer.\n");
  git(root, ["add", "README.md", "PLAN.md"], env);
  git(root, ["commit", "-m", "init"], env);
  git(root, ["remote", "add", "origin", "git@github.com:afaraha8403/mental-bench.git"], env);
  return { root, env };
}

function seedContinuity(home, root, env) {
  const journal = mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Resolver landed",
    "--body",
    "UUID bindings survive a repo move. Evidence is in identity tests.",
    "--resume",
    "Ship the pointer, not the dump — open loops: none",
    "--against",
    "PLAN.md",
  ], env);
  if (journal.status !== 0) throw new Error(journal.stderr || journal.stdout);
  const wrote = JSON.parse(journal.stdout);
  if (!wrote.ok) throw new Error(JSON.stringify(wrote));
  const bundle = wrote.data.root;
  const id = wrote.data.id;

  mental(home, root, [
    "decide",
    "--json",
    "--title",
    "Heartbeat only, no standing TUI",
    "--status",
    "open",
    "--body",
    "A pulse, then exit. Agents re-call heartbeat --json.",
  ], env);
  mental(home, root, [
    "attention",
    "--json",
    "--title",
    "Tom said ship the pointer",
    "--kind",
    "direction",
    "--from",
    "Tom",
    "--body",
    "Do not ingest the meeting dump.",
  ], env);
  return { bundle, id, indexed: wrote.data.indexed ?? null };
}

function runSuite(opts) {
  const sqlite = probeSqlite();
  const home = mkdtempSync(join(tmpdir(), "mental-bench-"));
  const started = new Date().toISOString();
  try {
    const { root, env } = initWorkspace(home);
    const { bundle, id, indexed } = seedContinuity(home, root, env);

    const ctx = { cwd: root, home, env, dir: null };
    const rows = [];

    rows.push({
      name: "node spawn",
      surface: "process",
      notes: 0,
      ...measure(opts.iters, opts.warmup, () => {
        const r = spawnSync(process.execPath, ["-e", "0"], { encoding: "utf8", env });
        if (r.status !== 0) throw new Error("node spawn failed");
      }),
    });

    const cliJobs = [
      ["mental where --json", ["where", "--json"]],
      ["mental heartbeat --json", ["heartbeat", "--json"]],
      ["mental status --json", ["status", "--json"]],
      ["mental list --type Decision --json", ["list", "--json", "--type", "Decision"]],
    ];
    for (const [name, args] of cliJobs) {
      rows.push({
        name,
        surface: "cli",
        notes: 0,
        ...measure(opts.iters, opts.warmup, () => {
          const r = mental(home, root, args, env);
          if (r.status !== 0) throw new Error(`${name} failed: ${r.stderr || r.stdout}`);
        }),
      });
    }

    rows.push({
      name: "collectHeartbeat (in-process)",
      surface: "in-process",
      notes: 0,
      ...measure(opts.iters, opts.warmup, () => {
        const r = collectHeartbeat(ctx);
        if (!r.ok) throw new Error(r.error?.message || "heartbeat failed");
      }),
    });

    const searchSizes = [];
    for (const n of opts.sizes) {
      seedNotes(bundle, n);
      const re = reindexBundle({ root: bundle, id, home, env });
      const q = "needleword";
      const cliSearch = measure(opts.iters, opts.warmup, () => {
        const r = mental(home, root, ["search", "--json", q, "--type", "Note"], env);
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
      });
      const ipSearch = measure(opts.iters, opts.warmup, () => {
        const r = searchBundle({ root: bundle, id, home, env, q, type: "Note" });
        if (!r.hits) throw new Error("search returned no hits field");
      });
      const probe = searchBundle({ root: bundle, id, home, env, q, type: "Note" });
      searchSizes.push({
        concepts: n,
        backend: probe.backend,
        hits: probe.hits.length,
        reindex: re,
        cli: cliSearch,
        inProcess: ipSearch,
      });
      rows.push({ name: `mental search --json (${n} notes)`, surface: "cli", notes: n, ...cliSearch });
      rows.push({ name: `searchBundle (${n} notes)`, surface: "in-process", notes: n, ...ipSearch });
    }

    const commit = spawnSync("git", ["-C", fileURLToPath(new URL("..", import.meta.url)), "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    });

    return {
      ok: true,
      product: { name: "@balacode/mental", version: VERSION, commit: (commit.stdout || "").trim() || null },
      when: started,
      host: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: require("node:os").cpus()?.length ?? null,
      },
      sqlite,
      index: {
        path: indexPath(home, id, env),
        backend: indexed?.backend ?? (sqlite.fts5 ? "sqlite" : "scan"),
        fts5: sqlite.fts5,
        lastWrite: indexed,
      },
      search: searchSizes,
      rows,
      method: {
        iters: opts.iters,
        warmup: opts.warmup,
        sizes: opts.sizes,
        notes:
          "Each CLI row is a fresh Node process (how humans and agents invoke mental). In-process rows import the same functions MCP uses after mental serve. Search --type Note is applied before the result cap. Temp HOME; no writes to ~/.mental.",
      },
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function markdown(report) {
  const lines = [];
  lines.push(`# Mental benchmarks`);
  lines.push("");
  lines.push(
    `Measured ${report.when} on Node ${report.host.node} (${report.host.platform}/${report.host.arch}, ${report.host.cpus} CPUs). Mental ${report.product.version}${report.product.commit ? ` @ ${report.product.commit}` : ""}.`,
  );
  lines.push("");
  lines.push(
    report.sqlite.fts5
      ? "Index backend: **SQLite FTS5** (`node:sqlite`, bm25 ranking)."
      : report.sqlite.available
        ? "Index backend: **SQLite LIKE** (`node:sqlite` is present; this Node build has no FTS5 module). Title matches rank above body matches."
        : "Index backend: **markdown scan** (`node:sqlite` unavailable). Title matches rank above body matches.",
  );
  lines.push("");
  lines.push(`Each number is the **p50** of ${report.method.iters} runs after ${report.method.warmup} warmup runs. p95 is in parentheses.`);
  lines.push("");
  lines.push("| Surface | p50 (p95) | What it measures |");
  lines.push("| --- | ---: | --- |");
  for (const row of report.rows) {
    const extra = row.notes ? `, ${row.notes} notes` : "";
    lines.push(`| \`${row.name}\` | ${fmt(row.p50)} (${fmt(row.p95)}) | ${row.surface}${extra} |`);
  }
  lines.push("");
  lines.push("## Search at size");
  lines.push("");
  lines.push("| Notes | Backend | Hits | CLI p50 | In-process p50 |");
  lines.push("| ---: | --- | ---: | ---: | ---: |");
  for (const s of report.search) {
    lines.push(`| ${s.concepts} | ${s.backend} | ${s.hits} | ${fmt(s.cli.p50)} | ${fmt(s.inProcess.p50)} |`);
  }
  lines.push("");
  lines.push("Reproduce:");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/bench.mjs");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

const opts = parseArgs(process.argv.slice(2));
const report = runSuite(opts);
if (opts.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(markdown(report));
}
