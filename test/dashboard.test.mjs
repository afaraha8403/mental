import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { run } from "../bin/cli.mjs";
import { usage } from "../bin/lib/args.mjs";
import { DASHBOARD_PORT, listenDashboard } from "../bin/lib/dashboard.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { watermarkPath } from "../bin/lib/watermark.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

const pkg = createRequire(import.meta.url)("../package.json");

function writeConcept(bundle, rel, data, body) {
  const abs = join(bundle, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, stringifyFrontmatter(data, body));
}

function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

test("TTY no-args heartbeat still exits without starting dashboard", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Heartbeat handoff", "--resume", "Read the heartbeat next"]);
  let buf = "";
  const code = await run([], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: {
      isTTY: true,
      write(chunk) {
        buf += chunk;
        return true;
      },
    },
    isTTY: true,
  });
  assert.equal(code, 0);
  assert.match(buf, /Heartbeat handoff|Read the heartbeat next/);
  assert.doesNotMatch(buf, /Interactive dashboard/);
  assert.doesNotMatch(buf, /127\.0\.0\.1:3847/);
});

test("usage does not mention a standing dashboard", () => {
  assert.doesNotMatch(usage(), /standing dashboard/i);
  assert.match(usage(), /localhost explorer/i);
});

test("listenDashboard binds 127.0.0.1 and serves where", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    fallbackOnBusy: false,
    open: false,
  });
  t.after(() => dash.close());
  assert.equal(dash.server.address().address, "127.0.0.1");
  const res = await fetch(`${dash.url}api/where`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.mode, "home");
});

test("listenDashboard also serves IPv6 loopback when the stack exists", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    fallbackOnBusy: false,
    open: false,
  });
  t.after(() => dash.close());
  let res;
  try {
    res = await fetch(`http://[::1]:${dash.port}/api/where`, {
      headers: { Host: `[::1]:${dash.port}` },
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : "";
    const cause = err && typeof err === "object" && "cause" in err ? err.cause : null;
    const nested = cause && typeof cause === "object" && "code" in cause ? cause.code : "";
    if (code === "EADDRNOTAVAIL" || nested === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT" || nested === "EAFNOSUPPORT") {
      return;
    }
    throw err;
  }
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("default port 3847 falls back when busy; explicit --port does not", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const blocker = await occupyPort(DASHBOARD_PORT);
  t.after(() => new Promise((resolve) => blocker.close(resolve)));
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    open: false,
  });
  t.after(() => dash.close());
  assert.equal(dash.fallback, true);
  assert.notEqual(dash.port, DASHBOARD_PORT);

  await assert.rejects(
    () =>
      listenDashboard({
        cwd: root,
        home,
        env: gitEnv(home),
        port: DASHBOARD_PORT,
        fallbackOnBusy: false,
        open: false,
      }),
    (err) => err && err.code === "EADDRINUSE",
  );
});

test("dashboard glance does not mint bindings.json", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    open: false,
  });
  t.after(() => dash.close());
  await fetch(`${dash.url}api/heartbeat`);
  await fetch(`${dash.url}api/list`);
  await fetch(`${dash.url}api/projects`);
  assert.equal(existsSync(join(home, ".mental", "bindings.json")), false);
});

test("package has no runtime dependencies and ships assets", () => {
  assert.equal(pkg.dependencies, undefined);
  assert.ok(pkg.files.includes("assets"));
});

test("/api/projects does not write a pulse watermark", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const seeded = mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]);
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
  const id = JSON.parse(seeded.stdout).data.id;
  const env = gitEnv(home);
  const wm = watermarkPath(home, id, env);
  assert.equal(existsSync(wm), false);
  const dash = await listenDashboard({ cwd: root, home, env, port: 0, open: false });
  t.after(() => dash.close());
  const res = await fetch(`${dash.url}api/projects`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(existsSync(wm), false);
});

test("POST is 405 and foreign Host is 403", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    open: false,
  });
  t.after(() => dash.close());
  const post = await fetch(`${dash.url}api/journal`, { method: "POST" });
  assert.equal(post.status, 405);
  const forbidden = await new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port: dash.port, path: "/api/where", headers: { Host: "evil.test" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(forbidden, 403);
});

test("list pages past 50 and show returns exact file text", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  const seeded = mental(home, root, ["journal", "--json", "--title", "Seed list", "--resume", "Continue"]);
  assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
  const bundle = JSON.parse(seeded.stdout).data.root;
  for (let i = 0; i < 51; i++) {
    writeConcept(
      bundle,
      `notes/pad-${String(i).padStart(2, "0")}.md`,
      { type: "Note", title: `Pad ${i}`, status: "active", tags: [] },
      `body of pad ${i}\n`,
    );
  }
  writeConcept(
    bundle,
    "notes/linked.md",
    { type: "Note", title: "Linked", status: "active", tags: [] },
    "See [Pad 0](notes/pad-00.md).\n",
  );
  const idx = mental(home, root, ["reindex", "--json"]);
  assert.equal(idx.status, 0, idx.stderr || idx.stdout);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    open: false,
  });
  t.after(() => dash.close());
  const page2 = await fetch(`${dash.url}api/list?type=Note&offset=50&limit=50`);
  const listed = await page2.json();
  assert.equal(page2.status, 200);
  assert.ok(listed.data.total >= 51);
  assert.ok(listed.data.items.length >= 1);
  const shown = await fetch(`${dash.url}api/show?path=notes/pad-00.md`);
  const peek = await shown.json();
  assert.equal(shown.status, 200);
  assert.match(peek.data.text, /body of pad 0/);
  const raw = readFileSync(join(bundle, "notes/pad-00.md"), "utf8");
  assert.equal(peek.data.text, raw);
  const target = await fetch(`${dash.url}api/show?path=notes/pad-00.md`);
  const targetBody = await target.json();
  assert.ok(targetBody.data.backlinks.some((b) => b.path === "notes/linked.md"));
  const graphed = await fetch(`${dash.url}api/graph`);
  const graph = await graphed.json();
  assert.equal(graphed.status, 200);
  assert.ok(graph.data.nodes.some((n) => n.path === "notes/linked.md"));
  assert.ok(graph.data.edges.some((e) => e.from === "notes/linked.md" && e.to === "notes/pad-00.md"));
});

test("track glance is 404 when tracking is off", async (t) => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]);
  const dash = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    open: false,
  });
  t.after(() => dash.close());
  const res = await fetch(`${dash.url}api/track/glance`);
  assert.equal(res.status, 404);
  const html = await fetch(dash.url);
  assert.equal(html.status, 200);
  const page = await html.text();
  assert.match(page, /Mental CLI Dashboard/);
  assert.match(page, /favicon\.png/);
  const icon = await fetch(`${dash.url}favicon.png`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type") || "", /image\/png/);
  const bytes = Buffer.from(await icon.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
});

test("dashboard --help lists the command", async () => {
  const home = tempHome();
  let buf = "";
  const code = await run(["dashboard", "--help"], {
    cwd: home,
    home,
    env: gitEnv(home),
    stdout: {
      write(chunk) {
        buf += chunk;
        return true;
      },
    },
    isTTY: false,
  });
  assert.equal(code, 0);
  assert.match(buf, /mental dashboard/);
  assert.doesNotMatch(buf, /standing dashboard/i);
});
