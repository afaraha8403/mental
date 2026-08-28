import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initRepo, mental, tempHome } from "./helpers.mjs";

function parseOk(r, label) {
  assert.equal(r.status, 0, `${label}: ${r.stderr || r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true, `${label}: ${JSON.stringify(body.error || body)}`);
  return body;
}

function parseErr(r, label) {
  assert.notEqual(r.status, 0, `${label} should fail: ${r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false, label);
  return body;
}

function seed(home, root) {
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "Continue"]), "seed");
}

test("option list has needsConsent; track off does not suggest option on", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(home, root);
  const listed = parseOk(mental(home, root, ["option", "--json"]), "option list");
  assert.equal(listed.data.optionals.length, 3);
  for (const row of listed.data.optionals) {
    assert.equal(row.needsConsent, true);
    assert.equal(typeof row.command, "string");
  }
  const off = parseErr(mental(home, root, ["track", "start", "--json", "--title-internal", "Nope"]), "track off");
  assert.match(off.error.message, /Time tracking is off/);
  assert.doesNotMatch(off.error.message, /option track on/);
});

test("option track is per-UUID; --this before identity is usage; hooks/mcp reject --this", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const before = parseErr(mental(home, root, ["option", "track", "on", "--json"]), "track on no uuid");
  assert.equal(before.error.code, "usage");

  seed(home, root);
  parseOk(mental(home, root, ["option", "track", "on", "--json"]), "track on this");
  const where = parseOk(mental(home, root, ["where", "--json"]), "where");
  const cfg = JSON.parse(readFileSync(join(home, ".mental", "config.json"), "utf8"));
  assert.ok(cfg.features.track.on.includes(where.data.id));

  const mcpThis = parseErr(mental(home, root, ["option", "mcp", "on", "--this", "--json"]), "mcp --this");
  assert.match(mcpThis.error.message, /user-global/);
  const hooksThis = parseErr(mental(home, root, ["option", "hooks", "on", "--this", "--json"]), "hooks --this");
  assert.match(hooksThis.error.message, /user-global/);
});

test("option track on --all then off this UUID; hooks on aliases config", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(home, root);
  parseOk(mental(home, root, ["option", "track", "on", "--all", "--json"]), "track --all");
  const cfg = JSON.parse(readFileSync(join(home, ".mental", "config.json"), "utf8"));
  assert.equal(cfg.features.track.default, "on");
  parseOk(mental(home, root, ["option", "track", "off", "--json"]), "track off this");
  const cfg2 = JSON.parse(readFileSync(join(home, ".mental", "config.json"), "utf8"));
  const where = parseOk(mental(home, root, ["where", "--json"]), "where");
  assert.ok(cfg2.features.track.off.includes(where.data.id));
  const blocked = parseErr(mental(home, root, ["track", "--json"]), "track off this");
  assert.match(blocked.error.message, /Time tracking is off/);

  parseOk(mental(home, root, ["hooks", "on", "--json"]), "hooks on alias");
  const cfg3 = JSON.parse(readFileSync(join(home, ".mental", "config.json"), "utf8"));
  assert.equal(cfg3.features.hooks.default, "on");
});

test("option track off with a runner is usage; copies mental-track skill on enable", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(home, root);
  parseOk(mental(home, root, ["option", "track", "on", "--json"]), "enable");
  assert.equal(existsSync(join(home, ".agents", "skills", "mental-track", "SKILL.md")), true);
  parseOk(
    mental(home, root, ["track", "start", "--json", "--title-internal", "Keep running"]),
    "start",
  );
  const off = parseErr(mental(home, root, ["option", "track", "off", "--json"]), "off while running");
  assert.match(off.error.message, /running interval/);
});

test("install and doctor return optionals[] with needsConsent", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  const inst = parseOk(mental(home, root, ["install", "--json"]), "install");
  assert.ok(Array.isArray(inst.data.optionals));
  const track = inst.data.optionals.find((o) => o.id === "track");
  assert.equal(track.needsConsent, true);
  const doc = parseOk(mental(home, root, ["doctor", "--json"]), "doctor");
  assert.ok(Array.isArray(doc.data.optionals));
  assert.equal(
    doc.data.optionals.every((o) => o.needsConsent === true),
    true,
  );
});

test("uninstall removes mental-track dests and leaves time.sqlite unless DELETE", () => {
  const home = tempHome();
  const { root } = initRepo(home);
  seed(home, root);
  parseOk(mental(home, root, ["option", "track", "on", "--json"]), "enable");
  parseOk(mental(home, root, ["track", "start", "--json", "--title-internal", "Hours"]), "start");
  const slice = parseOk(mental(home, root, ["where", "--json"]), "where").data.root;
  parseOk(mental(home, root, ["uninstall", "--json"]), "uninstall");
  assert.equal(existsSync(join(home, ".agents", "skills", "mental-track")), false);
  assert.equal(existsSync(join(slice, "time.sqlite")), true);
});
