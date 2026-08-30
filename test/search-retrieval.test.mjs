import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mental, initRepo, tempHome, gitEnv } from "./helpers.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { handle, runTool } from "../bin/lib/mcp.mjs";

function writeConcept(bundle, rel, data, body) {
  const abs = join(bundle, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

test("search --type still finds a Decision among 50 matching Notes", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const seeded = mental(home, root, ["journal", "--json", "--title", "Seed retrieval", "--resume", "Continue"]);
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
  const bundle = JSON.parse(seeded.stdout).data.root;

  for (let i = 0; i < 50; i++) {
    writeConcept(
      bundle,
      `notes/pad-${i}.md`,
      { type: "Note", title: `Pad ${i}`, status: "active", tags: [] },
      `padding about the needleword in note ${i}\n`,
    );
  }
  writeConcept(
    bundle,
    "decisions/the-needle.md",
    { type: "Decision", title: "Keep needleword as the signal", status: "open", tags: [] },
    "needleword is the decision.\n",
  );
  const idx = mental(home, root, ["reindex", "--json"]);
  assert.equal(idx.status, 0, idx.stderr || idx.stdout);

  const r = mental(home, root, ["search", "--json", "needleword", "--type", "Decision"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.ok(body.data.hits.length >= 1, JSON.stringify(body.data.hits));
  assert.ok(body.data.hits.every((h) => h.type === "Decision"));
  assert.ok(body.data.hits.some((h) => h.path === "decisions/the-needle.md"));
  assert.ok(body.data.hits[0].snippet);
});

test("search ranks a title match above a buried body mention", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const seeded = mental(home, root, ["journal", "--json", "--title", "Seed rank", "--resume", "Continue"]);
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
  const bundle = JSON.parse(seeded.stdout).data.root;
  writeConcept(
    bundle,
    "notes/title-hit.md",
    { type: "Note", title: "AlphaRankToken", status: "active", tags: [] },
    "short body\n",
  );
  writeConcept(
    bundle,
    "notes/buried-hit.md",
    { type: "Note", title: "Unrelated padding document", status: "active", tags: [] },
    `${"lorem ".repeat(400)}AlphaRankToken once at the end\n`,
  );
  assert.equal(mental(home, root, ["reindex", "--json"]).status, 0);

  const r = mental(home, root, ["search", "--json", "AlphaRankToken"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.tokens, ["alpharanktoken"]);
  assert.equal(body.data.op, "and");
  const notes = body.data.hits.filter((h) => h.type === "Note");
  assert.ok(notes.length >= 2, JSON.stringify(notes));
  assert.equal(notes[0].path, "notes/title-hit.md");
  assert.match(notes[0].snippet, /AlphaRankToken/i);
});

test("search JSON echoes AND tokens for a multi-word query", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]).status, 0);
  const r = mental(home, root, ["search", "--json", "pill leftover overlay"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.tokens, ["pill", "leftover", "overlay"]);
  assert.equal(body.data.op, "and");
});

test("list --kind and description; search --kind", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(
    mental(home, root, [
      "attention",
      "--json",
      "--title",
      "Ship the pointer",
      "--kind",
      "direction",
      "--from",
      "Tom",
    ]).status,
    0,
  );
  assert.equal(
    mental(home, root, ["attention", "--json", "--title", "YAML envelope worry", "--kind", "concern"]).status,
    0,
  );
  const note = mental(home, root, [
    "note",
    "--json",
    "--title",
    "UUID fact",
    "--description",
    "Identity lives in bindings.json",
    "--body",
    "Do not use the folder path as id.",
  ]);
  assert.equal(note.status, 0, note.stderr || note.stdout);

  const listed = JSON.parse(mental(home, root, ["list", "--json", "--kind", "direction"]).stdout);
  assert.equal(listed.ok, true);
  assert.ok(listed.data.items.length >= 1);
  assert.ok(listed.data.items.every((i) => i.kind === "direction"));
  assert.ok(listed.data.items.every((i) => i.type === "Attention"));

  const all = JSON.parse(mental(home, root, ["list", "--json", "--type", "Note"]).stdout);
  const uuid = all.data.items.find((i) => i.title === "UUID fact");
  assert.ok(uuid);
  assert.equal(uuid.description, "Identity lives in bindings.json");

  const found = JSON.parse(mental(home, root, ["search", "--json", "pointer", "--kind", "direction"]).stdout);
  assert.equal(found.ok, true);
  assert.ok(found.data.hits.every((h) => h.kind === "direction"));
  assert.ok(found.data.hits.some((h) => /Ship the pointer/.test(h.title)));
});

test("show --json includes backlinks from other concepts", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const d = mental(home, root, ["decide", "--json", "--title", "Chosen approach", "--body", "We stay on CLI JSON."]);
  assert.equal(d.status, 0, d.stderr || d.stdout);
  const path = JSON.parse(d.stdout).data.path;
  const n = mental(home, root, [
    "note",
    "--json",
    "--title",
    "See the decision",
    "--body",
    `Follow [${path}](${path}).`,
  ]);
  assert.equal(n.status, 0, n.stderr || n.stdout);

  const shown = JSON.parse(mental(home, root, ["show", path, "--json"]).stdout);
  assert.equal(shown.ok, true);
  assert.ok(Array.isArray(shown.data.backlinks));
  assert.ok(
    shown.data.backlinks.some((b) => b.path.startsWith("notes/") && b.title === "See the decision"),
    JSON.stringify(shown.data.backlinks),
  );
});

