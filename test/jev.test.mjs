import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { getJev, jevHint, THRESHOLDS, choice, score, noul, pick, normalize, usageToday } from "../bin/lib/jev.mjs";
import { resolveJev, resolveDecide, maskKey, setJevConfig, setDecideConfig, loadConfig } from "../bin/lib/config.mjs";
import { buildRequest, parseResponse, providerSettings, missingSetting } from "../bin/lib/decide-providers.mjs";
import { applyLinks, queryVariants, sigTokens } from "../bin/lib/jev-assist.mjs";
import { runTool } from "../bin/lib/mcp.mjs";

const KEY = "tsk_test_SECRET_1234567890";

/** Keys and URLs live only in config; this stores them for a temp home and returns it. */
function withKey(home, url, provider = "typesafe") {
  setDecideConfig(home, { set: { provider, field: "key", value: KEY } });
  if (url) setDecideConfig(home, { set: { provider, field: "url", value: url } });
  return home;
}

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
async function mockServer(score, { status = 200, choose = null } = {}) {
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
      const answer = (id, q) => {
        if (q.type !== "choice") return { noul: score };
        const keys = Object.keys(q.criteria || {});
        const pickKey = (choose && choose(id, q)) || keys.find((k) => k !== "none") || "none";
        return { choice: pickKey, probabilities: { [pickKey]: score }, confidence: score };
      };
      const answers = Object.fromEntries(Object.entries(parsed.questions || {}).map(([id, q]) => [id, answer(id, q)]));
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

test("keys come only from config: env is ignored; key is masked and never printed", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(getJev(home, { MENTAL_JEV_KEY: "env-key-value-1234", TYPESAFE_API_KEY: "x" }), null, "env keys are ignored");
  parse(mental(home, root, ["option", "jev", "key", KEY, "--json"]));
  const r = resolveJev(home);
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
  const env = (withKey(home), {});
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

test("gate does not retry with another auth scheme on 401, and caches answers", async () => {
  const home = tempHome();
  const seen = [];
  const bad = async (_u, o) => {
    seen.push(o.headers.Authorization);
    return { status: 401, ok: false, headers: { get: () => null }, json: async () => ({}) };
  };
  const denied = await getJev(withKey(home), {}, { fetch: bad, backoffMs: 1 }).gate({ s: 0 }, { q: "is it?" });
  assert.equal(denied.reason, "auth");
  assert.equal(seen.length, 1);
  assert.ok(seen[0].startsWith("Bearer "));
  const fetch = async (_u, o) => {
    seen.push(o.headers.Authorization);
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ answers: { q: { noul: 0.8 } } }) };
  };
  const jev = getJev(withKey(home), {}, { fetch, backoffMs: 1 });
  const a = await jev.gate({ s: 1 }, { q: "is it?" });
  assert.equal(a.scores.q, 0.8);
  const before = seen.length;
  const b = await jev.gate({ s: 1 }, { q: "is it?" });
  assert.equal(b.scores.q, 0.8);
  assert.equal(seen.length, before, "cached");
});

const okJson = (body) => async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => body });

test("decide: Choice and Score normalise with confidence; pick() gates on it", async () => {
  const home = tempHome();
  const fetch = okJson({
    model: "jev-1.13.0",
    usage: { input_tokens: 120, output_tokens: 9 },
    answers: {
      c: { type: "choice", choice: "bug", probabilities: { bug: 0.9, idea: 0.1 }, confidence: 0.8 },
      lo: { type: "choice", choice: "idea", probabilities: { bug: 0.4, idea: 0.6 }, confidence: 0.2 },
      s: { type: "score", score: 3.4, legend: "high", probabilities: { low: 0.1, high: 0.9 }, confidence: 0.7 },
      n: { type: "noul", noul: 0.9 },
      bad: { type: "choice" },
    },
  });
  const jev = getJev(withKey(home), {}, { fetch });
  const r = await jev.decide(
    { s: 1 },
    { c: choice("kind?", { bug: null, idea: null }), lo: choice("kind?", { bug: null, idea: null }), s: score("urgent?", ["low", "high"]), n: noul("x?"), bad: choice("y", { a: null, b: null }) },
  );
  assert.equal(r.ok, true);
  assert.equal(pick(r.answers.c), "bug");
  assert.equal(pick(r.answers.lo), null, "low confidence is not a pick");
  assert.equal(r.answers.s.score, 3.4);
  assert.equal(r.answers.s.confidence, 0.7);
  assert.ok(Math.abs(r.answers.n.confidence - 0.8) < 1e-9);
  assert.equal(r.answers.bad, null, "malformed answer is dropped, not guessed");
  assert.equal(normalize({ choice: "x" }, "score"), null);
});

