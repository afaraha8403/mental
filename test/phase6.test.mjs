import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { encode, handle, runTool, serveMcp } from "../bin/lib/mcp.mjs";
import { mcpEntry } from "../bin/lib/mcp-hosts.mjs";
import { spawnSync } from "node:child_process";
import { CLI, gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { fitJson, hookCommand, HOOK_CONTEXT_MAX, sessionStartContext, sessionStartOutput } from "../bin/lib/hooks.mjs";
import { CMD } from "../bin/lib/pkg.mjs";

test("uninstall removes skill copies and leaves OKF unless DELETE", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  assert.equal(mental(home, root, ["install", "--json"]).status, 0);
  assert.equal(existsSync(join(home, ".agents", "skills", "mental", "SKILL.md")), true);
  mental(home, root, ["journal", "--json", "--title", "Keep me", "--resume", "Continue"]);
  const slice = JSON.parse(mental(home, root, ["status", "--json"]).stdout).data.root;

  const refused = mental(home, root, ["uninstall", "--json", "--delete-data"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stdout, /DELETE/);

  const gone = mental(home, root, ["uninstall", "--json"]);
  assert.equal(gone.status, 0, gone.stderr || gone.stdout);
  assert.equal(existsSync(join(home, ".agents", "skills", "mental", "SKILL.md")), false);
  assert.equal(existsSync(join(home, ".config", "opencode", "skills", "mental", "SKILL.md")), false);
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
  assert.deepEqual(
    cursor.hooks.sessionStart.map((e) => e.command),
    [hookCommand("cursor")],
  );
  assert.doesNotMatch(JSON.stringify(cursor), /session-start\.sh|[/\\]hooks[/\\]/);
  const claude = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(claude.hooks.SessionStart.flatMap((b) => b.hooks.map((h) => h.command)), [hookCommand("claude-code")]);
  assert.equal(claude.hooks.PreCompact, undefined);

  const off = mental(home, root, ["hooks", "off", "--json"]);
  assert.equal(off.status, 0, off.stderr || off.stdout);
  const cursor2 = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf8"));
  assert.equal(cursor2.hooks.sessionStart.length, 0);
});

test("install migrates legacy .sh hook entries and keeps other hooks", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const legacy = "/usr/lib/node_modules/@balacode/mental/hooks/session-start.sh";
  mkdirSync(join(home, ".cursor"), { recursive: true });
  writeFileSync(
    join(home, ".cursor", "hooks.json"),
    JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: "other-tool" }, { command: legacy }] } }),
  );
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(
    join(home, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [{ matcher: "", hooks: [{ type: "command", command: legacy }] }],
        PreCompact: [{ matcher: "", hooks: [{ type: "command", command: legacy }, { type: "command", command: "keep-me" }] }],
      },
    }),
  );
  assert.equal(mental(home, root, ["option", "hooks", "on", "--json"]).status, 0);
  // Simulate the pre-0.12.2 files again, then let install migrate them.
  writeFileSync(
    join(home, ".cursor", "hooks.json"),
    JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: "other-tool" }, { command: legacy }] } }),
  );
  const r = mental(home, root, ["install", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const cursor = JSON.parse(readFileSync(join(home, ".cursor", "hooks.json"), "utf8"));
  assert.deepEqual(cursor.hooks.sessionStart.map((e) => e.command), ["other-tool", hookCommand("cursor")]);
  const claude = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(claude.hooks.PreCompact.flatMap((b) => b.hooks.map((h) => h.command)), ["keep-me"]);
  assert.doesNotMatch(JSON.stringify(claude), /session-start\.sh/);
});

test("hooks session-start prints each host's documented JSON shape", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const run = (args, input) =>
    spawnSync(process.execPath, [CLI, "hooks", "session-start", ...args], {
      encoding: "utf8",
      cwd: root,
      env: gitEnv(home),
      input,
    });

  const cursor = run(["cursor"], "{}");
  assert.equal(cursor.status, 0, cursor.stderr);
  const c = JSON.parse(cursor.stdout);
  assert.deepEqual(Object.keys(c), ["additional_context"]);
  assert.match(c.additional_context, /mental status --json/);
  const status = JSON.parse(c.additional_context.slice(c.additional_context.indexOf("\n") + 1));
  assert.equal(status.ok, true);

  const claude = JSON.parse(run(["claude-code"], "{}").stdout);
  assert.equal(claude.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(typeof claude.hookSpecificOutput.additionalContext, "string");

  // Legacy .sh entries name no host: it comes from the stdin payload.
  const auto = JSON.parse(run([], JSON.stringify({ hook_event_name: "sessionStart" })).stdout);
  assert.equal(typeof auto.additional_context, "string");
  const autoClaude = JSON.parse(run([], JSON.stringify({ hook_event_name: "SessionStart" })).stdout);
  assert.equal(autoClaude.hookSpecificOutput.hookEventName, "SessionStart");
  const compact = run([], JSON.stringify({ hook_event_name: "PreCompact" }));
  assert.equal(compact.status, 0);
  assert.equal(compact.stdout, "");
});

test("session-start context stays valid JSON within the budget", () => {
  const big = {
    ok: true,
    data: {
      resume: "r".repeat(5000),
      attention: Array.from({ length: 200 }, (_, i) => ({ title: `item ${i} ${"x".repeat(300)}` })),
    },
  };
  for (const max of [4000, 1500, 300]) {
    const text = fitJson(big, max);
    assert.ok(text.length <= max, `${text.length} > ${max}`);
    assert.equal(JSON.parse(text).truncated, true);
  }
  const ctx = sessionStartContext(JSON.stringify(big));
  assert.ok(ctx.length <= HOOK_CONTEXT_MAX);
  JSON.parse(ctx.slice(ctx.indexOf("\n") + 1));
  assert.match(sessionStartContext("not json"), /unavailable/);
  const out = sessionStartOutput({ host: "cursor", statusText: JSON.stringify(big) });
  assert.ok(JSON.parse(out).additional_context.length <= HOOK_CONTEXT_MAX);
});

