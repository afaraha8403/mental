import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CLI, gitEnv, initRepo, tempHome } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const { cliCommand, jsonOf, advertisedUrl, embedUrl, statusOf } = require("../cursor-ext/lib.js");

test("cursor extension: the CLI starts through cmd.exe on Windows with the line quoted, bare elsewhere", () => {
  assert.deepEqual(cliCommand(["heartbeat", "--json"], { platform: "linux" }), { file: "mental", args: ["heartbeat", "--json"], verbatim: false });
  const win = cliCommand(["where", "--json"], { platform: "win32", comSpec: "C:\\Windows\\cmd.exe" });
  assert.deepEqual(win, { file: "C:\\Windows\\cmd.exe", args: ["/d", "/s", "/c", '"mental.cmd where --json"'], verbatim: true });
  const spaced = cliCommand(["show", "notes/a b.md"], { platform: "win32", cliPath: "C:\\Program Files\\mental\\mental.cmd" });
  assert.equal(spaced.args[3], '""C:\\Program Files\\mental\\mental.cmd" show "notes/a b.md""');

  // The real launch path: a node "CLI" stands in for mental so the test needs no global install.
  const home = tempHome();
  const { root } = initRepo(home);
  const cmd = process.platform === "win32" ? cliCommand(["heartbeat", "--json", "--passive"], { cliPath: `node ${CLI}` }) : { file: process.execPath, args: [CLI, "heartbeat", "--json", "--passive"], verbatim: false };
  if (process.platform === "win32") cmd.args[3] = `"node "${CLI}" heartbeat --json --passive"`;
  const r = spawnSync(cmd.file, cmd.args, { cwd: root, env: gitEnv(home), encoding: "utf8", windowsVerbatimArguments: cmd.verbatim, windowsHide: true });
  assert.equal(jsonOf(r.stdout)?.ok, true, r.stderr);
});

test("cursor extension: only a live loopback port file is trusted, and the embed opens this project's Today", () => {
  const alive = () => true;
  const dead = () => false;
  assert.equal(advertisedUrl({ url: "http://127.0.0.1:51234/", pid: 42 }, alive), "http://127.0.0.1:51234/");
  assert.equal(advertisedUrl({ url: "http://127.0.0.1:51234/", pid: 42 }, dead), null, "a hard kill leaves a stale file");
  assert.equal(advertisedUrl({ url: "https://evil.example/", pid: 42 }, alive), null, "never frame a non-loopback page");
  assert.equal(advertisedUrl(null, alive), null);
  assert.equal(embedUrl("http://127.0.0.1:3847/", "7927a458"), "http://127.0.0.1:3847/?embed=1#/today?p=7927a458");
  assert.equal(jsonOf(""), null);
  assert.deepEqual(jsonOf('npm notice\n{"ok":true,"data":{}}'), { ok: true, data: {} });
});

test("cursor extension: the status bar leads with what needs you, not counting items parked for later", () => {
  const hb = {
    ok: true,
    data: {
      id: "p",
      git: { branch: "main", dirty: true },
      handoff: { resume: "Wire the sidebar" },
      attentionCount: 4,
      laterCount: 2,
      openDecisionCount: 1,
      attention: [
        { title: "Verify the hook", status: "open" },
        { title: "Old idea", status: "later" },
      ],
      openDecisions: [{ title: "Keep MCP optional" }],
    },
  };
  const s = statusOf(hb);
  assert.equal(s.text, "$(bell-dot) mental · 3 need you");
  assert.equal(s.tone, "needs");
  assert.match(s.tooltip, /^Pick up here: Wire the sidebar/);
  assert.match(s.tooltip, /- Verify the hook\n- Keep MCP optional/);
  assert.doesNotMatch(s.tooltip, /Old idea/);
  assert.match(s.tooltip, /Branch: main \(uncommitted changes\)/);
  assert.equal(statusOf({ ok: true, data: { id: "p", attentionCount: 0 } }).text, "$(check) mental");
  assert.equal(statusOf(null).tone, "off", "no CLI or unlinked folder reads as off, not an error");
});
