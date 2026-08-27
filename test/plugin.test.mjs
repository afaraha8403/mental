/**
 * Agent Plugins 1.0.0 package conformance (https://agent-plugins.org/specification).
 * No network: schemas are encoded as the closed-field + naming rules from the spec.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const PLUGIN_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);
const NAME_RE = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME_RE = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CWD_RE = /^(?:\.\/|\$\{PLUGIN_ROOT\}(?:\/|$)|\$\{PLUGIN_DATA\}(?:\/|$))/;
const SKILL_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function schemaVersion(id) {
  const m = String(id).match(/\/schemas\/(\d+\.\d+\.\d+)\//);
  return m ? m[1] : null;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "SKILL.md must start with YAML frontmatter");
  /** @type {Record<string, unknown>} */
  const out = {};
  const lines = m[1].split("\n");
  let key = null;
  let buf = [];
  let fold = null;
  const flush = () => {
    if (!key) return;
    if (fold === ">") out[key] = buf.join(" ").replace(/\s+/g, " ").trim();
    else if (fold === "|") out[key] = buf.join("\n");
    else if (buf.length) out[key] = buf.join("\n");
    key = null;
    buf = [];
    fold = null;
  };
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv && !line.startsWith(" ")) {
      flush();
      key = kv[1];
      const rest = kv[2];
      if (rest === ">" || rest === ">|" || rest === ">-") {
        fold = ">";
      } else if (rest === "|" || rest === "|-") {
        fold = "|";
      } else if (rest === "") {
        out[key] = {};
        fold = "map";
        buf = [];
      } else {
        out[key] = rest.replace(/^["']|["']$/g, "");
        key = null;
      }
      continue;
    }
    if (fold === "map" && key) {
      const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
      if (nested) {
        const map = out[key] && typeof out[key] === "object" ? out[key] : {};
        map[nested[1]] = nested[2].replace(/^["']|["']$/g, "");
        out[key] = map;
        continue;
      }
    }
    if (key && (fold === ">" || fold === "|")) {
      buf.push(line.replace(/^\s{2}/, ""));
    }
  }
  flush();
  return out;
}

test("plugin.json is a closed Agent Plugins 1.0.0 manifest", () => {
  const file = join(ROOT, "plugin.json");
  assert.equal(statSync(file).isFile(), true);
  const manifest = loadJson(file);
  assert.equal(manifest.$schema, PLUGIN_SCHEMA);
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length >= 1 && manifest.name.length <= 64);
  assert.match(manifest.name, NAME_RE);
  for (const key of Object.keys(manifest)) {
    assert.ok(PLUGIN_FIELDS.has(key), `unknown plugin.json field: ${key}`);
  }
  const pkg = loadJson(join(ROOT, "package.json"));
  assert.equal(pkg.name, "@balacode/mental");
  assert.ok(Array.isArray(pkg.keywords));
  for (const needle of ["mcp", "cursor", "claude-code", "agent-skills", "coding-agents"]) {
    assert.ok(pkg.keywords.includes(needle), `package.json keywords must include ${needle}`);
    assert.ok(manifest.keywords.includes(needle), `plugin.json keywords must include ${needle}`);
  }
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.license, "MIT");
  assert.equal(typeof manifest.description, "string");
  assert.equal(typeof manifest.author, "object");
  assert.equal(typeof manifest.author.name, "string");
  assert.ok(Array.isArray(manifest.keywords));
  if (manifest.extensions !== undefined) {
    assert.equal(typeof manifest.extensions, "object");
    assert.ok(!Array.isArray(manifest.extensions));
    for (const [ns, value] of Object.entries(manifest.extensions)) {
      assert.match(ns, /^[a-z0-9]+(?:\.[a-z0-9]+)+$/);
      assert.equal(typeof value, "object");
      assert.ok(!Array.isArray(value));
    }
  }
});

