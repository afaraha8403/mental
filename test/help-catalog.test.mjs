import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "../bin/lib/args.mjs";
import { CATALOG, catalogNames, formatCommandHelp, formatUsageShort } from "../bin/lib/catalog.mjs";
import { COMMANDS, run } from "../bin/cli.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

function capture() {
  let out = "";
  let err = "";
  return {
    out: () => out,
    err: () => err,
    stdout: {
      isTTY: false,
      write(chunk) {
        out += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk) {
        err += chunk;
        return true;
      },
    },
  };
}

test("catalog includes every COMMANDS key and an example", () => {
  for (const name of Object.keys(COMMANDS)) {
    assert.ok(CATALOG[name], `catalog missing ${name}`);
    assert.ok(CATALOG[name].examples?.length >= 1, `${name} needs an example`);
  }
  for (const name of catalogNames()) {
    assert.ok(CATALOG[name].summary, name);
  }
});

test("handoff --help is per-command, not the remap wall", () => {
  const home = tempHome();
  const r = mental(home, home, ["handoff", "--help"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /--title/);
  assert.match(r.stdout, /--resume/);
  assert.match(r.stdout, /Examples:/);
  assert.doesNotMatch(r.stdout, /remap/);
  assert.doesNotMatch(r.stdout, /split/);
  assert.doesNotMatch(r.stdout, /install/);
});

test("mental -h is Daily short; --help is grouped", () => {
  const home = tempHome();
  const short = mental(home, home, ["-h"]);
  assert.equal(short.status, 0, short.stderr || short.stdout);
  assert.match(short.stdout, /Daily:/);
  assert.match(short.stdout, /heartbeat/);
  assert.match(short.stdout, /mental --help/);
  assert.doesNotMatch(short.stdout, /reindex/);

  const full = mental(home, home, ["--help"]);
  assert.equal(full.status, 0);
  assert.match(full.stdout, /Identity:/);
  assert.match(full.stdout, /remap/);
  assert.match(full.stdout, /schema/);
});

test("mental help handoff matches handoff --help", () => {
  const a = formatCommandHelp("handoff");
  const home = tempHome();
  const r = mental(home, home, ["help", "handoff"]);
  assert.equal(r.stdout, a);
});

test("unknown --josn fails; does not heartbeat", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["heartbeat", "--josn"]);
  assert.equal(r.status, 2, r.stderr || r.stdout);
  const json = mental(home, root, ["heartbeat", "--json", "--josn"]);
  assert.equal(json.status, 2);
  const body = JSON.parse(json.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unknown-flag");
  assert.match(body.error.hint, /--json/);
});

test("search -- -foo queries -foo", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const parsed = parseArgv(["search", "--", "-label"]);
  assert.equal(parsed.command, "search");
  assert.deepEqual(parsed.rest, ["-label"]);
  const r = mental(home, root, ["search", "--json", "--", "-label"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.data.q, "-label");
  assert.equal(body.data.op, "and");
  assert.ok(Array.isArray(body.data.tokens));
  assert.equal(typeof body.data.truncated, "boolean");
  assert.equal(typeof body.data.total, "number");
});

test("mental --json with no command is a heartbeat", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const cap = capture();
  const code = await run(["--json"], {
    cwd: root,
    home,
    env: gitEnv(home),
    stdout: cap.stdout,
    stderr: cap.stderr,
    isTTY: false,
  });
  assert.equal(code, 0, cap.out() + cap.err());
  const body = JSON.parse(cap.out());
  assert.equal(body.ok, true);
  assert.ok("handoff" in body.data);
  assert.ok("id" in body.data);
  assert.ok("mode" in body.data);
});

test("journal without --resume is usage exit 2 with hint", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["journal", "--json", "--title", "X"]);
  assert.equal(r.status, 2, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "usage");
  assert.match(body.error.message, /--resume/);
  assert.match(body.error.hint, /--resume/);
});

test("decide create without --body is usage exit 2 with hint", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["decide", "--json", "--title", "Stay WebKitGTK"]);
  assert.equal(r.status, 2, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "usage");
  assert.match(body.error.message, /--body/);
  assert.match(body.error.hint, /--body/);
});

test("unknown command --json does not run a neighbor; hint lists Daily", () => {
  const home = tempHome();
  const r = mental(home, home, ["nosuch", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unknown-command");
  assert.match(body.error.hint, /heartbeat/);
});

test("list --json includes truncated and total", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["list", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(typeof body.data.truncated, "boolean");
  assert.equal(typeof body.data.total, "number");
});

test("schema --json dumps catalog; schema heartbeat is one command", () => {
  const home = tempHome();
  const all = mental(home, home, ["schema", "--json"]);
  assert.equal(all.status, 0, all.stderr || all.stdout);
  const body = JSON.parse(all.stdout);
  assert.ok(Array.isArray(body.data.commands));
  assert.ok(body.data.commands.some((c) => c.name === "handoff"));
  const one = JSON.parse(mental(home, home, ["schema", "heartbeat", "--json"]).stdout);
  assert.equal(one.data.command.name, "heartbeat");
});

test("completion bash prints a script", () => {
  const home = tempHome();
  const r = mental(home, home, ["completion", "bash"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /complete -F _mental/);
  assert.match(r.stdout, /heartbeat/);
});

test("NO_COLOR strips emoji from TTY heartbeat", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  let buf = "";
  const stdout = {
    isTTY: true,
    write(chunk) {
      buf += chunk;
      return true;
    },
  };
  const code = await run([], {
    cwd: root,
    home,
    env: { ...gitEnv(home), NO_COLOR: "1" },
    stdout,
    isTTY: true,
  });
  assert.equal(code, 0);
  assert.doesNotMatch(buf, /🧠/);
  assert.match(buf, /\[mental\]/);
  assert.match(buf, /mental --help/);
  assert.doesNotMatch(buf, /\x1b\[/);
});

test("doctor --json ok follows error-level problems", async () => {
  const cap = capture();
  const code = await run(["doctor", "--json"], {
    cwd: "/tmp",
    home: null,
    env: { ...process.env, HOME: "", USERPROFILE: "", MENTAL_SKIP_UPDATE_CHECK: "1", MENTAL_SKIP_HOST_PLUGIN_CHECK: "1" },
    stdout: cap.stdout,
    stderr: cap.stderr,
    isTTY: false,
  });
  const body = JSON.parse(cap.out());
  if (code === 3) {
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "doctor-failed");
  } else {
    assert.equal(code, 0);
    assert.equal(body.ok, true);
  }
});

test("heartbeat --fields lists names or masks JSON", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const names = mental(home, root, ["heartbeat", "--json", "--fields"]);
  assert.equal(names.status, 0, names.stderr || names.stdout);
  const listed = JSON.parse(names.stdout);
  assert.ok(listed.data.fields.includes("resume") || listed.data.fields.includes("handoff"));

  const masked = mental(home, root, ["heartbeat", "--json", "--fields", "mode,id"]);
  assert.equal(masked.status, 0, masked.stderr || masked.stdout);
  const body = JSON.parse(masked.stdout);
  assert.equal(body.ok, true);
  assert.ok("mode" in body.data);
  assert.ok("id" in body.data);
  assert.equal(body.data.git, undefined);
});

test("short usage helper stays one screen", () => {
  const s = formatUsageShort();
  assert.match(s, /Daily:/);
  assert.doesNotMatch(s, /uninstall/);
});