test("hook command uses mental.cmd on Windows and the bare bin elsewhere", () => {
  assert.equal(hookCommand("cursor", "win32"), `${CMD}.cmd hooks session-start cursor`);
  assert.equal(hookCommand("claude-code", "linux"), `${CMD} hooks session-start claude-code`);
});

test("install --mcp writes user MCP configs without enabling hooks", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const r = mental(home, root, ["install", "--json", "--mcp"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.mcp.ok, true);
  assert.deepEqual(body.data.mcp.server, mcpEntry());
  assert.equal(body.data.mcp.server.args.at(-1), "serve");
  assert.doesNotMatch(JSON.stringify(body.data.mcp.server), /cli\.mjs/);
  for (const file of [join(home, ".cursor", "mcp.json"), join(home, ".claude.json")]) {
    const cfg = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(cfg.mcpServers[CMD], mcpEntry());
    assert.doesNotMatch(cfg.mcpServers[CMD].command, /[/\\]|cli\.mjs/);
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
  assert.deepEqual(cfg.mcpServers.mental, mcpEntry());

  const gone = mental(home, root, ["uninstall", "--json"]);
  assert.equal(gone.status, 0, gone.stderr || gone.stdout);
  cfg = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cfg.mcpServers.mental, undefined);
  assert.equal(cfg.mcpServers.other.command, "other");
  const claude = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
  assert.equal(claude.mcpServers?.mental, undefined);
});

test("MCP tools forward every argument their schema advertises", async () => {
  const src = readFileSync(new URL("../bin/lib/mcp.mjs", import.meta.url), "utf8");
  const run = src.slice(src.indexOf("function runTool("));
  const listed = handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
  for (const tool of listed.result.tools) {
    const start = run.indexOf(`name === "${tool.name}"`);
    assert.ok(start >= 0, `runTool has no branch for ${tool.name}`);
    const next = run.indexOf("if (name ===", start + 1);
    const block = run.slice(start, next < 0 ? undefined : next);
    const dropped = Object.keys(tool.inputSchema.properties || {}).filter((p) => !new RegExp(`args\\.${p}\\b`).test(block));
    assert.deepEqual(dropped, [], `${tool.name} advertises arguments runTool never reads`);
  }

  const home = tempHome();
  const { root } = initRepo(home);
  const made = await runTool("attention", { title: "Slug check", kind: "thread", slug: "custom-slug", tag: "mcp" }, { home, cwd: root, env: gitEnv(home) });
  assert.match(made.body.data.path, /custom-slug\.md$/);
});

test("MCP initialize + tools/list + where", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "MCP handoff", "--resume", "Continue"]);

  const init = handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {});
  assert.equal(init.result.serverInfo.name, "mental");
  const listed = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, {});
  for (const name of ["heartbeat", "where", "status", "search", "list", "show", "journal", "attention", "decide", "note", "park", "handoff", "pulse", "brief"]) {
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

  const created = runTool("attention", { title: "Tom said ship the pointer", kind: "direction", from: "Tom", tag: "topic" }, ctx);
  assert.equal(created.code, 0, JSON.stringify(created.body));
  assert.equal(created.body.ok, true);
  assert.match(created.body.data.path, /^attention\//);

  const resolved = runTool("attention", { title: "Tom said ship the pointer", status: "resolved" }, ctx);
  assert.equal(resolved.code, 0, JSON.stringify(resolved.body));

  const decided = runTool("decide", { title: "MCP parity ships", status: "decided", body: "CLI JSON is the write path.", tag: "topic" }, ctx);
  assert.equal(decided.code, 0, JSON.stringify(decided.body));

  const closed = runTool("decide", { title: "MCP parity ships", status: "superseded" }, ctx);
  assert.equal(closed.code, 0, JSON.stringify(closed.body));
  assert.equal(closed.body.data.updated, true);

  const noted = runTool("note", { title: "Identity is a UUID", tag: "topic" }, ctx);
  assert.equal(noted.code, 0, JSON.stringify(noted.body));

  const after = runTool("heartbeat", {}, ctx);
  assert.equal(after.body.data.openDecisions.length, 0);
});

test("MCP decide forwards tag", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const ctx = { cwd: root, home, env: gitEnv(home) };
  const decided = runTool(
    "decide",
    { title: "Tagged via MCP", body: "The flag must survive the tool map.", tag: "mind-map,receipt" },
    ctx,
  );
  assert.equal(decided.code, 0, JSON.stringify(decided.body));
  const shown = runTool("show", { path: decided.body.data.path }, ctx);
  assert.equal(shown.code, 0, JSON.stringify(shown.body));
  assert.deepEqual(shown.body.data.frontmatter.tags, ["mind-map", "receipt"]);

  const missing = runTool("decide", { title: "Untagged", body: "create must name a tag" }, ctx);
  assert.equal(missing.code, 2, JSON.stringify(missing.body));
});

test("local --import copies home slice into ./.mental", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Home first", "--resume", "Continue"]);
  const fix = mental(home, root, ["doctor", "--fix-ignore", "--json"]);
  assert.ok(fix.status === 0 || fix.status === 3, fix.stderr || fix.stdout);
  const r = mental(home, root, ["local", "--import", "--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.data.where.mode, "local");
  assert.equal(body.data.where.root, join(root, ".mental"));
  assert.equal(existsSync(join(root, ".mental", "journal")), true);
});
