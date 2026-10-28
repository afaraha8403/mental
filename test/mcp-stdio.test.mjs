import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, gitEnv, initRepo, mental, tempHome } from "./helpers.mjs";
import { mcpEntry, enableMcp, disableMcp, codexMcpPath } from "../bin/lib/mcp-hosts.mjs";

/**
 * Spawn `mental serve` over real stdio and read newline-delimited replies.
 * @param {string} home
 * @param {string} cwd
 */
function startServer(home, cwd) {
  const child = spawn(process.execPath, [CLI, "serve"], { cwd, env: gitEnv(home), stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let stderr = "";
  /** @type {string[]} */
  const lines = [];
  /** @type {Array<(line: string) => void>} */
  const waiters = [];
  child.stderr.on("data", (c) => {
    stderr += c;
  });
  child.stdout.on("data", (c) => {
    out += c;
    let nl;
    while ((nl = out.indexOf("\n")) >= 0) {
      const line = out.slice(0, nl);
      out = out.slice(nl + 1);
      const w = waiters.shift();
      if (w) w(line);
      else lines.push(line);
    }
  });
  const exited = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return {
    send(raw) {
      child.stdin.write(typeof raw === "string" ? raw : `${JSON.stringify(raw)}\n`);
    },
    /** Next reply line, parsed. Fails the test after 15s instead of hanging. */
    next() {
      const line = lines.shift();
      const got = line !== undefined ? Promise.resolve(line) : new Promise((r) => waiters.push(r));
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no MCP reply; stderr: ${stderr}`)), 15000);
      });
      return Promise.race([got, timeout]).then((l) => {
        clearTimeout(timer);
        assert.doesNotMatch(l, /^Content-Length/i, "stdio replies must be NDJSON");
        return JSON.parse(l);
      });
    },
    async close() {
      child.stdin.end();
      const code = await exited;
      return { code, leftover: lines.concat(out ? [out] : []), stderr };
    },
  };
}

test("MCP stdio: NDJSON initialize, tools, errors, notifications", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  mental(home, root, ["journal", "--json", "--title", "Stdio handoff", "--resume", "Continue"]);
  const srv = startServer(home, root);

  srv.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
  const init = await srv.next();
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, "2025-06-18", "echo a supported client version");
  assert.equal(init.result.serverInfo.name, "mental");
  assert.ok(init.result.capabilities.tools);

  // The notification must get no reply, so the next line is the tools/list answer.
  srv.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  srv.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const listed = await srv.next();
  assert.equal(listed.id, 2);
  const where = listed.result.tools.find((t) => t.name === "where");
  assert.ok(where, "where tool listed");
  for (const t of listed.result.tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.inputSchema.additionalProperties, false, `${t.name} schema is closed`);
    assert.equal(typeof t.annotations.readOnlyHint, "boolean", `${t.name} annotations`);
  }
  assert.equal(where.annotations.readOnlyHint, true);
  const journal = listed.result.tools.find((t) => t.name === "journal");
  assert.equal(journal.annotations.readOnlyHint, false);
  assert.equal(journal.annotations.idempotentHint, false);

  srv.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "where", arguments: {} } });
  const called = await srv.next();
  assert.equal(called.id, 3);
  assert.equal(called.result.isError, false);
  assert.equal(called.result.structuredContent.ok, true);
  assert.equal(called.result.structuredContent.data.gitRoot, root);
  assert.deepEqual(JSON.parse(called.result.content[0].text), called.result.structuredContent);

  srv.send("{not json\n");
  const parseErr = await srv.next();
  assert.equal(parseErr.id, null);
  assert.equal(parseErr.error.code, -32700);

  srv.send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } });
  const unknownTool = await srv.next();
  assert.equal(unknownTool.id, 4);
  assert.equal(unknownTool.error.code, -32602);

  // Unknown notification: silent. Unknown request: -32601.
  srv.send({ jsonrpc: "2.0", method: "notifications/whatever" });
  srv.send({ jsonrpc: "2.0", id: 5, method: "resources/nope" });
  const unknownMethod = await srv.next();
  assert.equal(unknownMethod.id, 5);
  assert.equal(unknownMethod.error.code, -32601);

  const { code, leftover, stderr } = await srv.close();
  assert.equal(code, 0, stderr);
  assert.deepEqual(leftover, [], "no stray output after the last reply");
});

test("MCP stdio: unsupported protocol version gets the latest supported", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const srv = startServer(home, root);
  srv.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  const init = await srv.next();
  assert.match(init.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(init.result.protocolVersion, "1999-01-01");
  assert.equal((await srv.close()).code, 0);
});

test("MCP stdio: legacy Content-Length input is answered in kind", async () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const child = spawn(process.execPath, [CLI, "serve"], { cwd: root, env: gitEnv(home) });
  let out = "";
  child.stdout.on("data", (c) => {
    out += c;
  });
  const json = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" });
  child.stdin.end(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  await new Promise((r) => child.on("close", r));
  assert.match(out, /^Content-Length: \d+\r\n\r\n\{"jsonrpc":"2.0","id":9,"result":\{\}\}$/);
});

test("MCP host entry: cmd /c on Windows, bare mental elsewhere", () => {
  assert.deepEqual(mcpEntry("win32"), { command: "cmd", args: ["/c", "mental", "serve"] });
  assert.deepEqual(mcpEntry("linux"), { command: "mental", args: ["serve"] });
  assert.deepEqual(mcpEntry("darwin"), { command: "mental", args: ["serve"] });
});

test("MCP host config: Codex config.toml written only when ~/.codex exists, other tables kept", () => {
  const home = tempHome();
  assert.ok(!enableMcp(home).written.includes(codexMcpPath(home)), "no ~/.codex, no Codex write");

  mkdirSync(join(home, ".codex"), { recursive: true });
  const before = 'model = "o5"\n\n[mcp_servers.other]\ncommand = "other"\n';
  writeFileSync(codexMcpPath(home), before);
  const on = enableMcp(home);
  assert.ok(on.written.includes(codexMcpPath(home)));
  enableMcp(home);
  const toml = readFileSync(codexMcpPath(home), "utf8");
  assert.equal(toml.match(/\[mcp_servers\.mental\]/g)?.length, 1, "re-enable does not duplicate");
  assert.match(toml, /\[mcp_servers\.other\]\ncommand = "other"/);
  assert.match(toml, new RegExp(`command = ${JSON.stringify(mcpEntry().command)}`));

  const off = disableMcp(home);
  assert.ok(off.written.includes(codexMcpPath(home)));
  const after = readFileSync(codexMcpPath(home), "utf8");
  assert.doesNotMatch(after, /mcp_servers\.mental/);
  assert.equal(after, before);
});
