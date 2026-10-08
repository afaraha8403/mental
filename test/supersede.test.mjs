import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tempHome, initRepo, mental, gitEnv, CLI } from "./helpers.mjs";
import { setDecideConfig } from "../bin/lib/config.mjs";

const KEY = "tsk_test_SECRET_1234567890";
const json = (r) => JSON.parse(r.stdout);

function note(home, root, title, body = "Some body text.") {
  return json(mental(home, root, ["note", "--json", "--title", title, "--tag", "db", "--description", title, "--body", body])).data;
}

function decision(home, root, title) {
  return json(mental(home, root, ["decide", "--json", "--title", title, "--tag", "db", "--status", "decided", "--description", title, "--body", "We chose this."])).data;
}

test("supersede marks a note, keeps the file, links the replacement, and restores", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const oldN = note(home, root, "Use sqlite for storage");
  const newN = note(home, root, "Use postgres for storage");
  const bundle = oldN.root;
  const before = readFileSync(join(bundle, oldN.path), "utf8");

  const r = mental(home, root, ["supersede", oldN.path, "--by", newN.path, "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const d = json(r).data;
  assert.equal(d.status, "superseded");
  assert.equal(d.supersededBy, newN.path);
  assert.equal(d.changed, true);

  const after = readFileSync(join(bundle, oldN.path), "utf8");
  assert.match(after, /^status: superseded$/m);
  assert.ok(after.includes(`superseded_by: ${newN.path}`));
  assert.ok(after.includes("Some body text."), "body untouched");
  assert.ok(existsSync(join(bundle, oldN.path)), "never deleted");
  assert.match(readFileSync(join(bundle, newN.path), "utf8"), /supersedes: \[Use sqlite for storage\]/);

  const again = json(mental(home, root, ["supersede", oldN.path, "--by", newN.path, "--json"])).data;
  assert.equal(again.changed, false, "idempotent");

  const back = json(mental(home, root, ["supersede", oldN.path, "--restore", "--json"])).data;
  assert.equal(back.status, "active");
  const restored = readFileSync(join(bundle, oldN.path), "utf8");
  assert.ok(!restored.includes("superseded_by"));
  assert.match(restored, /^status: active$/m);
  assert.equal(restored.replace(/^status: .*$/m, "").replace(/\r/g, "").length > 0, true);
  assert.equal(before.replace(/\r/g, "").split("\n").length, restored.replace(/\r/g, "").split("\n").length);
});

test("supersede and obsolete validate their input and never touch journals", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const a = note(home, root, "Alpha rule");
  const b = note(home, root, "Beta rule");

  assert.notEqual(mental(home, root, ["supersede", a.path, "--json"]).status, 0, "needs --by");
  assert.notEqual(mental(home, root, ["supersede", a.path, "--by", a.path, "--json"]).status, 0, "not itself");
  assert.notEqual(mental(home, root, ["supersede", a.path, "--by", "notes/missing.md", "--json"]).status, 0);
  assert.notEqual(mental(home, root, ["obsolete", a.path, "--by", b.path, "--json"]).status, 0);
  assert.notEqual(mental(home, root, ["obsolete", "journal/2026-01-01.md", "--json"]).status, 0, "journals stay history");

  assert.equal(mental(home, root, ["supersede", a.path, "--by", b.path, "--json"]).status, 0);
  const chained = mental(home, root, ["supersede", b.path, "--by", a.path, "--json"]);
  assert.notEqual(chained.status, 0, "cannot point at a stale file or form a cycle");
});

