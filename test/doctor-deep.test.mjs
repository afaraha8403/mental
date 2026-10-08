import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tempHome, initRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { deepChecks } from "../bin/lib/doctor-deep.mjs";

const KEY = "tsk_test_SECRET_1234567890";

function parse(r) {
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

function bundle(files) {
  const root = mkdtempSync(join(tmpdir(), "mental-deep-"));
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, text);
  }
  return root;
}

const md = (fm, body = "") => `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : v}`).join("\n")}\n---\n${body}\n`;

/** Fake client: answers come from `fn(id, question, state)`. */
function fakeJev(fn) {
  const calls = [];
  return {
    source: "config",
    calls,
    decide: async (state, questions) => {
      calls.push({ state, questions });
      return {
        ok: true,
        answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, fn(id, q, state)])),
      };
    },
  };
}

const ch = (choice, confidence = 0.9) => ({ type: "choice", choice, probabilities: { [choice]: confidence }, confidence });
const nl = (p) => ({ type: "noul", p, confidence: Math.abs(2 * p - 1) });

const fixture = () =>
  bundle({
    "attention/old-thing.md": md({ title: "Old thing", type: "Attention", status: "open", tags: ["auth"] }, "Chase the login bug."),
    "decisions/use-sqlite.md": md({ title: "Search index storage lives in sqlite", type: "Decision", status: "decided", tags: ["index"], description: "search index storage sqlite" }, "Index lives in sqlite."),
    "decisions/use-files-only.md": md({ title: "Search index storage lives in plain files", type: "Decision", status: "decided", tags: ["index"], description: "search index storage files" }, "No sqlite index."),
    "notes/untagged.md": md({ title: "Login flow notes", type: "Note" }, "How the auth login flow works."),
    "notes/auth.md": md({ title: "Auth overview", type: "Note", tags: ["auth"] }, "Auth overview."),
    "notes/auth2.md": md({ title: "Auth tokens", type: "Note", tags: ["auth"] }, "Auth token lifetimes."),
    "notes/creds.md": md({ title: "Deploy credentials", type: "Note", tags: ["ops"] }, "The deploy password is hunter2hunter2hunter2hunter2hunter2."),
    "journal/2026-01-01.md": md({ type: "Journal" }, "# 2026-01-01\n\n## 10:00 — did a thing\nResume: keep going"),
  });

test("deepChecks: no jev means no checks; personal slice is never sent", async () => {
  assert.deepEqual(await deepChecks({ jev: null, home: null, root: "x", slice: true, days: 0 }), []);
  const jev = fakeJev(() => nl(1));
  const out = await deepChecks({ jev, home: null, root: fixture(), slice: false, days: 0 });
  assert.equal(jev.calls.length, 0);
  assert.match(out[0].message, /never sent/);
});

test("deepChecks: confident answers become warn findings; weak ones stay silent", async () => {
  const jev = fakeJev((id, q) => {
    if (id.startsWith("s")) return ch("resolved");
    if (id === "quality") return ch("vague");
    if (id.startsWith("u")) return ch("auth");
    return nl(0.95);
  });
  const out = await deepChecks({ jev, home: null, root: fixture(), slice: true, days: 0 });
  const ids = out.map((c) => c.id);
  for (const id of ["jev", "jev-stale", "jev-decisions", "jev-handoff", "jev-untagged", "jev-secrets"]) {
    assert.ok(ids.includes(id), `${id} in ${ids}`);
  }
  assert.ok(out.every((c) => c.level !== "error"));
  assert.match(out.find((c) => c.id === "jev-secrets").message, /creds\.md/);
  assert.match(out.find((c) => c.id === "jev-untagged").message, /Login flow notes -> auth/);

  const quiet = fakeJev((id) => (id.startsWith("s") ? ch("relevant") : id === "quality" ? ch("exact") : id.startsWith("u") ? ch("none") : nl(0.1)));
  const clean = await deepChecks({ jev: quiet, home: null, root: fixture(), slice: true, days: 0 });
  assert.deepEqual(clean.map((c) => c.id), ["jev"]);
  assert.equal(clean[0].ok, true);

  const lowConf = fakeJev((id) => (id.startsWith("s") ? ch("resolved", 0.2) : id === "quality" ? ch("vague", 0.2) : nl(0.1)));
  const weak = await deepChecks({ jev: lowConf, home: null, root: fixture(), slice: true, days: 0 });
  assert.deepEqual(weak.map((c) => c.id), ["jev"]);
});

test("deepChecks: topic suggestions need a real vocabulary and confident answers", async () => {
  const sparse = bundle({
    "notes/a.md": md({ title: "A", type: "Note", tags: ["lone"] }, "a"),
    "notes/b.md": md({ title: "B", type: "Note", tags: ["lone"] }, "b"),
    "notes/c.md": md({ title: "C", type: "Note" }, "c"),
  });
  const jev = fakeJev(() => ch("lone"));
  const out = await deepChecks({ jev, home: null, root: sparse, slice: true, days: 0 });
  assert.ok(!out.some((c) => c.id === "jev-untagged"));
  assert.ok(!jev.calls.some((c) => Object.keys(c.questions).some((id) => id.startsWith("u"))), "no vocabulary, no question");

  const unsure = fakeJev((id) => (id.startsWith("u") ? ch("auth", 0.6) : nl(0.1)));
  const weak = await deepChecks({ jev: unsure, home: null, root: fixture(), slice: true, days: 0 });
  assert.ok(!weak.some((c) => c.id === "jev-untagged"), "0.6 confidence is not enough to suggest a topic");
});

test("deepChecks: credentials are redacted before they are sent", async () => {
  const jev = fakeJev(() => nl(0));
  await deepChecks({ jev, home: null, root: fixture(), slice: true, days: 0 });
  const sent = JSON.stringify(jev.calls.map((c) => c.state));
  assert.ok(!sent.includes("hunter2hunter2"), "secret value must not be sent");
  assert.match(sent, /REDACTED/);
});

test("deepChecks: a failing client yields one warn line and never throws", async () => {
  const jev = { source: "env", decide: async () => ({ ok: false, reason: "auth", answers: {} }) };
  const out = await deepChecks({ jev, home: null, root: fixture(), slice: true, days: 0 });
  assert.equal(out[0].id, "jev");
  assert.equal(out[0].ok, false);
  assert.equal(out[0].level, "warn");
  assert.match(out[0].message, /key rejected/);
  const boom = { source: "env", decide: async () => { throw new Error("x"); } };
  const out2 = await deepChecks({ jev: boom, home: null, root: fixture(), slice: true, days: 0 });
  assert.equal(out2[0].ok, false);
});

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

test("mental doctor: runs Jev checks when keyed, skips with --offline, exit code unaffected", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      calls.push(parsed);
      const answers = Object.fromEntries(
        Object.entries(parsed.questions || {}).map(([id, q]) => [
          id,
          q.type === "choice"
            ? { choice: Object.keys(q.criteria)[0], probabilities: {}, confidence: 0.9 }
            : { noul: 0.1 },
        ]),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers, model: "jev-test" }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const env = { MENTAL_JEV_KEY: KEY, MENTAL_JEV_URL: `http://127.0.0.1:${server.address().port}/v1/systemone`, MENTAL_NO_UPDATE_CHECK: "1" };
  try {
    mental(home, root, ["note", "--json", "--title", "A note", "--tag", "topic", "--body", "hello"]);
    mental(home, root, ["note", "--json", "--title", "Another", "--tag", "topic", "--body", "more"]);
    mental(home, root, ["note", "--json", "--title", "Third", "--tag", "topic", "--body", "even more"]);
    const where = parse(mental(home, root, ["where", "--json"]));
    const bundleRoot = where.data.root;
    mkdirSync(join(bundleRoot, "notes"), { recursive: true });
    writeFileSync(join(bundleRoot, "notes", "loose.md"), md({ title: "Loose idea", type: "Note" }, "No tags yet."));
    const on = await mentalAsync(home, root, ["doctor", "--json", "--days", "0"], env);
    const data = JSON.parse(on.stdout).data;
    const jevCheck = data.checks.find((c) => c.id === "jev");
    assert.ok(jevCheck, on.stdout);
    assert.equal(jevCheck.ok, true, jevCheck.message);
    assert.ok(!on.stdout.includes(KEY));
    const asked = calls.length;
    assert.ok(asked > 0, jevCheck.message);

    const off = await mentalAsync(home, root, ["doctor", "--json", "--offline"], env);
    assert.ok(!JSON.parse(off.stdout).data.checks.some((c) => c.id === "jev"));
    assert.equal(calls.length, asked, "--offline makes no requests");

    const none = await mentalAsync(home, root, ["doctor", "--json"], { MENTAL_NO_UPDATE_CHECK: "1" });
    assert.ok(!JSON.parse(none.stdout).data.checks.some((c) => c.id === "jev"));
  } finally {
    server.close();
  }
});
