#!/usr/bin/env node
/**
 * Keep product version strings in lockstep. package.json is source of truth.
 *
 *   node scripts/bump-version.mjs 0.4.2     # write all lockstep files
 *   node scripts/bump-version.mjs --check   # exit 1 on drift (CI / release.yml)
 */
import { fileURLToPath } from "node:url";
import { applyProductVersion, readProductVersions, SEMVER_RE } from "../bin/lib/lockstep.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = process.argv[2];

if (!arg || arg === "--help" || arg === "-h") {
  process.stderr.write("usage: node scripts/bump-version.mjs <semver>|--check\n");
  process.exit(2);
}

if (arg === "--check") {
  const r = readProductVersions(ROOT);
  if (!r.ok) {
    process.stderr.write(`${r.errors.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`lockstep ok ${r.version}\n`);
  process.exit(0);
}

if (!SEMVER_RE.test(arg)) {
  process.stderr.write(`version must be semver (got ${arg})\n`);
  process.exit(2);
}

applyProductVersion(ROOT, arg);
const r = readProductVersions(ROOT);
if (!r.ok) {
  process.stderr.write(`${r.errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`lockstep ${arg}\n`);
