import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgv, usage } from "../bin/lib/args.mjs";
import { run } from "../bin/cli.mjs";
import { formatHeartbeat, formatWhen } from "../bin/lib/heartbeat.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

function captureStdout() {
  let buf = "";
  return {
    buf: () => buf,
    stdout: {
      isTTY: true,
      write(chunk) {
        buf += chunk;
        return true;
      },
    },
  };
}

test("no args not TTY prints usage exit 2", () => {
  const home = tempHome();
  const r = mental(home, home, []);
  assert.equal(r.status, 2, r.stderr || r.stdout);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /Heartbeat/);
});

test("menu is unknown, not a standing session", () => {
  const home = tempHome();
  const r = mental(home, home, ["menu"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  assert.match(r.stdout, /Unknown command: menu/);
});

test("journal without --title stays usage on TTY and non-TTY", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["journal"]);
  assert.equal(r.status, 1, r.stderr || r.stdout);
  assert.match(r.stdout, /requires --title/);

  const cap = captureStdout();
  const code = await run(["journal"], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: cap.stdout,
    isTTY: true,
  });
  assert.equal(code, 1);
  assert.match(cap.buf(), /requires --title/);
});

test("journal --json still writes without prompting", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["journal", "--json", "--title", "TTY rethink"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.match(body.data.path, /^journal\/\d{4}-\d{2}-\d{2}\.md$/);
});

test("run() no args with isTTY false does not print heartbeat", async () => {
  const home = tempHome();
  let buf = "";
  const stdout = {
    isTTY: false,
    write(chunk) {
      buf += chunk;
      return true;
    },
  };
  const code = await run([], { cwd: home, home, env: { HOME: home }, stdout, isTTY: false });
  assert.equal(code, 2);
  assert.match(buf, /Usage:/);
});

test("TTY no-args prints heartbeat and exits; does not persist bindings", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, [
    "journal",
    "--json",
    "--title",
    "Heartbeat handoff",
    "--resume",
    "Read the heartbeat next — open loops: none",
  ]);

  const cap = captureStdout();
  const code = await run([], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: cap.stdout,
    isTTY: true,
  });
  assert.equal(code, 0);
  const text = cap.buf();
  assert.match(text, /▶ Read the heartbeat next/);
  assert.match(text, /Heartbeat handoff/);
  assert.match(text, /Git\s+main \(clean\)/);
  assert.doesNotMatch(text, /\bhome\s+·/);
  assert.doesNotMatch(text, /^root\s+/m);
  assert.doesNotMatch(text, /Interactive dashboard/);

  const empty = tempHome();
  const fresh = initRepo(empty);
  const glance = captureStdout();
  const glanceCode = await run([], {
    cwd: fresh.root,
    home: empty,
    env: gitEnv(empty),
    stdout: glance.stdout,
    isTTY: true,
  });
  assert.equal(glanceCode, 0);
  assert.match(glance.buf(), /No journal yet/);
  assert.equal(existsSync(join(empty, ".mental", "bindings.json")), false);
});

test("TTY named commands stay one-shot, not a session", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "One-shot status"]);

  const cap = captureStdout();
  const code = await run(["status"], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: cap.stdout,
    isTTY: true,
  });
  assert.equal(code, 0);
  assert.match(cap.buf(), /resume:/);
  assert.doesNotMatch(cap.buf(), /Open or act/);
});

test("formatWhen labels today / yesterday / Nd ago", () => {
  assert.equal(formatWhen({ date: "2026-08-25", time: "14:02" }, new Date(2026, 7, 25)), "14:02");
  assert.equal(formatWhen({ date: "2026-08-24", time: "09:00" }, new Date(2026, 7, 25)), "yesterday");
  assert.equal(formatWhen({ date: "2026-08-20" }, new Date(2026, 7, 25)), "5d ago");
});

test("formatHeartbeat omits uuid chrome", () => {
  const text = formatHeartbeat({
    git: { branch: "main", dirty: true, recent: ["abc123 hi"] },
    gitRoot: "/tmp/repo",
    handoff: {
      resume: "Ship heartbeat — open loops: none",
      outcome: "Dropped the catalog",
      file: "journal/2026-08-25.md",
      when: { date: "2026-08-25", time: "14:02" },
    },
    openDecisions: [{ status: "open", title: "Park Clack" }],
    attention: [],
  }, new Date(2026, 7, 25));
  assert.match(text, /▶ Ship heartbeat/);
  assert.match(text, /Dropped the catalog\s+\(14:02\)/);
  assert.match(text, /\[open\] Park Clack/);
  assert.match(text, /In the air/);
  assert.match(text, /Unsettled/);
  assert.doesNotMatch(text, /concept/);
  assert.doesNotMatch(text, /indexed/);
});

test("usage no longer mentions a dashboard", () => {
  const u = usage();
  assert.match(u, /Heartbeat/);
  assert.doesNotMatch(u, /standing dashboard/i);
  assert.equal(parseArgv([]).command, null);
});