test("decide: chunks by token budget and refuses an oversized state", async () => {
  const home = tempHome();
  const calls = [];
  const fetch = async (_u, o) => {
    const body = JSON.parse(o.body);
    calls.push(Object.keys(body.questions).length);
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ answers: Object.fromEntries(Object.keys(body.questions).map((k) => [k, { noul: 0.5 }])) }) };
  };
  const jev = getJev(withKey(home), {}, { fetch });
  const qs = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`q${i}`, `question ${i}`]));
  const r = await jev.gate({ s: "small" }, qs);
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [25, 25, 10]);

  const big = await jev.gate({ s: "x".repeat(200_000) }, { q: "y" });
  assert.equal(big.ok, false);
  assert.equal(big.reason, "too-large");
  assert.equal(calls.length, 3, "no request for an oversized state");
});

test("retry honours retry-after-ms and the ledger plus budget stop spending", async () => {
  const home = tempHome();
  let n = 0;
  const fetch = async () => {
    n++;
    if (n === 1) return { status: 429, ok: false, headers: { get: (h) => (h === "retry-after-ms" ? "5" : null) }, json: async () => ({}) };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ model: "m1", usage: { input_tokens: 100, output_tokens: 1 }, answers: { q: { noul: 0.7 } } }) };
  };
  const env = (withKey(home), {});
  const jev = getJev(home, env, { fetch, backoffMs: 5000 });
  const t0 = Date.now();
  const a = await jev.gate({ s: 1 }, { q: "one?" });
  assert.equal(a.scores.q, 0.7);
  assert.ok(Date.now() - t0 < 2000, "used retry-after-ms, not the 5s default backoff");
  assert.equal(usageToday(home, env).input, 100);

  setJevConfig(home, { dailyTokens: 100 });
  const capped = getJev(home, env, { fetch });
  const b = await capped.gate({ s: 2 }, { q: "two?" });
  assert.equal(b.ok, false);
  assert.equal(b.reason, "budget");
  assert.equal(n, 2, "no request once the budget is spent");
});

test("a new model version invalidates cached answers", async () => {
  const home = tempHome();
  let model = "m1";
  let calls = 0;
  const fetch = async () => {
    calls++;
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ model, answers: { q: { noul: model === "m1" ? 0.2 : 0.9 }, r: { noul: 0.4 } } }) };
  };
  const jev = getJev(withKey(home), {}, { fetch });
  assert.equal((await jev.gate({ s: 1 }, { q: "a?" })).scores.q, 0.2);
  assert.equal((await jev.gate({ s: 1 }, { q: "a?" })).scores.q, 0.2);
  assert.equal(calls, 1, "cached");
  model = "m2";
  await jev.gate({ s: 1 }, { r: "b?" });
  assert.equal((await jev.gate({ s: 1 }, { q: "a?" })).scores.q, 0.9, "old-model answer was dropped");
});

test("option jev budget sets, shows and clears the daily cap", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const run = (...a) => mental(home, root, ["option", "jev", ...a, "--json"]);
  assert.equal(parse(run("budget", "5000")).data.dailyTokens, 5000);
  assert.equal(parse(run()).data.dailyTokens, 5000);
  assert.equal(parse(run("budget", "off")).data.dailyTokens, null);
  assert.notEqual(run("budget", "nope").status, 0);
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
  const env = (withKey(home, mock.url), {});
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

test("retag: dry run writes nothing, --apply adds one tag, idempotent, jev-off and personal refused", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root);
  const made = ["Cache warm start", "Cache eviction order", "Cache sizing"].map((t) =>
    parse(mental(home, root, ["note", "--json", "--title", t, "--tag", "temp", "--description", t, "--body", "Notes about the cache."])),
  );
  const bundle = made[0].data.root;
  for (const m of made) {
    const abs = join(bundle, m.data.path);
    writeFileSync(abs, readFileSync(abs, "utf8").replace(/^tags:.*\r?\n/m, ""));
  }
  parse(mental(home, root, ["reindex", "--json"]));
  const mock = await mockServer(0.95, { choose: (id, q) => (q.criteria.cache !== undefined ? "cache" : null) });
  const env = (withKey(home, mock.url), {});
  try {
    const dry = parse(await mentalAsync(home, root, ["retag", "--json"], env));
    assert.equal(dry.data.applied, 0);
    assert.equal(dry.data.proposals.length, 3);
    assert.ok(dry.data.proposals.every((p) => p.tag === "cache" && p.isNew));
    assert.ok(!/tags:.*cache/.test(readFileSync(join(bundle, made[0].data.path), "utf8")));

    const done = parse(await mentalAsync(home, root, ["retag", "--apply", "--json"], env));
    assert.equal(done.data.applied, 3);
    const text = readFileSync(join(bundle, made[0].data.path), "utf8");
    assert.match(text, /^tags: \[cache\]$/m);
    assert.match(text, /^title: Cache warm start$/m);

    const again = parse(await mentalAsync(home, root, ["retag", "--apply", "--json"], env));
    assert.equal(again.data.applied, 0);
  } finally {
    mock.close();
  }
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: null } });
  assert.notEqual(mental(home, root, ["retag", "--json"]).status, 0, "no key refuses");
  withKey(home, "http://127.0.0.1:9/x");
  setDecideConfig(home, { personal: false });
  const personal = await mentalAsync(home, join(home, ".mental"), ["retag", "--json"]);
  assert.notEqual(personal.status, 0);
  assert.match(personal.stdout, /personal-slice/);
});

