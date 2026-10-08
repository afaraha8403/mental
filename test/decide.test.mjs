import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo, mental } from "./helpers.mjs";
import { getJev, choice, noul, score } from "../bin/lib/jev.mjs";
import { resolveDecide, setDecideConfig, loadConfig } from "../bin/lib/config.mjs";
import { buildRequest, parseResponse, providerSettings, missingSetting, PROVIDER_INFO } from "../bin/lib/decide-providers.mjs";

const KEY = "sk_decide_SECRET_9876543210";

const parse = (r) => {
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
};

const settings = (provider, extra = {}) => providerSettings(provider, { key: KEY, ...extra });

const QS = {
  a: noul("Is it a bug?", { true: "a defect", false: "a feature" }),
  b: choice("Which kind?", { fix: "repair", feat: "new" }),
  c: score("How urgent?", ["low", "mid", "high"]),
};

test("openai wire format: opaque ids, typed questions, bearer auth, answers mapped back", () => {
  const built = buildRequest(settings("openai"), "state text", QS);
  const body = JSON.parse(built.body);
  assert.equal(built.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(body.model, "gpt-6-luna");
  assert.deepEqual(body.questions.map((q) => [q.name, q.type]), [["q0", "predicate"], ["q1", "choice"], ["q2", "score"]]);
  assert.deepEqual(body.questions[1].choices.map((c) => c.value), ["fix", "feat"]);
  assert.deepEqual(body.questions[2].levels.map((l) => l.label), ["low", "mid", "high"]);

  const parsed = parseResponse(
    "openai",
    {
      answers: [
        { type: "predicate", name: "q0", probability: 0.8 },
        { type: "choice", name: "q1", choice: "fix", probabilities: [{ value: "fix", probability: 0.9 }], confidence: 0.9 },
        { type: "score", name: "q2", score: 2, probabilities: [{ label: "high", probability: 0.7 }], confidence: 0.7 },
      ],
    },
    built.idMap,
    QS,
  );
  assert.equal(parsed.answers.a.noul, 0.8);
  assert.equal(parsed.answers.b.choice, "fix");
  assert.equal(parsed.answers.c.legend, "high");
});

test("openai refusal drops that answer only", () => {
  const built = buildRequest(settings("openai"), "s", QS);
  const parsed = parseResponse(
    "openai",
    { answers: [{ type: "refusal", name: "q0" }, { type: "predicate", name: "q1", probability: 0.5 }] },
    built.idMap,
    QS,
  );
  assert.equal(parsed.answers.a, undefined);
});

test("cloudflare: account-scoped url, model required, envelope unwrapped, ids mapped back", () => {
  const s = settings("cloudflare", { accountId: "acct1", model: "clef" });
  assert.equal(missingSetting(settings("cloudflare")), "account-id");
  assert.equal(missingSetting(settings("cloudflare", { accountId: "a", model: "other" })), "model");
  assert.equal(missingSetting(s), null);
  const built = buildRequest(s, "state", QS);
  assert.match(built.url, /\/accounts\/acct1\/ai\/run\/@cf\/cloudflare\/clef$/);
  assert.equal(built.headers.Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(built.body);
  assert.deepEqual(Object.keys(body.questions), ["q0", "q1", "q2"]);
  const wrapped = parseResponse("cloudflare", { success: true, result: { answers: { q0: { noul: 0.3 } } } }, built.idMap, QS);
  assert.equal(wrapped.answers.a.noul, 0.3);
  const bare = parseResponse("cloudflare", { answers: { q1: { choice: "feat" } } }, built.idMap, QS);
  assert.equal(bare.answers.b.choice, "feat");
});

test("provider batch caps respect documented per-request limits", () => {
  assert.equal(PROVIDER_INFO.openai.batchMax, 10);
  assert.equal(PROVIDER_INFO.cloudflare.batchMax, 64);
});

const res = (json) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => json });

