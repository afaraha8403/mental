import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".mjs")) out.push(p);
  }
  return out;
}

// The dashboard runs detached, so it has no console. Any child it spawns on
// Windows without windowsHide opens (and closes) a visible terminal window.
test("every child process in bin/ is spawned with windowsHide", () => {
  const bad = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    const re = /\b(spawnSync|spawn|execFileSync|execFile)\(/g;
    let m;
    while ((m = re.exec(src))) {
      const window = src.slice(m.index, m.index + 600);
      const end = window.search(/\)\s*(\.unref\(\))?;/);
      const call = end === -1 ? window : window.slice(0, end);
      if (!/windowsHide/.test(call)) bad.push(`${file}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(bad, [], "spawn calls missing windowsHide");
});