test("mcp.json is a closed stdio MCP config matching plugin.json version", () => {
  const file = join(ROOT, "mcp.json");
  assert.equal(statSync(file).isFile(), true);
  const mcp = loadJson(file);
  const plugin = loadJson(join(ROOT, "plugin.json"));
  assert.equal(mcp.$schema, MCP_SCHEMA);
  assert.equal(schemaVersion(mcp.$schema), schemaVersion(plugin.$schema));
  assert.deepEqual(Object.keys(mcp).sort(), ["$schema", "mcpServers"]);
  assert.equal(typeof mcp.mcpServers, "object");
  const mental = mcp.mcpServers.mental;
  assert.ok(mental, "mcpServers.mental is required");
  assert.equal(mental.type, "stdio");
  assert.equal(mental.command, "./bin/cli.mjs");
  assert.deepEqual(mental.args, ["serve"]);
  assert.match(mental.cwd, CWD_RE);
  for (const [name, server] of Object.entries(mcp.mcpServers)) {
    assert.ok(["stdio", "streamable-http", "sse"].includes(server.type), `${name}: unknown type`);
    if (server.type === "stdio") {
      assert.equal(typeof server.command, "string");
      assert.ok(server.command === server.command.trim());
      assert.equal(server.command.includes(" "), false, `${name}: command must be one token`);
      const rel = server.command.startsWith("./");
      const bare = /^[A-Za-z0-9._-]+$/.test(server.command);
      assert.ok(rel || bare, `${name}: command must be ./relative or a bare name`);
      if (rel) {
        const abs = resolve(ROOT, server.command);
        assert.ok(abs.startsWith(ROOT), `${name}: command escapes plugin root`);
        assert.equal(existsSync(abs), true, `${name}: bundled command missing`);
      }
      if (server.cwd) assert.match(server.cwd, CWD_RE);
      if (server.env) {
        assert.equal("PLUGIN_ROOT" in server.env, false);
        assert.equal("PLUGIN_DATA" in server.env, false);
      }
    } else {
      assert.equal(typeof server.url, "string");
      const u = new URL(server.url);
      assert.ok(u.protocol === "https:" || u.hostname === "localhost");
      assert.equal(u.username || u.password, "");
      assert.equal(u.hash, "");
    }
  }
});

test("skills/ discovers only immediate children with SKILL.md", () => {
  const skillsDir = join(ROOT, "skills");
  const names = readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory());
  assert.ok(names.includes("mental"));
  for (const name of names) {
    const skillDir = join(skillsDir, name);
    const skillFile = join(skillDir, "SKILL.md");
    assert.equal(statSync(skillFile).isFile(), true, `${name}: missing SKILL.md`);
    assert.match(name, SKILL_NAME_RE);
    const fm = parseFrontmatter(readFileSync(skillFile, "utf8"));
    assert.equal(fm.name, name);
    assert.equal(typeof fm.description, "string");
    assert.ok(String(fm.description).length >= 1);
    assert.ok(String(fm.description).length <= 1024);
    for (const key of Object.keys(fm)) {
      // Cursor/Claude invocation flags are extra; Agent Skills puts extras in metadata.
      if (key === "user-invocable" || key === "disable-model-invocation" || key === "when_to_use") {
        continue;
      }
      assert.ok(SKILL_FRONTMATTER_KEYS.has(key), `${name}: unknown SKILL.md field ${key}`);
    }
    if (fm.metadata) {
      assert.equal(typeof fm.metadata, "object");
      for (const v of Object.values(fm.metadata)) {
        assert.equal(typeof v, "string", `${name}: metadata values must be strings`);
      }
    }
    const refs = join(skillDir, "references");
    if (existsSync(refs)) {
      for (const f of readdirSync(refs, { recursive: true })) {
        const p = join(refs, String(f));
        if (!statSync(p).isFile()) continue;
        assert.equal(resolve(p).startsWith(resolve(skillDir)), true);
      }
    }
  }
});

test("plugin package paths stay inside the plugin root", () => {
  const mcp = loadJson(join(ROOT, "mcp.json"));
  const cmd = resolve(ROOT, mcp.mcpServers.mental.command);
  assert.equal(relative(ROOT, cmd).startsWith(".."), false);
  assert.equal(existsSync(join(ROOT, "bin", "cli.mjs")), true);
  const pkg = loadJson(join(ROOT, "package.json"));
  for (const extra of ["plugin.json", "mcp.json", "assets"]) {
    assert.ok(pkg.files.includes(extra), `package.json files must include ${extra}`);
  }
});

test("Cursor shim points at the SVG logo; Claude shim has displayName", () => {
  const logo = join(ROOT, "assets", "logo.svg");
  assert.equal(statSync(logo).isFile(), true);
  assert.match(readFileSync(logo, "utf8"), /<svg[\s\S]*<\/svg>/);
  const plugin = loadJson(join(ROOT, "plugin.json"));
  assert.equal("logo" in plugin, false, "portable plugin.json must not grow a logo field");

  const cursor = loadJson(join(ROOT, ".cursor-plugin", "plugin.json"));
  assert.equal(cursor.name, "mental");
  assert.equal(cursor.logo, "assets/logo.svg");
  assert.equal(cursor.description, plugin.description);
  assert.equal(cursor.version, plugin.version);
  assert.equal(existsSync(join(ROOT, cursor.logo)), true);

  const claude = loadJson(join(ROOT, ".claude-plugin", "plugin.json"));
  assert.equal(claude.name, "mental");
  assert.equal(claude.displayName, "Mental");
  assert.equal(claude.mcpServers, "./.mcp.json");
  assert.equal(existsSync(join(ROOT, ".mcp.json")), true);
  const claudeMcp = loadJson(join(ROOT, ".mcp.json"));
  assert.equal(claudeMcp.mcpServers.mental.command, "node");
  assert.equal(claude.description, plugin.description);

  const market = loadJson(join(ROOT, ".claude-plugin", "marketplace.json"));
  assert.equal(market.name, "mental");
  assert.equal(market.plugins[0].source, "./");
});
