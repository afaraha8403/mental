/**
 * Research-shaped pulse: verify remainder, hop counts, settled guardrails, --via.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatHeartbeat } from "../bin/lib/heartbeat.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { sanitizeVia } from "../bin/lib/via.mjs";
import { handle, runTool } from "../bin/lib/mcp.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${r.stdout}`);
  return body.data;
}

function whereOf(home, cwd) {
  return parseOk(mental(home, cwd, ["where", "--json"]), "where");
}

function writeOkf(root, rel, data, body) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

test("sanitizeVia rejects fingerprints and accepts short tokens", () => {
  assert.equal(sanitizeVia("cursor"), "cursor");
  assert.equal(sanitizeVia("Claude-Code"), "claude-code");
  assert.equal(sanitizeVia(""), undefined);
  assert.equal(sanitizeVia(null), undefined);
  assert.equal(sanitizeVia("user@host"), null);
  assert.equal(sanitizeVia("https://cursor.com"), null);
  assert.equal(sanitizeVia("a/b"), null);
  assert.equal(sanitizeVia("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), null);
  assert.equal(sanitizeVia("this-token-is-way-too-long-for-via"), null);
});

test("attention --kind verify lands on Needs eyes; cap prefers verify", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed"]), "seed");
  const where = whereOf(home, root);
  for (let i = 1; i <= 7; i++) {
    writeOkf(
      where.root,
      `attention/2026-08-27-z-air-${i}.md`,
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
  parseOk(
    mental(home, root, [
      "attention",
      "--json",
      "--title",
      "Resolver tests not reviewed",
      "--kind",
      "verify",
      "--body",
      "Agent produced tests. Human has not looked.",
    ]),
    "verify",
  );
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat verify");
  assert.equal(hb.needsEyesCount, 1);
  assert.equal(hb.needsEyes[0].title, "Resolver tests not reviewed");
  assert.equal(hb.attention[0].kind, "verify");
  assert.ok(hb.attention.length <= 7);
  const kinds = hb.attention.map((a) => a.kind);
  assert.equal(kinds.filter((k) => k === "verify").length, 1);

  const text = formatHeartbeat(hb, new Date(2026, 7, 27));
  assert.match(text, /Needs eyes/);
  assert.match(text, /\[verify\] Resolver tests not reviewed/);
  assert.match(text, /Hops\s+0/);
});

test("park increments delta.parks; TTY shows Hops; custom title still counts", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(mental(home, root, ["journal", "--json", "--title", "Before"]), "seed");
  parseOk(mental(home, root, ["pulse", "--json"]), "watermark");
  parseOk(
    mental(home, root, [
      "park",
      "--json",
      "--resume",
      "Come back — open loops: none",
      "--title",
      "Hopped to email",
    ]),
    "park custom",
  );
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat hops");
  assert.equal(hb.hopsToday, 1, JSON.stringify({ hopsToday: hb.hopsToday, delta: hb.delta }));
  const text = formatHeartbeat(hb, new Date());
  assert.match(text, /Hops\s+1/);
  const slice = whereOf(home, root).root;
  const journal = readFileSync(join(slice, hb.handoff.file), "utf8");
  assert.match(journal, /^Hop: park$/m);
});

test("decided titles appear as Settled guardrails; open stay Unsettled; no bodies", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(
    mental(home, root, ["decide", "--json", "--title", "Heartbeat only, no standing TUI", "--status", "decided"]),
    "decided",
  );
  parseOk(mental(home, root, ["decide", "--json", "--title", "Still open", "--status", "open"]), "open");
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "heartbeat guardrails");
  assert.equal(hb.guardrailCount, 1);
  assert.equal(hb.guardrails[0].title, "Heartbeat only, no standing TUI");
  assert.equal(hb.guardrails[0].body, undefined);
  assert.equal(hb.openDecisionCount, 1);
  const text = formatHeartbeat(hb, new Date(2026, 7, 27));
  assert.match(text, /Settled/);
  assert.match(text, /Heartbeat only, no standing TUI/);
  assert.match(text, /\[open\] Still open/);
  assert.doesNotMatch(text, /why this choice matters/);
});

test("--via cursor is stored; emails and URLs are usage", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  parseOk(
    mental(home, root, [
      "handoff",
      "--json",
      "--title",
      "Named write",
      "--resume",
      "Next — open loops: none",
      "--via",
      "cursor",
    ]),
    "handoff via",
  );
  const hb = parseOk(mental(home, root, ["heartbeat", "--json"]), "hb via");
  assert.equal(hb.handoff.via, "cursor");
  const slice = whereOf(home, root).root;
  const journal = readFileSync(join(slice, hb.handoff.file), "utf8");
  assert.match(journal, /^Via: cursor$/m);

  const bad = mental(home, root, ["journal", "--json", "--title", "Nope", "--via", "ali@example.com"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /short client token/);

  parseOk(
    mental(home, root, [
      "attention",
      "--json",
      "--title",
      "Needs eyes via",
      "--kind",
      "verify",
      "--via",
      "claude-code",
    ]),
    "attention via",
  );
  const shown = parseOk(
    mental(home, root, [
      "show",
      "--json",
      JSON.parse(mental(home, root, ["list", "--json", "--type", "Attention", "--kind", "verify"]).stdout).data.items[0]
        .path,
    ]),
    "show via",
  );
  assert.equal(shown.frontmatter.via, "claude-code");
});

test("MCP attention kind enum includes verify; via passes through journal", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const listed = handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { cwd: root, home, env: gitEnv(home) });
  const attention = listed.result.tools.find((t) => t.name === "attention");
  assert.ok(attention.inputSchema.properties.kind.enum.includes("verify"));
  assert.ok(listed.result.tools.find((t) => t.name === "journal").inputSchema.properties.via);

  const ctx = { cwd: root, home, env: gitEnv(home) };
  const wrote = runTool("journal", { title: "MCP via", resume: "Go — open loops: none", via: "mcp" }, ctx);
  assert.equal(wrote.body.ok, true, JSON.stringify(wrote.body));
  const hb = runTool("heartbeat", {}, ctx);
  assert.equal(hb.body.data.handoff.via, "mcp");
});
