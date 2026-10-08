import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { setDecideConfig } from "../bin/lib/config.mjs";
import { doctorNextAction, formatDoctorNextLine } from "../bin/lib/doctor-next.mjs";

const KEY = "tsk_test_SECRET_1234567890";

function parse(r) {
  assert.equal(r.status === 0 || r.status === 3, true, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

function mentalAsync(home, cwd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...gitEnv(home), MENTAL_NO_UPDATE_CHECK: "1", ...extraEnv } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function mockServer(score) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      calls.push(parsed);
      const answers = Object.fromEntries(
        Object.entries(parsed.questions || {}).map(([id, q]) => {
          if (q.type !== "choice") return [id, { noul: score }];
          const keys = Object.keys(q.criteria || {});
          const pick = keys.includes("cache") ? "cache" : keys.find((k) => k !== "none") || "none";
          return [id, { choice: pick, probabilities: { [pick]: score }, confidence: score }];
        }),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/v1/systemone`, calls, close: () => server.close() };
}

function seed(home, root) {
  const n = (title, tag, body) =>
    JSON.parse(mental(home, root, ["note", "--json", "--title", title, "--tag", tag, "--description", title, "--body", body]).stdout);
  n("Postgres connection pool sizing", "database", "Pool size is capped at ten connections per worker.");
  n("Database migration ordering", "database", "Migrations run in filename order.");
  const made = ["Cache warm start", "Cache eviction order", "Cache sizing"].map((t) => n(t, "temp", "Notes about the cache."));
  const bundle = made[0].data.root;
  for (const m of made) {
    const abs = join(bundle, m.data.path);
    writeFileSync(abs, readFileSync(abs, "utf8").replace(/^tags:.*\r?\n/m, ""));
  }
  mental(home, root, ["reindex", "--json"]);
  return { bundle, made };
}

const snapshot = (dir) => {
  const out = {};
  for (const sub of ["notes", "decisions", "attention"]) {
    try {
      for (const f of readdirSync(join(dir, sub))) out[`${sub}/${f}`] = readFileSync(join(dir, sub, f), "utf8");
    } catch {}
  }
  return out;
};

test("doctor: preview proposes and writes nothing; --apply writes; idempotent; exit code unaffected", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const { bundle, made } = seed(home, root);
  const mock = await mockServer(0.95);
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: mock.url } });
  try {
    const before = snapshot(bundle);
    const dry = await mentalAsync(home, root, ["doctor", "--json"]);
    const d = parse(dry).data;
    const check = d.checks.find((c) => c.id === "jev-repair");
    assert.ok(check, dry.stdout);
    assert.equal(check.ok, false);
    assert.equal(check.level, "warn");
    assert.equal(d.repair.apply, false);
    assert.equal(d.repair.tags.proposals.length, 3);
    assert.deepEqual(snapshot(bundle), before, "preview writes nothing");
    assert.ok(!d.checks.some((c) => c.id === "jev-untagged"), "tags are not checked twice");
    assert.ok(["fix", "repair"].includes(d.next.action), "a higher-priority fix may come first");
    assert.ok(!dry.stdout.includes(KEY));
    assert.equal(dry.status, JSON.parse(dry.stdout).ok ? 0 : 3);

    const done = await mentalAsync(home, root, ["doctor", "--apply", "--json"]);
    const a = parse(done).data;
    assert.equal(a.repair.apply, true);
    assert.equal(a.repair.tags.applied, 3);
    assert.match(readFileSync(join(bundle, made[0].data.path), "utf8"), /^tags: \[cache\]$/m);
    assert.equal(a.checks.find((c) => c.id === "jev-repair").ok, true);

    const again = await mentalAsync(home, root, ["doctor", "--apply", "--json"]);
    assert.equal(parse(again).data.repair.tags.applied, 0, "idempotent");
  } finally {
    mock.close();
  }
});

test("doctor --limit bounds link scanning and resumes where the last run stopped", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(home, root);
  const mock = await mockServer(0.95);
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: mock.url } });
  try {
    const first = parse(await mentalAsync(home, root, ["doctor", "--apply", "--limit", "2", "--json"])).data.repair;
    assert.equal(first.links.scanned, 2);
    assert.ok(first.links.remaining > 0);
    const second = parse(await mentalAsync(home, root, ["doctor", "--apply", "--limit", "2", "--json"])).data.repair;
    assert.ok(second.links.scanned >= 1);
    assert.ok(second.links.remaining < first.links.remaining, "progress carries over");
    const bad = parse(await mentalAsync(home, root, ["doctor", "--limit", "0", "--json"])).data;
    assert.match(bad.checks.find((c) => c.id === "jev-repair").message, /--limit/);
  } finally {
    mock.close();
  }
});

test("doctor --apply without a model or with --offline warns and writes nothing", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const { bundle } = seed(home, root);
  const before = snapshot(bundle);
  const none = await mentalAsync(home, root, ["doctor", "--apply", "--json"]);
  const n = parse(none).data;
  assert.equal(n.checks.find((c) => c.id === "jev-repair").level, "warn");
  assert.equal(n.repair, undefined);

  const mock = await mockServer(0.95);
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: mock.url } });
  try {
    const off = await mentalAsync(home, root, ["doctor", "--apply", "--offline", "--json"]);
    assert.equal(parse(off).data.checks.find((c) => c.id === "jev-repair").level, "warn");
    assert.equal(mock.calls.length, 0, "--offline makes no requests");
    assert.deepEqual(snapshot(bundle), before);
  } finally {
    mock.close();
  }
});

test("doctor-next: repair is offered only when a repair is pending", () => {
  const pending = [{ id: "jev-repair", ok: false, level: "warn", message: "3 tag(s) and 0 link(s) proposed (tag cache: X)" }];
  const next = doctorNextAction({ checks: pending, alreadyFixed: false, platform: "linux" });
  assert.deepEqual(next, { action: "repair", command: "mental doctor --apply" });
  const line = formatDoctorNextLine(next);
  assert.match(line, /next: mental doctor --apply/);
  assert.ok(!/&&|\.mjs/.test(line) && /^[\x00-\x7f]*$/.test(line));
  const clean = [{ id: "jev-repair", ok: false, level: "warn", message: "--apply needs a decision model; nothing written" }];
  assert.equal(doctorNextAction({ checks: clean, alreadyFixed: false, platform: "linux" }), null);
});
