/**
 * Agent Plugins 1.0.0 package conformance (https://agent-plugins.org/specification).
 * No network: schemas are encoded as the closed-field + naming rules from the spec.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
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
  assert.equal("mcpServers" in manifest, false, "portable plugin.json must not declare clone MCP");
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

test("plugin is skills-only: no clone MCP config", () => {
  assert.equal(existsSync(join(ROOT, "mcp.json")), false);
  assert.equal(existsSync(join(ROOT, ".mcp.json")), false);
});

test("skills/ discovers only immediate children with SKILL.md", () => {
  const skillsDir = join(ROOT, "skills");
  const names = readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory());
  assert.ok(names.includes("mental-setup"));
  assert.equal(names.includes("mental"), false, "full procedure must not live under plugin skills/");
  assert.equal(names.includes("mental-track"), false, "track skill must not live under plugin skills/");
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
      if (name === "mental-setup") {
        assert.equal(fm.metadata?.version, undefined, "bootstrap skill omits product version");
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
  assert.equal(existsSync(join(ROOT, "bin", "cli.mjs")), true);
  const pkg = loadJson(join(ROOT, "package.json"));
  for (const extra of ["plugin.json", "skill", "skills", "assets"]) {
    assert.ok(pkg.files.includes(extra), `package.json files must include ${extra}`);
  }
  assert.equal(pkg.files.includes("mcp.json"), false);
  assert.equal(pkg.files.includes(".mcp.json"), false);
});

test("Cursor shim points at the PNG logo; Claude shim has displayName", () => {
  const logo = join(ROOT, "assets", "logo.png");
  assert.equal(statSync(logo).isFile(), true);
  assert.equal(readFileSync(logo).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  const plugin = loadJson(join(ROOT, "plugin.json"));
  assert.equal("logo" in plugin, false, "portable plugin.json must not grow a logo field");

  const cursor = loadJson(join(ROOT, ".cursor-plugin", "plugin.json"));
  assert.equal(cursor.name, "mental");
  assert.equal(cursor.logo, "assets/logo.png");
  assert.equal(cursor.description, plugin.description);
  assert.equal(cursor.version, plugin.version);
  assert.equal("mcpServers" in cursor, false, "Cursor shim must not auto-start clone MCP");
  assert.equal(existsSync(join(ROOT, cursor.logo)), true);

  const claude = loadJson(join(ROOT, ".claude-plugin", "plugin.json"));
  assert.equal(claude.name, "mental");
  assert.equal(claude.displayName, "Mental");
  assert.equal(claude.version, plugin.version);
  assert.equal("mcpServers" in claude, false, "Claude shim must not auto-start clone MCP");
  assert.equal(existsSync(join(ROOT, ".mcp.json")), false);
  assert.equal(claude.description, plugin.description);

  const market = loadJson(join(ROOT, ".claude-plugin", "marketplace.json"));
  assert.equal(market.name, "mental");
  assert.equal(market.plugins[0].source, "./");
  assert.equal("version" in market.plugins[0], false, "marketplace plugin entry must not set version");
});

test("optional mental-track lives outside plugin skills/", () => {
  assert.equal(existsSync(join(ROOT, "optional", "mental-track", "SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "optional", "mental-track", "rules", "mental-track.mdc")), true);
  assert.equal(existsSync(join(ROOT, "skills", "mental-track")), false);
});

test("leftover skills/mental/ must not exist; procedure lives in skill/mental/", () => {
  assert.equal(
    existsSync(join(ROOT, "skills", "mental")),
    false,
    "leftover skills/mental/ would auto-load the full procedure via Agent Plugins",
  );
  assert.equal(existsSync(join(ROOT, "skill", "mental", "SKILL.md")), true);
  assert.equal(existsSync(join(ROOT, "skill", "mental", "references", "cli.md")), true);
  assert.equal(existsSync(join(ROOT, "skill", "mental", "references", "templates.md")), true);
});

test("bootstrap skill name is mental-setup; procedure skill name is mental", () => {
  const setup = parseFrontmatter(readFileSync(join(ROOT, "skills", "mental-setup", "SKILL.md"), "utf8"));
  assert.equal(setup.name, "mental-setup", "bootstrap name must not collide with the installed procedure skill");
  const procedure = parseFrontmatter(readFileSync(join(ROOT, "skill", "mental", "SKILL.md"), "utf8"));
  assert.equal(procedure.name, "mental");
});
