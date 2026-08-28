import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../bin/cli.mjs";
import { formatHeartbeat, ATTENTION_HEARTBEAT_CAP } from "../bin/lib/heartbeat.mjs";
import { parseFrontmatter, repoRelativePath } from "../bin/lib/okf.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

function captureStdout() {
  let buf = "";
  return {
    buf: () => buf,
    stdout: {
      isTTY: false,
      write(chunk) {
        buf += chunk;
        return true;
      },
    },
  };
}

test("repoRelativePath rejects escapes", () => {
  assert.equal(repoRelativePath("PLAN.md"), "PLAN.md");
  assert.equal(repoRelativePath("./docs/plan.md"), "docs/plan.md");
  assert.equal(repoRelativePath("../etc/passwd"), null);
  assert.equal(repoRelativePath("/abs"), null);
  assert.equal(repoRelativePath(""), undefined);
});

test("attention --json writes residue that status and heartbeat list", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const a = mental(home, root, [
    "attention",
    "--json",
    "--title",
    "Tom said ship the pointer",
    "--kind",
    "direction",
    "--from",
    "Tom",
    "--body",
    "Do not ingest the meeting dump.",
  ]);
  assert.equal(a.status, 0, a.stderr || a.stdout);
  const wrote = JSON.parse(a.stdout);
  assert.equal(wrote.ok, true);
  assert.equal(wrote.data.updated, false);
  assert.match(wrote.data.path, /^attention\/\d{4}-\d{2}-\d{2}-tom-said-ship-the-pointer\.md$/);

  const md = readFileSync(join(wrote.data.root, wrote.data.path), "utf8");
  const { data } = parseFrontmatter(md);
  assert.equal(data.type, "Attention");
  assert.equal(data.kind, "direction");
  assert.equal(data.status, "open");
  assert.equal(data.from, "Tom");

  const s = mental(home, root, ["status", "--json"]);
  assert.equal(s.status, 0, s.stderr || s.stdout);
  const st = JSON.parse(s.stdout);
  assert.equal(st.data.attention.length, 1);
  assert.equal(st.data.attention[0].title, "Tom said ship the pointer");
  assert.equal(st.data.attention[0].kind, "direction");
  assert.match(readFileSync(join(st.data.root, "status", "current.md"), "utf8"), /In the air/);

  const hb = mental(home, root, ["heartbeat", "--json"]);
  assert.equal(hb.status, 0, hb.stderr || hb.stdout);
  const pulse = JSON.parse(hb.stdout);
  assert.equal(pulse.ok, true);
  assert.equal(pulse.data.attention.length, 1);
  assert.equal(pulse.data.attention[0].title, "Tom said ship the pointer");
});

test("attention --status resolved updates by title and drops from heartbeat", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, [
    "attention",
    "--json",
    "--title",
    "Park the concern",
    "--kind",
    "concern",
    "--status",
    "later",
  ]);
  const closed = mental(home, root, [
    "attention",
    "--json",
    "--title",
    "Park the concern",
    "--status",
    "resolved",
  ]);
  assert.equal(closed.status, 0, closed.stderr || closed.stdout);
  const body = JSON.parse(closed.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.updated, true);

  const hb = JSON.parse(mental(home, root, ["heartbeat", "--json"]).stdout);
  assert.equal(hb.data.attention.length, 0);

  const listed = JSON.parse(mental(home, root, ["list", "--json", "--type", "Attention"]).stdout);
  assert.equal(listed.data.items.length, 1);
  assert.equal(listed.data.items[0].status, "resolved");
});

test("attention --path updates the named file", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const created = JSON.parse(
    mental(home, root, [
      "attention",
      "--json",
      "--title",
      "Unfinished thread",
      "--kind",
      "thread",
    ]).stdout,
  );
  const path = created.data.path;
  const r = mental(home, root, ["attention", "--json", "--path", path, "--against", "PLAN.md"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const md = readFileSync(join(created.data.root, path), "utf8");
  assert.equal(parseFrontmatter(md).data.against, "PLAN.md");
  assert.equal(parseFrontmatter(md).data.status, "open");
});

test("attention create requires --kind; against escapes fail", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const noKind = mental(home, root, ["attention", "--json", "--title", "Nope"]);
  assert.equal(noKind.status, 2);
  assert.match(noKind.stdout, /--kind/);

  const bad = mental(home, root, [
    "attention",
    "--json",
    "--title",
    "Nope",
    "--kind",
    "concern",
    "--against",
    "../secret",
  ]);
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /against/);
});

