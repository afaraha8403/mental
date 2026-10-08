import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo as baseInitRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { setDecideConfig } from "../bin/lib/config.mjs";
import { splitLines } from "../bin/lib/extract.mjs";
import { rerankHits } from "../bin/lib/rerank.mjs";
import { changedNames } from "../bin/lib/brief.mjs";

const KEY = "tsk_test_SECRET_1234567890";

// A bundle must exist before brief or extract can run; a note creates it without adding residue.
function initRepo(home) {
  const repo = baseInitRepo(home);
  const r = mental(home, repo.root, ["note", "--title", "Setup", "--body", "bound", "--tag", "setup", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return repo;
}

function withKey(home, url) {
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: url } });
}

function parse(r) {
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

function mentalAsync(home, cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...gitEnv(home), MENTAL_NO_HINTS: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * Mock decision server. Score questions answer by the title of the item they point at
 * (`urgent` 3, `noise` 0, else 1). Choice questions answer by the line text (`TODO` action, `DECIDED` decision, `RISK` concern, else noise).
 */
async function mock({ status = 200 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      calls.push(body);
      if (status !== 200) {
        res.writeHead(status);
        res.end("{}");
        return;
      }
      const parsed = JSON.parse(body || "{}");
      const state = parsed.state || {};
      const answers = Object.fromEntries(
        Object.entries(parsed.questions || {}).map(([id, q]) => {
          if (q.type === "score") {
            const hit = (state.items || state.hits || {})[id];
            const title = String(hit?.title || "");
            const s = /urgent/i.test(title) ? 3 : /noise/i.test(title) ? 0 : 1;
            return [id, { score: s, probabilities: { [s]: 0.9 }, confidence: 0.9 }];
          }
          if (q.type === "choice") {
            const text = String(state.lines?.[id] || "");
            const c = /TODO/.test(text) ? "action" : /DECIDED/.test(text) ? "decision" : /RISK/.test(text) ? "concern" : "noise";
            return [id, { choice: c, probabilities: { [c]: 0.95 }, confidence: 0.95 }];
          }
          const cand = state.candidates?.[id];
          return [id, { noul: cand ? (/urgent/i.test(cand.title) ? 0.9 : 0.1) : 0.1, confidence: 0.9 }];
        }),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/v1/systemone`, calls, close: () => server.close() };
}

function seed(root, home) {
  const add = (args) => assert.equal(mental(home, root, args).status, 0);
  add(["attention", "--title", "Noise item about lint colors", "--kind", "concern", "--tag", "style", "--json"]);
  add(["attention", "--title", "Urgent verify the migration", "--kind", "verify", "--tag", "db", "--json"]);
  add(["attention", "--title", "Plain verify rollout", "--kind", "verify", "--tag", "ops", "--json"]);
  add(["park", "--attention", "Waiting on review", "--kind", "thread", "--resume", "Edit bin/cli.mjs and run the tests", "--json"]);
}

test("brief: packet shape without a key", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(root, home);
  const r = parse(mental(home, root, ["brief", "--json"]));
  assert.equal(r.data.ranked, false);
  assert.ok(Array.isArray(r.data.needsEyes.items));
  assert.equal(r.data.needsEyes.total, 2);
  assert.ok(r.data.inTheAir.total >= 1);
  assert.ok(r.data.recentCommits.length >= 1);
  const text = mental(home, root, ["brief", "--plain"]).stdout;
  assert.match(text, /^Continue this work/);
});

test("brief: --hops is validated", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  for (const bad of ["0", "11", "x"]) {
    const r = mental(home, root, ["brief", "--hops", bad, "--json"]);
    assert.notEqual(r.status, 0);
    assert.equal(JSON.parse(r.stdout).error.code, "usage");
  }
  assert.equal(mental(home, root, ["brief", "--hops", "10", "--json"]).status, 0);
});

test("brief: empty bundle still produces a packet", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = parse(mental(home, root, ["brief", "--json"]));
  assert.equal(r.data.needsEyes.total, 0);
  assert.equal(r.data.lastHop, null);
  assert.equal(r.data.openDecisions.total, 0);
});

test("brief: no output carries the home path or a key", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(root, home);
  const out = mental(home, root, ["brief", "--json"]).stdout;
  assert.ok(!out.includes(KEY));
  assert.ok(!out.includes(home), "no home path in output");
});

test("brief: rank mode orders residue and hides irrelevant items", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    seed(root, home);
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["brief", "--json"]));
    assert.equal(r.data.ranked, true);
    assert.ok(m.calls.length > 0);
    assert.equal(r.data.needsEyes.items[0].title, "Urgent verify the migration");
    const air = r.data.inTheAir.items.map((i) => i.title);
    assert.ok(!air.includes("Noise item about lint colors"), "relevance 0 is hidden");
    assert.ok(r.data.inTheAir.hidden >= 1);
    assert.ok(!m.calls.join("").includes(KEY));
  } finally {
    m.close();
  }
});

test("brief: --no-rank never calls the server", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    seed(root, home);
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["brief", "--no-rank", "--json"]));
    assert.equal(r.data.ranked, false);
    assert.equal(m.calls.length, 0);
  } finally {
    m.close();
  }
});

test("brief: a failing server fails open to the unranked packet", async () => {
  const m = await mock({ status: 500 });
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    seed(root, home);
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["brief", "--json"]));
    assert.equal(r.data.ranked, false);
    assert.equal(r.data.needsEyes.total, 2);
  } finally {
    m.close();
  }
});

test("changedNames dedupes and strips directories", () => {
  assert.deepEqual(changedNames(" M bin/a.mjs\n M src/a.mjs\n?? docs/b.md").sort(), ["a.mjs", "b.md"]);
});

test("rerankHits orders by relevance, keeps every hit, fails open", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
    setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: m.url } });
    const { getJev } = await import("../bin/lib/jev.mjs");
    const jev = getJev(home, {});
    const hits = [
      { type: "Note", title: "Noise one", path: "a" },
      { type: "Note", title: "Plain two", path: "b" },
      { type: "Note", title: "Urgent three", path: "c" },
    ];
    const r = await rerankHits({ jev, queries: ["x"], hits });
    assert.equal(r.ok, true);
    assert.deepEqual(r.hits.map((h) => h.path), ["c", "b", "a"]);
    assert.equal(r.hits[0].relevance, 3);
    const single = await rerankHits({ jev, queries: ["x"], hits: hits.slice(0, 1) });
    assert.equal(single.ok, false);
    const bad = await rerankHits({ jev: { decide: async () => { throw new Error("x"); } }, queries: ["x"], hits });
    assert.deepEqual(bad.hits, hits);
  } finally {
    m.close();
  }
});

test("search --rank reorders hits; without a key it is a no-op", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    for (const t of ["Noise gadget", "Plain gadget", "Urgent gadget"]) {
      assert.equal(mental(home, root, ["note", "--title", t, "--body", "gadget details", "--tag", "gadgets", "--json"]).status, 0);
    }
    const plain = parse(mental(home, root, ["search", "gadget", "--rank", "--json"]));
    assert.equal(plain.data.ranked, undefined);
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["search", "gadget", "--rank", "--json"]));
    assert.equal(r.data.ranked, true);
    assert.match(r.data.hits[0].title, /Urgent/);
    const off = parse(await mentalAsync(home, root, ["search", "gadget", "--json"]));
    assert.equal(off.data.ranked, undefined);
  } finally {
    m.close();
  }
});

test("brief: --since filters hops by kind and shows against", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const add = (args) => assert.equal(mental(home, root, args).status, 0);
  add(["handoff", "--title", "Catalog landed", "--resume", "Write the docs next", "--against", "plan-a", "--json"]);
  add(["park", "--resume", "Pick up the cache layer", "--json"]);
  const all = parse(mental(home, root, ["brief", "--hops", "5", "--json"])).data.hops;
  assert.deepEqual(all.map((h) => h.kind).sort(), ["handoff", "park"]);
  const parks = parse(mental(home, root, ["brief", "--since", "park", "--json"])).data;
  assert.deepEqual(parks.hops.map((h) => h.kind), ["park"]);
  assert.equal(parks.lastHop.kind, "park");
  const hand = parse(mental(home, root, ["brief", "--since", "handoff", "--json"])).data;
  assert.deepEqual(hand.hops.map((h) => h.kind), ["handoff"]);
  assert.equal(hand.hops[0].against, "plan-a");
  const bad = mental(home, root, ["brief", "--since", "later", "--json"]);
  assert.notEqual(bad.status, 0);
  assert.equal(JSON.parse(bad.stdout).error.code, "usage");
});

test("rerankHits: a confident intent boosts that type without dropping hits", async () => {
  const hits = [
    { type: "Note", title: "Plain one", path: "a" },
    { type: "Decision", title: "Plain two", path: "b" },
    { type: "Attention", title: "Plain three", path: "c" },
  ];
  const fake = (intent) => ({
    decide: async (_s, qs) => ({
      ok: true,
      answers: Object.fromEntries(
        Object.keys(qs).map((id) => [id, id === "intent" ? { choice: intent, probabilities: { [intent]: 0.9 }, confidence: 0.9 } : { score: 1, probabilities: { 1: 0.9 }, confidence: 0.9 }]),
      ),
    }),
  });
  const routed = await rerankHits({ jev: fake("decision"), queries: ["why"], hits });
  assert.equal(routed.intent, "decision");
  assert.equal(routed.hits.length, 3);
  assert.equal(routed.hits[0].path, "b");
  const any = await rerankHits({ jev: fake("any"), queries: ["why"], hits });
  assert.equal(any.intent, undefined);
  assert.deepEqual(any.hits.map((h) => h.path), ["a", "b", "c"]);
});

test("search: zero-hit broad fallback finds a paraphrase and respects filters", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    for (const [t, tag] of [["Urgent login flow", "authn"], ["Noise colours", "style"]]) {
      assert.equal(mental(home, root, ["note", "--title", t, "--body", "details", "--tag", tag, "--json"]).status, 0);
    }
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["search", "credentials", "--json"]));
    assert.equal(r.data.recovered, true);
    assert.equal(r.data.broad, true);
    assert.ok(r.data.hits.some((h) => /login/.test(h.title)));
    const filtered = parse(await mentalAsync(home, root, ["search", "credentials", "--tag", "style", "--json"]));
    assert.ok(!filtered.data.hits.some((h) => /login/.test(h.title)));
  } finally {
    m.close();
  }
});

test("splitLines drops labels, bullets, short and duplicate lines", () => {
  const out = splitLines("Ana: We should ship the fix on Friday. Ok.\n- TODO write the migration guide\n- TODO write the migration guide\nhi");
  assert.deepEqual(out, ["We should ship the fix on Friday.", "TODO write the migration guide"]);
});

const DUMP = [
  "Ana: TODO Ben will write the migration guide before release.",
  "Ben: DECIDED we ship the cache layer behind a flag.",
  "Cy: RISK the staging database is shared with the load tests.",
  "Ana: Good morning everyone and thanks for joining today.",
].join("\n");

test("extract: dry run proposes residue and writes nothing", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    withKey(home, m.url);
    writeFileSync(join(root, "dump.txt"), DUMP);
    const r = parse(await mentalAsync(home, root, ["extract", "dump.txt", "--json"]));
    assert.deepEqual(r.data.proposals.map((p) => p.kind), ["action", "decision", "concern"]);
    assert.equal(r.data.written.length, 0);
    const list = parse(mental(home, root, ["list", "--json"]));
    assert.ok(!JSON.stringify(list).includes("migration guide"));
  } finally {
    m.close();
  }
});

test("extract --apply writes attention and decision files, never the transcript", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    withKey(home, m.url);
    writeFileSync(join(root, "dump.txt"), DUMP);
    const noTag = await mentalAsync(home, root, ["extract", "dump.txt", "--apply", "--json"]);
    assert.notEqual(noTag.status, 0);
    const r = parse(await mentalAsync(home, root, ["extract", "dump.txt", "--apply", "--tag", "planning", "--json"]));
    assert.equal(r.data.written.length, 3);
    assert.ok(r.data.written.some((w) => w.path.startsWith("decisions/")));
    assert.ok(r.data.written.some((w) => w.path.startsWith("attention/")));
    const again = parse(await mentalAsync(home, root, ["extract", "dump.txt", "--apply", "--tag", "planning", "--json"]));
    assert.equal(again.data.written.length, 0, "re-running does not duplicate");
    const s = parse(mental(home, root, ["search", "thanks for joining", "--json"]));
    assert.equal(s.data.hits.length, 0, "noise line is not stored");
  } finally {
    m.close();
  }
});

test("extract: no key is a clear refusal, a down server fails open", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  writeFileSync(join(root, "dump.txt"), DUMP);
  const off = mental(home, root, ["extract", "dump.txt", "--json"]);
  assert.notEqual(off.status, 0);
  assert.equal(JSON.parse(off.stdout).error.code, "jev-off");
  const m = await mock({ status: 500 });
  try {
    withKey(home, m.url);
    const r = parse(await mentalAsync(home, root, ["extract", "dump.txt", "--json"]));
    assert.equal(r.data.ok, false);
    assert.equal(r.data.proposals.length, 0);
  } finally {
    m.close();
  }
});

test("extract: redacts secrets before sending and before writing", async () => {
  const m = await mock();
  try {
    const home = tempHome();
    const { root } = initRepo(home);
    withKey(home, m.url);
    const secret = "sk-abcdefghijklmnop1234567890";
    writeFileSync(join(root, "dump.txt"), `TODO rotate the leaked token ${secret} before the release.`);
    const r = await mentalAsync(home, root, ["extract", "dump.txt", "--apply", "--tag", "ops", "--json"]);
    assert.ok(!r.stdout.includes(secret));
    assert.ok(!m.calls.join("").includes(secret));
  } finally {
    m.close();
  }
});