function bigQuestions(n) {
  const qs = {};
  for (let i = 0; i < n; i++) qs[`m${i}`] = noul(`Is item ${i} relevant?`, { true: "yes", false: "no" });
  qs.pick = choice("Which kind?", { fix: "repair", feat: "new", none: null });
  qs.rate = score("How urgent?", ["low", "mid", "high"]);
  return qs;
}

test("openai end to end: every request obeys the documented limits and doc-shaped answers parse", async () => {
  const home = tempHome();
  setDecideConfig(home, { set: { provider: "openai", field: "key", value: KEY } });
  const sizes = [];
  const fetch = async (url, o) => {
    assert.equal(url, "https://api.openai.com/v1/decisions");
    const body = JSON.parse(o.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(typeof body.input, "string");
    assert.ok(body.questions.length >= 1 && body.questions.length <= 10, `got ${body.questions.length} questions`);
    assert.equal(new Set(body.questions.map((q) => q.name)).size, body.questions.length);
    sizes.push(body.questions.length);
    const answers = body.questions.map((q) => {
      if (q.type === "predicate") return { type: "predicate", name: q.name, probability: 0.9 };
      if (q.type === "choice") {
        assert.ok(q.choices.every((c) => typeof c.value === "string"));
        return { type: "choice", name: q.name, choice: q.choices[0].value, probabilities: q.choices.map((c) => ({ value: c.value, probability: 1 / q.choices.length })), confidence: 0.8 };
      }
      assert.equal(q.type, "score");
      assert.ok(q.levels.length >= 2 && q.levels.every((l) => typeof l.label === "string"));
      return { type: "score", name: q.name, score: 1.4, probabilities: q.levels.map((l, i) => ({ value: i, label: l.label, probability: 1 / q.levels.length })), confidence: 0.6 };
    });
    return res({ answers });
  };
  const jev = getJev(home, {}, { fetch });
  const qs = bigQuestions(23);
  const out = await jev.decide("some state", qs);
  assert.equal(out.ok, true, out.reason);
  assert.equal(Object.keys(out.answers).length, Object.keys(qs).length);
  assert.equal(out.answers.m0.p, 0.9);
  assert.equal(out.answers.pick.choice, "fix");
  assert.equal(out.answers.rate.score, 1.4);
  assert.ok(sizes.length >= 3);
});

test("cloudflare end to end: requests satisfy the Clef input schema and doc-shaped answers parse", async () => {
  const home = tempHome();
  setDecideConfig(home, { set: { provider: "cloudflare", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "cloudflare", field: "accountId", value: "acct1" } });
  setDecideConfig(home, { set: { provider: "cloudflare", field: "model", value: "clef-flash" } });
  const fetch = async (url, o) => {
    assert.equal(url, "https://api.cloudflare.com/client/v4/accounts/acct1/ai/run/@cf/cloudflare/clef-flash");
    const body = JSON.parse(o.body);
    assert.match(body.model, /^\s*(clef|clef-flash)\s*$/);
    assert.ok(body.state !== undefined);
    const ids = Object.keys(body.questions);
    assert.ok(ids.length >= 1 && ids.length <= 64);
    const answers = {};
    for (const id of ids) {
      assert.match(id, /^[A-Za-z0-9_.-]{1,100}$/);
      const q = body.questions[id];
      assert.ok(typeof q.instructions === "string" && q.instructions.length > 0);
      if (q.type === "noul") {
        assert.ok(q.criteria === undefined || (typeof q.criteria === "object" && !Array.isArray(q.criteria)));
        answers[id] = { type: "noul", noul: 0.7 };
      } else if (q.type === "choice") {
        const opts = Object.keys(q.criteria);
        assert.ok(opts.length >= 2 && opts.length <= 255 && opts.every(Boolean));
        answers[id] = { type: "choice", choice: opts[1], probabilities: Object.fromEntries(opts.map((k) => [k, 1 / opts.length])), confidence: 0.5 };
      } else {
        assert.equal(q.type, "score");
        assert.ok(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10);
        answers[id] = {
          type: "score",
          score: 0.5,
          legend: Object.fromEntries(q.criteria.map((l, i) => [String(i), l])),
          probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), 1 / q.criteria.length])),
          confidence: 0.4,
        };
      }
    }
    return res({ success: true, errors: [], result: { model: "clef-flash", answers, usage: { input_tokens: 321, output_tokens: 4 } } });
  };
  const jev = getJev(home, {}, { fetch });
  const qs = bigQuestions(5);
  const out = await jev.decide({ title: "structured state", n: 1 }, qs);
  assert.equal(out.ok, true, out.reason);
  assert.equal(out.answers.m0.p, 0.7);
  assert.equal(out.answers.pick.choice, "feat");
  assert.equal(out.answers.rate.score, 0.5);
});