test("MCP list tool and search type filter; tool JSON is compact", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "MCP retrieval seed", "--resume", "Continue"]);
  mental(home, root, ["decide", "--json", "--title", "MCP filter decision", "--body", "Keep typed filters."]);
  mental(home, root, ["note", "--json", "--title", "MCP filter note", "--body", "A note about filters."]);

  const listed = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {});
  assert.ok(listed.result.tools.some((t) => t.name === "list"));
  const searchTool = listed.result.tools.find((t) => t.name === "search");
  assert.ok(searchTool.inputSchema.properties.type);

  const ctx = { cwd: root, home, env: gitEnv(home), dir: null };

  const filtered = runTool("search", { q: "filter", type: "Decision" }, ctx);
  assert.equal(filtered.code, 0, JSON.stringify(filtered.body));
  assert.equal(filtered.body.ok, true);
  assert.ok(filtered.body.data.hits.every((h) => h.type === "Decision"));

  const listedItems = runTool("list", { type: "Note" }, ctx);
  assert.equal(listedItems.code, 0, JSON.stringify(listedItems.body));
  assert.equal(listedItems.body.ok, true);
  assert.ok(listedItems.body.data.items.every((i) => i.type === "Note"));

  const call = handle(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "list", arguments: { type: "Decision" } },
    },
    ctx,
  );
  const text = call.result.content[0].text;
  assert.equal(text.includes("\n"), false, "MCP tool JSON should be minified");
  const parsed = JSON.parse(text);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.data.items.every((i) => i.type === "Decision"));
});

test("journal hops index as path#HH:MM; show returns that section", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(
    mental(home, root, [
      "journal",
      "--json",
      "--title",
      "Restore defaults copy",
      "--body",
      "Try step Super leftover is RestoreDefaultsToken with no explainer.",
      "--resume",
      "Continue",
    ]).status,
    0,
  );
  assert.equal(
    mental(home, root, [
      "journal",
      "--json",
      "--title",
      "compositing-off kills HUD",
      "--body",
      "DMABuf CompositingOffToken toggles were dead ends.",
      "--resume",
      "Continue",
    ]).status,
    0,
  );

  const listed = JSON.parse(mental(home, root, ["list", "--json", "--type", "Journal"]).stdout);
  assert.ok(listed.data.items.every((i) => !i.path.includes("#")), JSON.stringify(listed.data.items));
  assert.equal(listed.data.items.length, 1);

  const found = JSON.parse(mental(home, root, ["search", "--json", "RestoreDefaultsToken"]).stdout);
  assert.equal(found.ok, true);
  const hit = found.data.hits.find((h) => h.type === "Journal");
  assert.ok(hit, JSON.stringify(found.data.hits));
  assert.match(hit.path, /journal\/\d{4}-\d{2}-\d{2}\.md#/);
  assert.match(hit.snippet, /RestoreDefaultsToken/);
  assert.doesNotMatch(hit.snippet, /CompositingOffToken/);

  const shown = JSON.parse(mental(home, root, ["show", hit.path, "--json"]).stdout);
  assert.equal(shown.ok, true);
  assert.equal(shown.data.path, hit.path);
  assert.match(shown.data.body, /RestoreDefaultsToken/);
  assert.doesNotMatch(shown.data.body, /CompositingOffToken/);
});

test("search --any ORs tokens; Decision ranks above Journal", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(
    mental(home, root, [
      "journal",
      "--json",
      "--title",
      "Unrelated hop",
      "--body",
      "Only LeftoverOnlyToken lives in this hop.",
      "--resume",
      "Continue",
    ]).status,
    0,
  );
  assert.equal(
    mental(home, root, [
      "decide",
      "--json",
      "--title",
      "Keep RankBoostToken as the signal",
      "--body",
      "RankBoostToken is the decision, not a journal aside.",
    ]).status,
    0,
  );
  assert.equal(
    mental(home, root, ["note", "--json", "--title", "OverlayOnlyToken fact", "--body", "OverlayOnlyToken in a note."]).status,
    0,
  );

  const andMiss = JSON.parse(mental(home, root, ["search", "--json", "LeftoverOnlyToken OverlayOnlyToken"]).stdout);
  assert.equal(andMiss.data.hits.length, 0, JSON.stringify(andMiss.data.hits));

  const any = JSON.parse(mental(home, root, ["search", "--json", "LeftoverOnlyToken OverlayOnlyToken", "--any"]).stdout);
  assert.equal(any.data.op, "or");
  assert.ok(any.data.hits.some((h) => /LeftoverOnlyToken/.test(h.snippet || h.title)));
  assert.ok(any.data.hits.some((h) => /OverlayOnlyToken/.test(h.title)));

  const ranked = JSON.parse(mental(home, root, ["search", "--json", "RankBoostToken"]).stdout);
  assert.ok(ranked.data.hits.length >= 1);
  assert.equal(ranked.data.hits[0].type, "Decision");
});

test("MCP search q array is a union", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "MCP retrieval seed", "--resume", "Continue"]);
  mental(home, root, ["decide", "--json", "--title", "MCP filter decision", "--body", "Keep typed filters."]);
  mental(home, root, ["note", "--json", "--title", "UUID fact", "--body", "IdentityUuidToken lives here."]);
  const ctx = { cwd: root, home, env: gitEnv(home), dir: null };

  const listed = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {});
  const searchTool = listed.result.tools.find((t) => t.name === "search");
  assert.ok(searchTool.inputSchema.properties.q.anyOf);

  const union = runTool("search", { q: ["filter", "IdentityUuidToken"] }, ctx);
  assert.equal(union.code, 0, JSON.stringify(union.body));
  assert.equal(union.body.data.op, "or");
  assert.ok(union.body.data.hits.some((h) => h.type === "Decision"));
  assert.ok(union.body.data.hits.some((h) => /IdentityUuidToken/.test(h.snippet || h.title || "")));
});

