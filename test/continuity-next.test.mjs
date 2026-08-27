/**
 * Continuity-next: park, handoff, pulse, since-last-pulse delta,
 * open-decision budget, stale-residue doctor.
 *
 * Heartbeat stays a cheap reload — counts + capped lists, never a notes dump.
 * Watermark is rebuildable cache, not SoT. Heartbeat never writes it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatHeartbeat } from "../bin/lib/heartbeat.mjs";
import { DECISION_HEARTBEAT_CAP, stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { handle, runTool } from "../bin/lib/mcp.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${r.stdout}`);
  return body.data;
}

function parseErr(r) {
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false, r.stdout);
  return body.error;
}

function whereOf(home, cwd) {
  return parseOk(mental(home, cwd, ["where", "--json"]), "where");
}

function watermarkPath(home, id) {
  return join(home, ".cache", "mental", `${id}.pulse.json`);
}

function writeOkf(root, rel, data, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function seedBundle(home, cwd, title = "Seed") {
  parseOk(
    mental(home, cwd, ["journal", "--json", "--title", title, "--resume", "Continue seeded work — open loops: none"]),
    "seed journal",
  );
  return whereOf(home, cwd);
}

test("park requires --resume", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["park", "--json"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const err = parseErr(r);
  assert.equal(err.code, "usage");
  assert.match(err.message, /--resume/);
});

test("park writes journal resume; heartbeat shows it", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const data = parseOk(
    mental(home, root, [
      "park",
      "--json",
      "--resume",
      "Pick up the overlay next — open loops: none",
    ]),
    "park",
  );
  assert.match(data.path, /^journal\/\d{4}-\d{2}-\d{2}\.md$/);
  assert.ok(data.heartbeat, "park JSON includes heartbeat");
  assert.match(data.heartbeat.handoff.resume, /Pick up the overlay next/);
  assert.match(data.heartbeat.handoff.outcome, /Parked/);

  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat after park");
  assert.match(hb.handoff.resume, /Pick up the overlay next/);
});

test("park --attention --kind writes residue", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const data = parseOk(
    mental(home, root, [
      "park",
      "--json",
      "--resume",
      "Come back to the pointer — open loops: residue",
      "--attention",
      "Tom said ship the pointer",
      "--kind",
      "direction",
      "--from",
      "Tom",
    ]),
    "park + attention",
  );
  assert.ok(data.attention, "park JSON includes attention write");
  assert.match(data.attention.path, /^attention\//);
  assert.equal(data.heartbeat.attentionCount, 1);
  assert.equal(data.heartbeat.attention[0].title, "Tom said ship the pointer");
});

test("park --attention without --kind is usage", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, [
    "park",
    "--json",
    "--resume",
    "Need a kind — open loops: none",
    "--attention",
    "Forgot the kind",
  ]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  const err = parseErr(r);
  assert.equal(err.code, "usage");
  assert.match(err.message, /--kind/);
});

test("handoff requires --title and --resume", () => {
  const home = tempHome();
  const { root } = initRepo(home);

  const noTitle = mental(home, root, ["handoff", "--json", "--resume", "x — open loops: none"]);
  assert.equal(noTitle.status, 1);
  assert.equal(parseErr(noTitle).code, "usage");
  assert.match(parseErr(noTitle).message, /--title/);

  const noResume = mental(home, root, ["handoff", "--json", "--title", "Landed"]);
  assert.equal(noResume.status, 1);
  assert.equal(parseErr(noResume).code, "usage");
  assert.match(parseErr(noResume).message, /--resume/);
});

test("handoff writes journal; JSON heartbeat has resume", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const data = parseOk(
    mental(home, root, [
      "handoff",
      "--json",
      "--title",
      "Resolver landed",
      "--resume",
      "Write the pulse next — open loops: none",
    ]),
    "handoff",
  );
  assert.match(data.path, /^journal\//);
  assert.match(data.heartbeat.handoff.resume, /Write the pulse next/);
  assert.equal(data.heartbeat.handoff.outcome, "Resolver landed");
});

test("pulse lists two bindings, compact fields, no bodies", () => {
  const home = tempHome();
  const a = initRepo(home, { origin: "git@github.com:afaraha8403/alpha.git", name: "alpha" });
  const b = initRepo(home, { origin: "git@github.com:afaraha8403/beta.git", name: "beta" });
  mental(home, a.root, [
    "journal",
    "--json",
    "--title",
    "Alpha journal body must not leak",
    "--body",
    "SECRET_ALPHA_JOURNAL_BODY",
    "--resume",
    "Alpha next — open loops: none",
  ]);
  mental(home, b.root, [
    "journal",
    "--json",
    "--title",
    "Beta journal body must not leak",
    "--body",
    "SECRET_BETA_JOURNAL_BODY",
    "--resume",
    "Beta next — open loops: none",
  ]);

  const data = parseOk(mental(home, a.root, ["pulse", "--json"]), "pulse two projects");
  assert.ok(Array.isArray(data.projects), "pulse.projects is an array");
  assert.equal(data.projects.length, 2);
  for (const row of data.projects) {
    assert.equal(typeof row.id, "string");
    assert.ok(row.id.length > 0);
    assert.equal(typeof row.name, "string");
    assert.equal(typeof row.resume, "string");
    assert.equal(typeof row.attentionCount, "number");
    assert.equal(typeof row.openDecisionCount, "number");
    assert.equal(row.body, undefined);
    assert.equal(row.notes, undefined);
    assert.equal(row.journal, undefined);
    assert.equal(row.attention, undefined);
    assert.equal(row.openDecisions, undefined);
  }
  const resumes = data.projects.map((p) => p.resume).sort();
  assert.ok(resumes.some((r) => /Alpha next/.test(r)));
  assert.ok(resumes.some((r) => /Beta next/.test(r)));
  assert.doesNotMatch(JSON.stringify(data), /SECRET_ALPHA_JOURNAL_BODY/);
  assert.doesNotMatch(JSON.stringify(data), /SECRET_BETA_JOURNAL_BODY/);
});

test("pulse does not concatenate journals", () => {
  const home = tempHome();
  const a = initRepo(home, { origin: "git@github.com:afaraha8403/one.git", name: "one" });
  const b = initRepo(home, { origin: "git@github.com:afaraha8403/two.git", name: "two" });
  mental(home, a.root, ["journal", "--json", "--title", "One", "--body", "ONE_FULL_SECTION_TEXT", "--resume", "one — open loops: none"]);
  mental(home, b.root, ["journal", "--json", "--title", "Two", "--body", "TWO_FULL_SECTION_TEXT", "--resume", "two — open loops: none"]);
  const raw = mental(home, a.root, ["pulse", "--json"]).stdout;
  assert.doesNotMatch(raw, /ONE_FULL_SECTION_TEXT/);
  assert.doesNotMatch(raw, /TWO_FULL_SECTION_TEXT/);
  assert.doesNotMatch(raw, /One\s+Two|Two\s+One/);
});

test("heartbeat --json has counts, no notes dump", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(
    mental(home, root, ["journal", "--json", "--title", "Counts", "--resume", "Check counts — open loops: none"]),
    "journal",
  );
  parseOk(
    mental(home, root, ["attention", "--json", "--title", "A residue", "--kind", "concern"]),
    "attention",
  );
  parseOk(mental(home, root, ["decide", "--json", "--title", "An open fork"]), "decide");
  parseOk(mental(home, root, ["note", "--json", "--title", "A durable fact", "--body", "NOTE_BODY_MUST_NOT_APPEAR"]), "note");

  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat counts");
  assert.equal(typeof hb.attentionCount, "number");
  assert.equal(typeof hb.openDecisionCount, "number");
  assert.equal(hb.attentionCount, 1);
  assert.equal(hb.openDecisionCount, 1);
  assert.ok(Array.isArray(hb.attention));
  assert.ok(Array.isArray(hb.openDecisions));
  assert.equal(hb.notes, undefined);
  assert.ok(hb.delta);
  assert.equal(typeof hb.delta.writes, "number");
  assert.equal(typeof hb.delta.attention, "number");
  assert.equal(typeof hb.delta.decisions, "number");
  assert.equal(hb.delta.titles, undefined);
  assert.doesNotMatch(JSON.stringify(hb), /NOTE_BODY_MUST_NOT_APPEAR/);
});

test("heartbeat does not create watermark", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "No watermark from heartbeat");
  const hb = mental(home, root, ["heartbeat", "--json"]);
  assert.equal(hb.status, 0, hb.stderr || hb.stdout);
  assert.equal(existsSync(watermarkPath(home, where.id)), false);
});

test("pulse writes watermark; later attention increments pulse.delta.attention", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Watermark seed");
  const first = parseOk(mental(home, root, ["pulse", "--json"]), "pulse #1");
  assert.equal(existsSync(watermarkPath(home, where.id)), true);
  assert.ok(first.delta);
  assert.equal(typeof first.delta.since, "string");

  parseOk(
    mental(home, root, ["attention", "--json", "--title", "New residue after pulse", "--kind", "thread"]),
    "attention after pulse",
  );
  const second = parseOk(mental(home, root, ["pulse", "--json"]), "pulse #2");
  assert.equal(second.delta.attention, 1);
  assert.ok(second.delta.writes >= 1);
});

test("heartbeat after pulse shows delta.writes for new journal", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root, "Before pulse");
  parseOk(mental(home, root, ["pulse", "--json"]), "pulse");
  parseOk(
    mental(home, root, [
      "journal",
      "--json",
      "--title",
      "After pulse",
      "--resume",
      "Delta should see this write — open loops: none",
    ]),
    "journal after pulse",
  );
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat delta");
  assert.ok(hb.delta.writes >= 1, JSON.stringify(hb.delta));
});

test("9 open attention → JSON length ≤ 7, attentionCount === 9", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Cap attention");
  for (let i = 1; i <= 9; i++) {
    writeOkf(
      where.root,
      `attention/2026-08-27-cap-air-${i}.md`,
      {
        type: "Attention",
        title: `Air ${i}`,
        description: `Air ${i}`,
        tags: [],
        timestamp: new Date(2026, 7, 27, 10, i).toISOString(),
        status: "open",
        kind: "concern",
      },
      `# Air ${i}\n\ncap\n`,
    );
  }
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat cap attention");
  assert.equal(hb.attentionCount, 9);
  assert.ok(hb.attention.length <= 7);
  assert.equal(hb.attention.length, 7);
});

test("9 open decisions → JSON length ≤ 7, openDecisionCount === 9", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Cap decisions");
  for (let i = 1; i <= 9; i++) {
    writeOkf(
      where.root,
      `decisions/2026-08-27-cap-fork-${i}.md`,
      {
        type: "Decision",
        title: `Fork ${i}`,
        description: `Fork ${i}`,
        tags: [],
        timestamp: new Date(2026, 7, 27, 10, i).toISOString(),
        status: "open",
      },
      `# Fork ${i}\n\ncap\n`,
    );
  }
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat cap decisions");
  assert.equal(hb.openDecisionCount, 9);
  assert.ok(hb.openDecisions.length <= 7);
  assert.equal(hb.openDecisions.length, 7);
});

test("formatHeartbeat (+N more) for decisions", () => {
  const decisions = Array.from({ length: DECISION_HEARTBEAT_CAP + 2 }, (_, i) => ({
    status: "open",
    title: `Fork ${i + 1}`,
  }));
  const text = formatHeartbeat(
    {
      git: { branch: "main", dirty: false, recent: [] },
      gitRoot: "/tmp/repo",
      handoff: { resume: "Cap decisions — open loops: none", outcome: "Cap", file: null, when: null },
      against: null,
      attention: [],
      openDecisions: decisions,
    },
    new Date(2026, 7, 25),
  );
  assert.match(text, /\[open\] Fork 1/);
  assert.match(text, /\[open\] Fork 7/);
  assert.doesNotMatch(text, /\[open\] Fork 8/);
  assert.match(text, /\(\+2 more\)/);
});

function doctorCheck(data, id) {
  const c = data.checks.find((x) => x.id === id);
  assert.ok(c, `missing doctor check ${id}: ${data.checks.map((x) => x.id).join(",")}`);
  return c;
}

test("doctor warns stale attention; exit 0 if only warns", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Stale air");
  writeOkf(
    where.root,
    "attention/2026-01-01-stale-air.md",
    {
      type: "Attention",
      title: "Old residue",
      description: "Old residue",
      tags: [],
      timestamp: "2026-01-01T12:00:00.000Z",
      status: "open",
      kind: "concern",
    },
    "# Old residue\n\nstale\n",
  );
  const r = mental(home, root, ["doctor", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const data = JSON.parse(r.stdout).data;
  const check = doctorCheck(data, "stale-attention");
  assert.equal(check.ok, false);
  assert.equal(check.level, "warn");
  assert.match(check.message, /Old residue|14/);
});

test("doctor warns stale decision; exit 0 if only warns", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Stale fork");
  writeOkf(
    where.root,
    "decisions/2026-01-01-stale-fork.md",
    {
      type: "Decision",
      title: "Old fork",
      description: "Old fork",
      tags: [],
      timestamp: "2026-01-01T12:00:00.000Z",
      status: "open",
    },
    "# Old fork\n\nstale\n",
  );
  const r = mental(home, root, ["doctor", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const data = JSON.parse(r.stdout).data;
  const check = doctorCheck(data, "stale-decision");
  assert.equal(check.ok, false);
  assert.equal(check.level, "warn");
  assert.match(check.message, /Old fork|14/);
});

test("doctor warns decision budget; exit 0 if only warns", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const where = seedBundle(home, root, "Budget");
  for (let i = 1; i <= 8; i++) {
    writeOkf(
      where.root,
      `decisions/2026-08-27-budget-${i}.md`,
      {
        type: "Decision",
        title: `Budget fork ${i}`,
        description: `Budget fork ${i}`,
        tags: [],
        timestamp: new Date().toISOString(),
        status: i === 8 ? "deferred" : "open",
      },
      `# Budget fork ${i}\n\nbudget\n`,
    );
  }
  const r = mental(home, root, ["doctor", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const data = JSON.parse(r.stdout).data;
  const check = doctorCheck(data, "decision-budget");
  assert.equal(check.ok, false);
  assert.equal(check.level, "warn");
  assert.match(check.message, /8|7/);
});

test("MCP tools park, handoff, pulse exist", () => {
  const listed = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {});
  for (const name of ["park", "handoff", "pulse"]) {
    assert.ok(listed.result.tools.some((t) => t.name === name), `missing MCP tool: ${name}`);
  }

  const home = tempHome();
  const { root } = initRepo(home);
  const ctx = { cwd: root, home, env: gitEnv(home), dir: null };

  const parked = runTool("park", { resume: "MCP park next — open loops: none" }, ctx);
  assert.equal(parked.code, 0, JSON.stringify(parked.body));
  assert.equal(parked.body.ok, true);
  assert.match(parked.body.data.heartbeat.handoff.resume, /MCP park next/);

  const handed = runTool("handoff", { title: "MCP handoff", resume: "MCP handoff next — open loops: none" }, ctx);
  assert.equal(handed.code, 0, JSON.stringify(handed.body));
  assert.equal(handed.body.ok, true);

  const pulsed = runTool("pulse", {}, ctx);
  assert.equal(pulsed.code, 0, JSON.stringify(pulsed.body));
  assert.equal(pulsed.body.ok, true);
  assert.ok(Array.isArray(pulsed.body.data.projects));
});

test("heartbeat payload stays small (no notes array)", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seedBundle(home, root, "Small payload");
  for (let i = 1; i <= 5; i++) {
    parseOk(mental(home, root, ["note", "--json", "--title", `Fact ${i}`, "--body", `long note body ${i} `.repeat(40)]), `note ${i}`);
  }
  const r = mental(home, root, ["heartbeat", "--json"]);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.notes, undefined);
  assert.ok(!("notes" in body.data));
  const n = Buffer.byteLength(r.stdout, "utf8");
  assert.ok(n < 8000, `heartbeat JSON too large (${n} bytes)`);
});