test("typesafe and custom send the native shape with original ids", () => {
  for (const p of ["typesafe", "custom"]) {
    const built = buildRequest(settings(p, { url: "https://example.test/x" }), "st", QS);
    const body = JSON.parse(built.body);
    assert.deepEqual(Object.keys(body.questions), ["a", "b", "c"]);
    assert.equal(body.state, "st");
  }
  assert.equal(missingSetting(settings("custom")), "url");
});

test("legacy jev config block migrates to the typesafe provider", () => {
  const home = tempHome();
  mkdirSync(join(home, ".mental"), { recursive: true });
  writeFileSync(join(home, ".mental", "config.json"), JSON.stringify({ jev: { key: KEY, enabled: true, dailyTokens: 5000 } }));
  const r = resolveDecide(home);
  assert.equal(r.provider, "typesafe");
  assert.equal(r.key, KEY);
  assert.equal(r.personal, true);
  assert.equal(loadConfig(home).decide.dailyTokens, 5000);
});

test("option decide: provider, key per provider, fallback, personal; keys are never printed", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const run = (...a) => mental(home, root, ["option", "decide", ...a, "--json"]);
  parse(run("key", KEY, "--provider", "openai"));
  parse(run("key", "cf_SECRET_abcdef123456", "--provider", "cloudflare"));
  parse(run("account", "acct9", "--provider", "cloudflare"));
  parse(run("model", "clef-flash", "--provider", "cloudflare"));
  assert.equal(resolveDecide(home, "cloudflare").accountId, "acct9");

  parse(run("provider", "openai"));
  assert.equal(resolveDecide(home).provider, "openai");
  parse(run("fallback", "cloudflare"));
  assert.equal(resolveDecide(home).fallback, "cloudflare");
  parse(run("fallback", "off"));
  assert.equal(resolveDecide(home).fallback, null);

  parse(run("personal", "off"));
  assert.equal(resolveDecide(home).personal, false);
  parse(run("personal", "on"));
  assert.equal(resolveDecide(home).personal, true);

  const status = mental(home, root, ["option", "decide", "status", "--json"]);
  assert.ok(!status.stdout.includes(KEY));
  assert.ok(!status.stdout.includes("cf_SECRET_abcdef123456"));
  assert.notEqual(mental(home, root, ["option", "decide", "provider", "nope", "--json"]).status, 0);

  parse(run("key", "clear", "--provider", "openai"));
  assert.equal(resolveDecide(home, "openai").key, null);
  assert.ok(!readFileSync(join(home, ".mental", "config.json"), "utf8").includes(KEY));
});

test("fallback provider answers when the primary fails; usage is shared", async () => {
  const home = tempHome();
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: "https://primary.test/x" } });
  setDecideConfig(home, { set: { provider: "custom", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "custom", field: "url", value: "https://backup.test/x" } });
  setDecideConfig(home, { provider: "typesafe", fallback: "custom" });
  const urls = [];
  const fetch = async (u) => {
    urls.push(u);
    if (u.startsWith("https://primary")) return { status: 500, ok: false, headers: { get: () => null }, json: async () => ({}) };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ answers: { q: { noul: 0.9 } } }) };
  };
  const jev = getJev(home, {}, { fetch, backoffMs: 1 });
  assert.equal(jev.provider, "typesafe");
  const r = await jev.gate({ s: 1 }, { q: "is it?" });
  assert.ok(urls.some((u) => u.startsWith("https://backup")), urls.join());
  assert.ok(r.ok !== false);
});