test("obsolete hides notes and decisions from heartbeat while keeping them searchable and last", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const keep = note(home, root, "Retry policy current", "retry backoff");
  const gone = note(home, root, "Retry policy legacy", "retry backoff");
  const dec = decision(home, root, "Retry policy decision");

  const r = mental(home, root, ["obsolete", gone.path, "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(json(r).data.status, "obsolete");
  assert.match(readFileSync(join(gone.root, gone.path), "utf8"), /^status: obsolete$/m);

  const s = json(mental(home, root, ["search", "retry", "--json"])).data;
  const paths = s.hits.map((h) => h.path);
  assert.ok(paths.includes(gone.path), "still findable");
  assert.equal(paths[paths.length - 1], gone.path, "ranked last");
  assert.equal(s.hits.find((h) => h.path === gone.path).status, "obsolete");
  assert.ok(paths.includes(keep.path) && paths.includes(dec.path));

  const text = mental(home, root, ["search", "retry"]).stdout;
  assert.match(text, /Retry policy legacy.*obsolete/);

  const decObs = mental(home, root, ["obsolete", dec.path, "--json"]);
  assert.equal(decObs.status, 0, decObs.stderr || decObs.stdout);
  const list = json(mental(home, root, ["list", "--type", "Decision", "--status", "obsolete", "--json"])).data;
  assert.equal(list.items?.length ?? list.concepts?.length ?? list.hits?.length, 1);
});

test("search text names the replacement for a superseded note", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const o = note(home, root, "Cache layer v1", "cache");
  const n = note(home, root, "Cache layer v2", "cache");
  mental(home, root, ["supersede", o.path, "--by", n.path]);
  const s = json(mental(home, root, ["search", "cache", "--json"])).data;
  const hit = s.hits.find((h) => h.path === o.path);
  assert.equal(hit.supersededBy, n.path);
  assert.equal(s.hits[0].path, n.path);
  assert.match(mental(home, root, ["search", "cache"]).stdout, new RegExp(`superseded by ${n.path.replace(/[.]/g, "\\.")}`));
});

function mentalAsync(home, cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...gitEnv(home), MENTAL_NO_UPDATE_CHECK: "1" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function supersedesMock() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const answers = Object.fromEntries(
        Object.entries(parsed.questions || {}).map(([id, q]) => {
          if (q.type !== "choice") return [id, { noul: 0.95 }];
          const keys = Object.keys(q.criteria || {});
          const pick = keys.includes("supersedes") ? "supersedes" : keys.find((k) => k !== "none") || "none";
          return [id, { choice: pick, probabilities: { [pick]: 0.95 }, confidence: 0.95 }];
        }),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/v1/systemone`, close: () => server.close() };
}

test("doctor proposes superseded marks by date, writes only with --apply", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const oldN = note(home, root, "Deploy runs on Heroku", "Deploys go to Heroku.");
  const newN = note(home, root, "Deploy runs on Fly", "Deploys go to Fly.");
  const bundle = oldN.root;
  const oldAbs = join(bundle, oldN.path);
  writeFileSync(oldAbs, readFileSync(oldAbs, "utf8").replace(/^timestamp:.*$/m, "timestamp: 2025-01-01T00:00:00.000Z"));
  mental(home, root, ["reindex", "--json"]);

  const mock = await supersedesMock();
  setDecideConfig(home, { set: { provider: "typesafe", field: "key", value: KEY } });
  setDecideConfig(home, { set: { provider: "typesafe", field: "url", value: mock.url } });
  try {
    const before = readFileSync(oldAbs, "utf8");
    const dry = json(await mentalAsync(home, root, ["doctor", "--json"])).data;
    assert.ok(dry.repair.stale.proposals.length >= 1, JSON.stringify(dry.repair));
    const p = dry.repair.stale.proposals[0];
    assert.equal(p.path, oldN.path);
    assert.equal(p.by, newN.path);
    assert.equal(readFileSync(oldAbs, "utf8"), before, "preview writes nothing");
    assert.match(dry.checks.find((c) => c.id === "jev-repair").message, /proposed/);

    const done = json(await mentalAsync(home, root, ["doctor", "--apply", "--json"])).data;
    assert.ok(done.repair.stale.applied >= 1);
    const after = readFileSync(oldAbs, "utf8");
    assert.match(after, /^status: superseded$/m);
    assert.ok(after.includes(`superseded_by: ${newN.path}`));
    assert.ok(!after.includes("supersedes: ["), "no wrong-direction link left on the old file");
  } finally {
    mock.close();
  }
});
