import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { git, gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { parseFrontmatter, stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { redactForModel, redactText } from "../bin/lib/redact.mjs";
import { NETWORK_ALLOWLIST } from "../bin/lib/network.mjs";
import { searchBundle } from "../bin/lib/index.mjs";
import { PKG_ROOT } from "../bin/lib/pkg.mjs";

function parseOk(r, label = "mental") {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${JSON.stringify(body.error || body)}`);
  return body;
}

function parseBody(r) {
  return JSON.parse(r.stdout);
}

function parseErr(r, label = "mental") {
  assert.notEqual(r.status, 0, `${label} should fail: ${r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false, label);
  return body;
}

function bundleFile(home, root, rel) {
  const where = parseOk(mental(home, root, ["where", "--json"]), "where");
  return readFileSync(join(where.data.root, rel), "utf8");
}

test("frontmatter round-trips hash, colon, brackets, and quotes", () => {
  const data = {
    title: 'Fix C# build #12',
    description: "choice: keep it",
    status: "[draft]",
    note: 'he said "ship"',
  };
  const parsed = parseFrontmatter(stringifyFrontmatter(data, "body\n"));
  assert.equal(parsed.data.title, data.title);
  assert.equal(parsed.data.description, data.description);
  assert.equal(parsed.data.status, data.status);
  assert.equal(parsed.data.note, data.note);
});

test("a newline in a title is a usage error and does not write", () => {
  const home = tempHome("mental-nl-");
  const repo = initRepo(home);
  const r = mental(home, repo.root, ["journal", "--json", "--title", "one\ntwo", "--resume", "next", "--body", "status: resolved"]);
  const err = parseErr(r, "newline title");
  assert.equal(err.error.code, "usage");
  const where = mental(home, repo.root, ["where", "--json"]);
  if (where.status === 0 && JSON.parse(where.stdout).data?.root) {
    const day = join(JSON.parse(where.stdout).data.root, "journal");
    assert.equal(readdirSync(day).filter((n) => n.endsWith(".md")).length, 0);
  }
});

test("resolved attention reopens when recorded again without --status", () => {
  const home = tempHome("mental-reopen-");
  const repo = initRepo(home);
  parseOk(
    mental(home, repo.root, ["attention", "--json", "--title", "Come back", "--kind", "thread", "--status", "resolved", "--tag", "loop"]),
    "resolve",
  );
  const again = parseOk(
    mental(home, repo.root, ["attention", "--json", "--title", "Come back", "--kind", "thread", "--tag", "loop"]),
    "reopen",
  );
  assert.equal(again.data.reopened, true);
  assert.equal(again.data.status, "open");
});

test("a ## heading inside a journal body does not become the next hop", () => {
  const home = tempHome("mental-heading-");
  const repo = initRepo(home);
  const written = parseOk(
    mental(home, repo.root, ["journal", "--json", "--title", "Landed", "--resume", "Ship the notes", "--body", "prose\n## Hidden heading\nmore"]),
    "journal",
  );
  const text = bundleFile(home, repo.root, written.data.path.split("#")[0]);
  assert.match(text, /^### Hidden heading$/m);
  assert.doesNotMatch(text, /^## Hidden heading$/m);
  assert.equal(text.split(/^## /m).length, 2);
});

test("writes redact credentials and keep slugs, shas, and uuids", () => {
  const slug = "heartbeat-only-no-standing-tui-decision";
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const uuid = "11111111-2222-4333-8444-555555555555";
  assert.equal(redactText(`see ${slug} ${sha} ${uuid}`).text, `see ${slug} ${sha} ${uuid}`);
  assert.match(redactText("ghp_abcdefghijklmnopqrstuvwxyz").text, /\[REDACTED:github\]/);
  assert.equal(redactForModel("path heartbeat-only-no-standing-tui-decision"), `path ${slug}`);
  assert.match(redactForModel("ghp_abcdefghijklmnopqrstuvwxyz"), /\[REDACTED\]/);
  assert.doesNotMatch(redactForModel("ghp_abcdefghijklmnopqrstuvwxyz"), /REDACTED:/);

  const home = tempHome("mental-redact-");
  const repo = initRepo(home);
  writeFileSync(join(repo.root, ".env"), "API_KEY=supersecretvalue\n");
  const written = parseOk(
    mental(home, repo.root, [
      "journal",
      "--json",
      "--title",
      "Secrets stay local",
      "--resume",
      "Rotate the key",
      "--body",
      `token ghp_abcdefghijklmnopqrstuvwxyz env supersecretvalue ${slug} ${sha}`,
    ]),
    "redact write",
  );
  const text = bundleFile(home, repo.root, written.data.path.split("#")[0]);
  assert.match(text, /\[REDACTED:github\]/);
  assert.match(text, /\[REDACTED:env\]/);
  assert.match(text, new RegExp(slug));
  assert.match(text, new RegExp(sha));
  assert.doesNotMatch(text, /ghp_/);
  assert.doesNotMatch(text, /supersecretvalue/);

  const kept = parseOk(
    mental(home, repo.root, [
      "journal",
      "--json",
      "--no-redact",
      "--title",
      "Escape",
      "--resume",
      "Keep the sample",
      "--body",
      "ghp_abcdefghijklmnopqrstuvwxyz",
    ]),
    "no-redact",
  );
  assert.equal(kept.data.redact, false);
  const raw = bundleFile(home, repo.root, kept.data.path.split("#")[0]);
  assert.match(raw, /ghp_abcdefghijklmnopqrstuvwxyz/);
});

test("search uses the same prefix on sqlite and the file scan", () => {
  const home = tempHome("mental-search-");
  const repo = initRepo(home);
  parseOk(mental(home, repo.root, ["note", "--json", "--title", "Alphabet soup", "--tag", "words", "--body", "title hit"]), "title");
  parseOk(mental(home, repo.root, ["note", "--json", "--title", "Other note", "--tag", "words", "--body", "the alphabet sits in the body"]), "body");
  const where = parseOk(mental(home, repo.root, ["where", "--json"]), "where");
  const midSql = searchBundle({ root: where.data.root, id: where.data.id, home, env: gitEnv(home), q: "lphab" });
  const midScan = searchBundle({ root: where.data.root, q: "lphab" });
  assert.deepEqual(midSql.hits.map((h) => h.path), midScan.hits.map((h) => h.path));
  assert.equal(midSql.hits.length, 0);
  const prefixSql = searchBundle({ root: where.data.root, id: where.data.id, home, env: gitEnv(home), q: "alpha" });
  const prefixScan = searchBundle({ root: where.data.root, q: "alpha" });
  assert.deepEqual(
    prefixSql.hits.map((h) => h.path).sort(),
    prefixScan.hits.map((h) => h.path).sort(),
  );
  assert.equal(prefixSql.hits.length, 2);
  assert.equal(prefixSql.hits[0].title, "Alphabet soup");

  const file = prefixSql.hits.find((h) => h.title === "Other note");
  const abs = join(where.data.root, file.path);
  writeFileSync(abs, readFileSync(abs, "utf8") + "\noutsidewordzz\n");
  const fresh = searchBundle({ root: where.data.root, id: where.data.id, home, env: gitEnv(home), q: "outsidewordzz" });
  assert.equal(fresh.hits.length, 1);
});

test("why finds a decision anchored to a dirty path and to that commit", () => {
  const home = tempHome("mental-why-");
  const repo = initRepo(home);
  writeFileSync(join(repo.root, "src.js"), "export const n = 1;\n");
  const decided = parseOk(
    mental(home, repo.root, ["decide", "--json", "--title", "Keep the export", "--body", "Callers depend on the name.", "--tag", "api"]),
    "decide",
  );
  const byPath = parseOk(mental(home, repo.root, ["why", "src.js", "--json"]), "why path");
  assert.ok(byPath.data.hits.some((h) => h.path === decided.data.path));

  git(repo.root, ["add", "src.js"], home);
  git(repo.root, ["commit", "-m", "add src"], home);
  const sha = git(repo.root, ["rev-parse", "HEAD"], home).stdout.trim();
  parseOk(
    mental(home, repo.root, ["decide", "--json", "--title", "Commit anchor", "--body", "This decision sits on HEAD.", "--tag", "api"]),
    "decide head",
  );
  const bySha = parseOk(mental(home, repo.root, ["why", sha, "--json"]), "why sha");
  assert.ok(bySha.data.hits.some((h) => h.title === "Commit anchor"));
  const byLine = parseOk(mental(home, repo.root, ["why", "src.js:1", "--json"]), "why line");
  assert.ok(byLine.data.hits.some((h) => h.title === "Commit anchor" || h.title === "Keep the export"));
});

test("--ref stores an https link and rejects file URLs", () => {
  const home = tempHome("mental-ref-");
  const repo = initRepo(home);
  const bad = parseErr(
    mental(home, repo.root, ["journal", "--json", "--title", "No file url", "--resume", "next", "--ref", "file:///tmp/secret"]),
    "file ref",
  );
  assert.equal(bad.error.code, "usage");
  const written = parseOk(
    mental(home, repo.root, ["journal", "--json", "--title", "Linked", "--resume", "next", "--ref", "https://example.com/session/1"]),
    "https ref",
  );
  const text = bundleFile(home, repo.root, written.data.path.split("#")[0]);
  assert.match(text, /^Ref: https:\/\/example.com\/session\/1$/m);
});

test("handoff --share packs one project and import is idempotent", () => {
  const origin = "git@github.com:acme/widget.git";
  const homeA = tempHome("mental-share-a-");
  const a = initRepo(homeA, { origin, name: "widget" });
  const packed = parseOk(
    mental(homeA, a.root, ["handoff", "--json", "--title", "Shipped the widget", "--resume", "Write the notes", "--share", join(homeA, "out")]),
    "share",
  );
  assert.equal(packed.data.share.personal, false);
  assert.ok(readFileSync(join(homeA, "out", "HANDOFF.md"), "utf8").includes("Shipped the widget") || readFileSync(join(homeA, "out", "HANDOFF.md"), "utf8").includes("Write the notes"));

  const homeB = tempHome("mental-share-b-");
  const b = initRepo(homeB, { origin: "https://github.com/acme/widget.git", name: "widget" });
  parseOk(mental(homeB, b.root, ["journal", "--json", "--title", "Local hop", "--resume", "mine"]), "bind");
  parseOk(mental(homeB, b.root, ["import", join(homeA, "out"), "--json"]), "import");
  const where = parseOk(mental(homeB, b.root, ["where", "--json"]), "where");
  const journalDir = join(where.data.root, "journal");
  const once = readdirSync(journalDir).map((n) => readFileSync(join(journalDir, n), "utf8")).join("\n");
  const firstCount = once.split("Shipped the widget").length - 1;
  parseOk(mental(homeB, b.root, ["import", join(homeA, "out"), "--json"]), "import again");
  const twice = readdirSync(journalDir).map((n) => readFileSync(join(journalDir, n), "utf8")).join("\n");
  assert.equal(twice.split("Shipped the widget").length - 1, firstCount);
  assert.match(twice, /Via: import /);
});

test("trailer hook appends an id and path and chains an existing hook", () => {
  const home = tempHome("mental-trailer-");
  const repo = initRepo(home);
  const hooks = git(repo.root, ["rev-parse", "--git-path", "hooks"], home).stdout.trim();
  const hookDir = hooks.startsWith("/") ? hooks : join(repo.root, hooks);
  mkdirSync(hookDir, { recursive: true });
  writeFileSync(join(hookDir, "prepare-commit-msg"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(hookDir, "prepare-commit-msg"), 0o755);
  parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Before trailer", "--resume", "next"]), "journal");
  parseOk(mental(home, repo.root, ["option", "trailer", "on", "--json"]), "trailer on");
  assert.ok(readFileSync(join(hookDir, "prepare-commit-msg"), "utf8").includes("# mental-trailer"));
  assert.ok(readFileSync(join(hookDir, "prepare-commit-msg.chain"), "utf8").includes("exit 0"));
  const decided = parseOk(
    mental(home, repo.root, ["decide", "--json", "--title", "Ship the trailer", "--body", "The hook records the path only.", "--tag", "git"]),
    "decide",
  );
  const listed = parseOk(mental(home, repo.root, ["trailer", "--json"]), "trailer");
  assert.ok(listed.data.trailers.some((t) => t.endsWith(decided.data.path)));

  const bin = join(home, "bin");
  mkdirSync(bin);
  const cli = join(PKG_ROOT, "bin", "cli.mjs");
  writeFileSync(join(bin, "mental"), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
  chmodSync(join(bin, "mental"), 0o755);
  writeFileSync(join(repo.root, "next.txt"), "x\n");
  git(repo.root, ["add", "next.txt"], home);
  const committed = spawnSync("git", ["-C", repo.root, "commit", "-m", "with trailer"], {
    encoding: "utf8",
    env: { ...gitEnv(home), PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
  assert.equal(committed.status, 0, committed.stderr || committed.stdout);
  const message = git(repo.root, ["log", "-1", "--format=%B"], home).stdout;
  assert.match(message, new RegExp(`Mental-Decision: ${listed.data.trailers[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("doctor reports network rows and a secret scan", () => {
  const home = tempHome("mental-doctor-net-");
  const repo = initRepo(home);
  parseOk(
    mental(home, repo.root, ["journal", "--json", "--no-redact", "--title", "Leaky", "--resume", "next", "--body", "ghp_abcdefghijklmnopqrstuvwxyz"]),
    "leak",
  );
  const before = parseBody(mental(home, repo.root, ["doctor", "--json"]));
  assert.ok(before.data.network.some((row) => row.id === "core" && row.network === false));
  assert.ok(before.data.network.some((row) => row.id === "update-check"));
  assert.ok(Array.isArray(before.data.hosts));
  assert.ok(before.data.checks.some((c) => c.id === "secrets" && c.ok === false));
  const fixed = parseBody(mental(home, repo.root, ["doctor", "--json", "--fix"]));
  assert.ok(fixed.data.checks.some((c) => c.id === "secrets" && c.ok === true));
});

test("skill frontmatter matches the Agent Skills spec", () => {
  const text = readFileSync(join(PKG_ROOT, "skill", "mental", "SKILL.md"), "utf8");
  const fm = text.split("---")[1] || "";
  assert.match(fm, /^name: mental$/m);
  const desc = fm.match(/description:\s*>-\n([\s\S]*?)\nlicense:/);
  assert.ok(desc, "description block");
  const prose = desc[1].replace(/\n\s+/g, " ").trim();
  assert.ok(prose.length > 0 && prose.length <= 1024, `description length ${prose.length}`);
});

test("outbound call sites in bin/ stay on the network allowlist", () => {
  const allowed = new Set([...NETWORK_ALLOWLIST.map((row) => row.file), "bin/lib/network.mjs"]);
  const needles = ["globalThis.fetch", "fetch(", "https.request", "http.request", "spawnNpmView", "node:https"];
  const bin = join(PKG_ROOT, "bin");
  const hits = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      const next = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      if (name.endsWith(".mjs")) {
        const text = readFileSync(next, "utf8");
        if (needles.some((n) => text.includes(n))) hits.push(`bin/${path}`);
      } else {
        try {
          if (readdirSync(next)) walk(next, path);
        } catch {
          // file
        }
      }
    }
  };
  walk(bin, "");
  for (const file of hits) assert.ok(allowed.has(file), `${file} calls the network without an allowlist row`);
  for (const row of NETWORK_ALLOWLIST) {
    assert.ok(hits.includes(row.file), `${row.file} is allowlisted but has no call site`);
    assert.ok(readFileSync(join(PKG_ROOT, row.file), "utf8").includes(row.marker));
  }
});