test("journal --against binds resume; heartbeat prints Against", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const j = mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Pointer not dump",
    "--resume",
    "Read PLAN.md remaining — open loops: none",
    "--against",
    "PLAN.md",
  ]);
  assert.equal(j.status, 0, j.stderr || j.stdout);
  const wrote = JSON.parse(j.stdout);
  assert.equal(wrote.data.against, "PLAN.md");
  const section = readFileSync(join(wrote.data.root, wrote.data.path), "utf8");
  assert.match(section, /^Against: PLAN.md$/m);

  const st = JSON.parse(mental(home, root, ["status", "--json"]).stdout);
  assert.equal(st.data.against, "PLAN.md");

  const cap = captureStdout();
  cap.stdout.isTTY = true;
  const code = await run([], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: cap.stdout,
    isTTY: true,
  });
  assert.equal(code, 0);
  assert.match(cap.buf(), /Against PLAN.md/);
  assert.match(cap.buf(), /In the air/);
  assert.match(cap.buf(), /Unsettled/);
});

test("heartbeat --json works non-TTY (cheap agent reload)", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Cheap pulse", "--resume", "Use heartbeat --json — open loops: none"]);
  const r = mental(home, root, ["heartbeat", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.match(body.data.handoff.resume, /Use heartbeat --json/);
  assert.ok(Array.isArray(body.data.attention));
  assert.ok(Array.isArray(body.data.openDecisions));
});

test("formatHeartbeat caps In the air at 7", () => {
  const attention = Array.from({ length: ATTENTION_HEARTBEAT_CAP + 2 }, (_, i) => ({
    status: "open",
    kind: "concern",
    title: `Item ${i + 1}`,
  }));
  const text = formatHeartbeat(
    {
      git: { branch: "main", dirty: false, recent: [] },
      gitRoot: "/tmp/repo",
      handoff: { resume: "Keep going — open loops: none", outcome: "Cap check", file: null, when: null },
      against: null,
      attention,
      openDecisions: [],
    },
    new Date(2026, 7, 25),
  );
  assert.match(text, /\[concern\] Item 1/);
  assert.match(text, /\[concern\] Item 7/);
  assert.doesNotMatch(text, /\[concern\] Item 8/);
  assert.match(text, /\(\+2 more\)/);
  assert.match(text, /Unsettled/);
});

test("transcript-shaped extract writes residue not a journal dump", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const transcript = "Tom: please ship the pointer not the dump. Also worried about hooks-on-by-default. Park the MCP discussion.";
  const items = [
    ["Tom said pointer not dump", "direction", "Tom"],
    ["Hooks stay off by default", "concern", ""],
    ["MCP discussion later", "concern", ""],
  ];
  for (const [title, kind, from] of items) {
    const args = ["attention", "--json", "--title", title, "--kind", kind, "--body", "Extracted from meeting; transcript not stored."];
    if (from) args.push("--from", from);
    if (title.includes("later")) args.push("--status", "later");
    const r = mental(home, root, args);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
  mental(home, root, ["decide", "--json", "--title", "Whether to enable MCP", "--status", "open"]);

  const hb = JSON.parse(mental(home, root, ["heartbeat", "--json"]).stdout);
  assert.equal(hb.data.attention.length, 3);
  assert.equal(hb.data.openDecisions.length, 1);

  const searchDump = JSON.parse(mental(home, root, ["search", "--json", transcript.slice(0, 24)]).stdout);
  assert.equal(searchDump.data.hits.some((h) => h.type === "Journal" && /Tom: please ship/.test(h.title)), false);

  const found = JSON.parse(mental(home, root, ["search", "--json", "pointer not dump"]).stdout);
  assert.ok(found.data.hits.some((h) => h.type === "Attention"));
});

test("usage does not mention todo", () => {
  const home = tempHome();
  const r = mental(home, home, ["--help"]);
  assert.doesNotMatch(r.stdout, /\btodo\b/i);
  assert.match(r.stdout, /attention/i);
  assert.match(r.stdout, /heartbeat/i);
});
