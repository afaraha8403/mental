import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { encode, handle, runTool, serveMcp } from "../bin/lib/mcp.mjs";
import { gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";

test("uninstall removes skill copies and leaves OKF unless DELETE", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(mental(home, root, ["install", "--json"]).status, 0);
  assert.equal(existsSync(join(home, ".agents", "skills", "mental", "SKILL.md")), true);
  mental(home, root, ["journal", "--json", "--title", "Keep me"]);
  const slice = JSON.parse(mental(home, root, ["status", "--json"]).stdout).data.root;

  const refused = mental(home, root, ["uninstall", "--json", "--delete-data"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /DELETE/);

  const gone = mental(home, root, ["uninstall", "--json"]);
  assert.equal(gone.status, 0, gone.stderr || gone.stdout);
  assert.equal(existsSync(join(home, ".agents", "skills", "mental", "SKILL.md")), false);
  assert.equal(existsSync(slice), true);

  const wipe = mental(home, root, ["uninstall", "--json", "--delete-data", "--confirm", "DELETE"]);
  assert.equal(wipe.status, 0, wipe.stderr || wipe.stdout);
  assert.equal(existsSync(join(home, ".mental")), false);
});

test("hooks on writes cursor + claude entries; hooks off removes only Mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const on = mental(home, root, ["hooks", "on", "--json"]);
  assert.equal(on.status, 0, on.stderr || on.stdout);
  const cursor = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf8"));
  assert.ok(cursor.hooks.sessionStart.some((e) => String(e.command).includes("session-start.sh")));
  const claude = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
  assert.ok(claude.hooks.SessionStart.length >= 1);

  const off = mental(home, root, ["hooks", "off", "--json"]);
  assert.equal(off.status, 0, off.stderr || off.stdout);
  const cursor2 = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf8"));
  assert.equal(cursor2.hooks.sessionStart.length, 0);
});

test("install --mcp writes user MCP configs without enabling hooks", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json", "--mcp"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.mcp.ok, true);
  assert.equal(body.data.mcp.server.args[0], "serve");
  for (const file of [join(home, ".cursor", "mcp.json"), join(home, ".claude.json")]) {
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(cfg.mcpServers.mental, { command: "mental", args: ["serve"] });
  }
  assert.equal(existsSync(join(home, ".cursor", "hooks.json")), false);

  const again = mental(home, root, ["install", "--json", "--mcp"]);
  assert.equal(again.status, 0, again.stderr || again.stdout);
});

test("install --mcp preserves other MCP servers; uninstall removes only mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mkdirSync(join(home, ".cursor"), { recursive: true });
  writeFileSync(
    join(home, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { other: { command: "other", args: [] } } }),
  );
  const r = mental(home, root, ["install", "--json", "--mcp"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  let cfg = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cfg.mcpServers.other.command, "other");
  assert.equal(cfg.mcpServers.mental.command, "mental");

  const gone = mental(home, root, ["uninstall", "--json"]);
  assert.equal(gone.status, 0, gone.stderr || gone.stdout);
  cfg = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cfg.mcpServers.mental, undefined);
  assert.equal(cfg.mcpServers.other.command, "other");
  const claude = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
  assert.equal(claude.mcpServers?.mental, undefined);
});

test("MCP initialize + tools/list + where", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "MCP handoff"]);

  const init = handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {});
  assert.equal(init.result.serverInfo.name, "mental");
  const listed = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {});
  for (const name of ["heartbeat", "where", "status", "search", "list", "show", "journal", "attention", "decide", "note"]) {
    assert.ok(listed.result.tools.some((t) => t.name === name), `missing MCP tool: ${name}`);
  }

  const stdin = new PassThrough();
  const chunks = [];
  const stdout = { write(c) { chunks.push(c); return true; } };
  const done = serveMcp({
    cwd: root,
    home,
    env: gitEnv(home),
    stdin,
    stdout,
  });
  stdin.write(
    encode({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "where", arguments: {} },
    }),
  );
  stdin.end();
  const code = await done;
  assert.equal(code, 0);
  const raw = chunks.join("");
  assert.match(raw, /isError":false/);
});

test("MCP heartbeat + attention round-trip (mid-chat parity)", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const ctx = { cwd: root, home, env: gitEnv(home), dir: null, flags: {}, rest: [] };

  const pulse = runTool("heartbeat", {}, ctx);
  assert.equal(pulse.code, 0, JSON.stringify(pulse.body));
  assert.equal(pulse.body.ok, true);

  const created = runTool("attention", { title: "Tom said ship the pointer", kind: "direction", from: "Tom" }, ctx);
  assert.equal(created.code, 0, JSON.stringify(created.body));
  assert.equal(created.body.ok, true);
  assert.match(created.body.data.path, /^attention\//);

  const resolved = runTool("attention", { title: "Tom said ship the pointer", status: "resolved" }, ctx);
  assert.equal(resolved.code, 0, JSON.stringify(resolved.body));

  const decided = runTool("decide", { title: "MCP parity ships", status: "decided" }, ctx);
  assert.equal(decided.code, 0, JSON.stringify(decided.body));

  const closed = runTool("decide", { title: "MCP parity ships", status: "superseded" }, ctx);
  assert.equal(closed.code, 0, JSON.stringify(closed.body));
  assert.equal(closed.body.data.updated, true);

  const noted = runTool("note", { title: "Identity is a UUID" }, ctx);
  assert.equal(noted.code, 0, JSON.stringify(noted.body));

  const after = runTool("heartbeat", {}, ctx);
  assert.equal(after.body.data.openDecisions.length, 0);
});

test("local --import copies home slice into ./.mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Home first"]);
  const fix = mental(home, root, ["doctor", "--fix-ignore", "--json"]);
  assert.ok(fix.status === 0 || fix.status === 3, fix.stderr || fix.stdout);
  const r = mental(home, root, ["local", "--import", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.where.mode, "local");
  assert.equal(body.data.where.root, join(root, ".mental"));
  assert.equal(existsSync(join(root, ".mental", "journal")), true);
});