test("typed links: relation label written as a prefix and parsed as a normal link", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root);
  const mock = await mockServer(0.95, { choose: (id, q) => (q.criteria.supersedes !== undefined ? "supersedes" : null) });
  const env = (withKey(home, mock.url), {});
  try {
    const dry = parse(await mentalAsync(home, root, ["relink", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    const rows = dry.data.results[0].proposed;
    assert.ok(rows.length > 0 && rows.every((r) => r.relation === "supersedes"));
    parse(await mentalAsync(home, root, ["relink", "--apply", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    const shown = parse(await mentalAsync(home, root, ["show", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    const file = readFileSync(join(shown.data.root, "notes/postgres-connection-pool-sizing.md"), "utf8");
    assert.match(file, /^- supersedes: \[.+\]\(notes\/.+\.md\)$/m);
  } finally {
    mock.close();
  }
  const abs = join(home, "n.md");
  writeFileSync(abs, "---\ntitle: N\n---\n\nBody.\n");
  assert.equal(applyLinks(abs, [{ path: "notes/a.md", title: "A", relation: "related" }, { path: "notes/b.md", title: "B", relation: "contradicts" }, { path: "notes/c.md", title: "C", relation: "bogus" }]), 3);
  const out = readFileSync(abs, "utf8");
  assert.match(out, /^- \[A\]\(notes\/a\.md\)$/m);
  assert.match(out, /^- contradicts: \[B\]\(notes\/b\.md\)$/m);
  assert.match(out, /^- \[C\]\(notes\/c\.md\)$/m);
});

test("applyTag edits only the tags line and refuses when tags exist", async () => {
  const { applyTag } = await import("../bin/lib/retag.mjs");
  const home = tempHome();
  const f = join(home, "t.md");
  const cases = [
    ["---\ntitle: A\ntags: []\n---\nBody\n", true, /^tags: \[xx\]$/m],
    ["---\r\ntitle: A\r\n---\r\nBody\r\n", true, /tags: \[xx\]/],
    ["---\ntitle: A\ntags: [y]\n---\nBody\n", false, /tags: \[y\]/],
    ["No frontmatter\n", false, /^No frontmatter/],
  ];
  for (const [src, ok, re] of cases) {
    writeFileSync(f, src);
    assert.equal(applyTag(f, "xx"), ok);
    const out = readFileSync(f, "utf8");
    assert.match(out, re);
    assert.match(out, /Body|No frontmatter/);
  }
});

test("below threshold writes nothing; dead server fails open", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root);
  const low = await mockServer(0.2);
  try {
    const env = (withKey(home, low.url), {});
    const dry = parse(await mentalAsync(home, root, ["relink", "--apply", "--json", "notes/postgres-connection-pool-sizing.md"], env));
    assert.equal(dry.data.applied, 0);
    const miss = parse(await mentalAsync(home, root, ["search", "--json", "poolng"], env));
    assert.equal(miss.data.hits.length, 0);
  } finally {
    low.close();
  }
  const env = (withKey(home, "http://127.0.0.1:9/v1/systemone"), {});
  const w = parse(await mentalAsync(home, root, ["note", "--json", "--title", "Offline note", "--tag", "database"], env));
  assert.equal(w.ok, true);
  assert.equal(w.data.similar, undefined);
});
