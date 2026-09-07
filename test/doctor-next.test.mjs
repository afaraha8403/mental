import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorNextAction, formatDoctorNextLine, repairCommand } from "../bin/lib/doctor-next.mjs";
import { isUnsafeWindowsLine } from "../bin/lib/install-recipe.mjs";

const ASCII = /^[\x20-\x7e]+$/;

test("doctor next is ASCII, has no &&, and is safe to paste on Windows", () => {
  const rows = [
    doctorNextAction({ checks: [{ id: "skills", ok: false, level: "error" }] }),
    doctorNextAction({ checks: [{ id: "rule-cursor-project", ok: false, level: "warn" }] }),
    doctorNextAction({ checks: [{ id: "update", ok: false, level: "warn" }] }),
    doctorNextAction({ checks: [{ id: "cli-shadow", ok: false, level: "error" }], platform: "linux" }),
    doctorNextAction({ checks: [{ id: "cli-shadow", ok: false, level: "error" }], platform: "win32" }),
    doctorNextAction({ checks: [{ id: "cli-shadow", ok: false, level: "error" }], platform: "darwin" }),
  ];
  for (const next of rows) {
    assert.ok(next, "expected a next command");
    assert.match(next.command, ASCII);
    assert.doesNotMatch(next.command, /&&/);
    assert.doesNotMatch(next.command, /\.mjs/i);
    assert.equal(isUnsafeWindowsLine(next.command), false, next.command);
    const line = formatDoctorNextLine(next).replace(/^\n/, "");
    assert.match(line, ASCII);
    assert.doesNotMatch(line, /[✓✖⚠🧠·]/);
  }
  assert.equal(rows[0].command, "mental doctor --fix");
  assert.equal(rows[1].command, "mental install --project");
  assert.equal(rows[2].command, "npm i -g @balacode/mental");
  assert.equal(rows[3].command, "mental-repair");
  assert.equal(rows[4].command, "mental-repair.cmd");
  assert.equal(rows[5].command, "mental-repair");
});

test("repairCommand is mental-repair.cmd only on win32", () => {
  assert.equal(repairCommand("win32"), "mental-repair.cmd");
  assert.equal(repairCommand("linux"), "mental-repair");
  assert.equal(repairCommand("darwin"), "mental-repair");
});

test("alreadyFixed does not recommend doctor --fix again", () => {
  const next = doctorNextAction({
    checks: [
      { id: "skills", ok: true, level: "error" },
      { id: "rule-cursor-project", ok: false, level: "warn" },
    ],
    alreadyFixed: true,
  });
  assert.equal(next?.action, "ask");
  assert.equal(next?.command, "mental install --project");
});

test("fixable errors win over optional project warn", () => {
  const next = doctorNextAction({
    checks: [
      { id: "rule-claude-rules", ok: false, level: "error" },
      { id: "rule-cursor-project", ok: false, level: "warn" },
    ],
  });
  assert.equal(next?.command, "mental doctor --fix");
});

test("no next when every check passed", () => {
  assert.equal(doctorNextAction({ checks: [{ id: "home", ok: true, level: "error" }] }), null);
  assert.equal(formatDoctorNextLine(null), "");
});
