import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { getJev, jevHint, THRESHOLDS } from "../bin/lib/jev.mjs";
import { resolveJev, maskKey } from "../bin/lib/config.mjs";
import { applyLinks, queryVariants, sigTokens } from "../bin/lib/jev-assist.mjs";
import { runTool } from "../bin/lib/mcp.mjs";

const KEY = "tsk_test_SECRET_1234567890";

function parse(r) {
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

/** Async CLI so an in-process mock server can answer. */
function mentalAsync(home, cwd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...gitEnv(home), ...extraEnv } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/** Mock System One: every noul question gets `score`. */
async function mockServer(score, { status = 200 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      calls.push({ auth: req.headers.authorization, parsed });
      if (status !== 200) {
        res.writeHead(status);
        res.end("{}");
        return;
      }
      const answers = Object.fromEntries(Object.keys(parsed.questions || {}).map((id) => [id, { noul: score }]));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/v1/systemone`, calls, close: () => server.close() };
}

function seedBundle(home, root) {
  const n = (title, tag, body) =>
    parse(mental(home, root, ["note", "--json", "--title", title, "--tag", tag, "--description", title, "--body", body]));
  n("Postgres connection pool sizing", "database", "Pool size is capped at ten connections per worker.");
  n("Database migration ordering", "database", "Migrations run in filename order inside one transaction.");
  n("Pooling limits for the database", "database", "Connection pooling limits depend on worker count.");
}

test("no key: no network, no similar, heartbeat hint is rate limited", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(getJev(home, {}), null);
  const first = jevHint({ home, env: {}, surface: "heartbeat" });
  assert.ok(first, "first hint due");
  assert.equal(jevHint({ home, env: {}, surface: "heartbeat" }), null, "rate limited");
  seedBundle(home, root);
  const w = parse(mental(home, root, ["note", "--json", "--title", "Pool size cap", "--tag", "database"]));
  assert.equal(w.data.similar, undefined);
});

test("config beats env; key is masked and never printed", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parse(mental(home, root, ["option", "jev", "key", KEY, "--json"]));
  const r = resolveJev(home, { MENTAL_JEV_KEY: "env-key-value-1234" });
  assert.equal(r.key, KEY);
  assert.equal(r.source, "config");
  const out = mental(home, root, ["option", "jev", "--json"]);
  assert.ok(!out.stdout.includes(KEY) && !out.stderr.includes(KEY));
  assert.ok(!maskKey(KEY).includes("SECRET"));
  const heart = mental(home, root, ["heartbeat", "--json"]);
  assert.ok(!heart.stdout.includes(KEY));
});

test("option jev off mutes; MCP cannot toggle jev", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parse(mental(home, root, ["option", "jev", "key", KEY, "--json"]));
  parse(mental(home, root, ["option", "jev", "off", "--json"]));
  assert.equal(getJev(home, {}), null);
  assert.equal(jevHint({ home, env: {}, surface: "heartbeat" }), null);
  const res = runTool("option", { feature: "jev", action: "on" }, { home, cwd: root, env: gitEnv(home) });
  assert.notEqual(res.isError, false);
});

test("gate fails open on HTTP error, network error and timeout", async () => {
  const home = tempHome();
  const env = { MENTAL_JEV_KEY: KEY };
  const mk = (fetch, extra = {}) => getJev(home, env, { fetch, backoffMs: 1, timeoutMs: 50, ...extra });
  const httpErr = await mk(async () => ({ status: 500, ok: false, json: async () => ({}) })).gate({ a: 1 }, { q: "x" });
  assert.equal(httpErr.ok, false);
  assert.equal(httpErr.scores.q, null);
  const net = await mk(async () => {
    throw new Error("down");
  }).gate({ a: 2 }, { q: "x" });
  assert.equal(net.ok, false);
  const slow = await mk((_u, o) => new Promise((_r, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))))).gate({ a: 3 }, { q: "x" });
  assert.equal(slow.reason, "timeout");
});

test("gate falls back raw auth on 401 and caches answers", async () => {
  const home = tempHome();
  const seen = [];
  const fetch = async (_u, o) => {
    seen.push(o.headers.Authorization);
    if (o.headers.Authorization.startsWith("Bearer")) return { status: 401, ok: false, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => ({ answers: { q: { noul: 0.8 } } }) };
  };
  const jev = getJev(home, { MENTAL_JEV_KEY: KEY }, { fetch, backoffMs: 1 });
  const a = await jev.gate({ s: 1 }, { q: "is it?" });
  assert.equal(a.scores.q, 0.8);
  const before = seen.length;
  const b = await jev.gate({ s: 1 }, { q: "is it?" });
  assert.equal(b.scores.q, 0.8);
  assert.equal(seen.length, before, "cached");
});

test("helpers: sigTokens, queryVariants, applyLinks dedupe", () => {
  assert.ok(!sigTokens("the pooling of connections").includes("the"));
  const v = queryVariants([{ title: "Connection pool sizing", description: "", tags: [] }], ["pooling"]);
  assert.ok(Array.isArray(v));
  const home = tempHome();
  const abs = join(home, "n.md");
  writeFileSync(abs, "---\ntitle: N\n---\n\nBody.\n");
  const link = { path: "notes/a.md", title: "A" };
  assert.equal(applyLinks(abs, [link]), 1);
  assert.equal(applyLinks(abs, [link]), 0);
  assert.equal((readFileSync(abs, "utf8").match(/notes\/a\.md/g) || []).length, 1);
  writeFileSync(abs, "---\ntitle: N\n---\n\nBody.\n\n## Related\n\n- [X](notes/x.md)\n\n## Other\n\ntext\n");
  assert.equal(applyLinks(abs, [{ path: "notes/b.md", title: "B" }]), 1);
  const merged = readFileSync(abs, "utf8");
  assert.equal((merged.match(/## Related/g) || []).length, 1);
  assert.ok(merged.indexOf("notes/b.md") < merged.indexOf("## Other"));
  assert.ok(THRESHOLDS.link > THRESHOLDS.linkMaybe);
});

test("search recovery, similar-to, show and relink with a mock Jev", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root);
  const mock = await mockServer(0.95);
  const env = { MENTAL_JEV_KEY: KEY, MENTAL_JEV_URL: mock.url };
  try {
    const miss = parse(await mentalAsync(home, root, ["search", "--json", "poolng"], env));
    assert.equal(miss.data.recovered, true);
    assert.ok(miss.data.hits.length > 0);
    assert.ok(miss.data.hits.every((h) => typeof h.jevScore === "number"));
    assert.ok(mock.calls.length > 0);

    const w = parse(await mentalAsync(home, root, ["note", "--json", "--title", "Pool size limits", "--tag", "database", "--description", "Connection pool limits"], env));
    assert.ok(Array.isArray(w.data.similar) && w.data.similar.length > 0, "similar present");

    const shown = parse(await mentalAsync(home, root, ["show", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.ok(shown.data.suggestedLinks.proposed.length > 0);

    const dry = parse(await mentalAsync(home, root, ["relink", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.equal(dry.data.applied, 0);
    const abs = join(home, ".mental");
    assert.ok(existsSync(abs));
    const done = parse(await mentalAsync(home, root, ["relink", "--apply", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.ok(done.data.applied > 0);
    const again = parse(await mentalAsync(home, root, ["relink", "--apply", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.equal(again.data.applied, 0, "idempotent");
  } finally {
    mock.close();
  }
});

test("below threshold writes nothing; dead server fails open", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root);
  const low = await mockServer(0.2);
  try {
    const env = { MENTAL_JEV_KEY: KEY, MENTAL_JEV_URL: low.url };
    const dry = parse(await mentalAsync(home, root, ["relink", "--apply", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.equal(dry.data.applied, 0);
    const miss = parse(await mentalAsync(home, root, ["search", "--json", "poolng"], env));
    assert.equal(miss.data.hits.length, 0);
  } finally {
    low.close();
  }
  const env = { MENTAL_JEV_KEY: KEY, MENTAL_JEV_URL: "http://127.0.0.1:9/v1/systemone" };
  const w = parse(await mentalAsync(home, root, ["note", "--json", "--title", "Offline note", "--tag", "database"], env));
  assert.equal(w.ok, true);
  assert.equal(w.data.similar, undefined);
});
