#!/usr/bin/env node
/**
 * Repo-local coding-session skills. .agents/skills is canonical (Codex, Copilot,
 * Cursor, OpenCode read it); .claude/skills is a mirror for Claude Code.
 *
 *   node scripts/sync-project-skills.mjs          # mirror .agents/skills -> .claude/skills
 *   node scripts/sync-project-skills.mjs --check  # exit 1 on drift
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SRC = join(ROOT, ".agents", "skills");
export const DEST = join(ROOT, ".claude", "skills");

function files(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)],
  );
}

const norm = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

export function drift() {
  const out = [];
  for (const skill of readdirSync(SRC)) {
    const a = files(join(SRC, skill));
    const b = files(join(DEST, skill));
    for (const f of new Set([...a, ...b])) {
      const left = join(SRC, skill, f);
      const right = join(DEST, skill, f);
      if (!existsSync(left) || !existsSync(right) || norm(left) !== norm(right)) out.push(`${skill}/${f}`);
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const d = drift();
    if (d.length) {
      console.error(`.claude/skills drifted from .agents/skills:\n  ${d.join("\n  ")}\nRun: node scripts/sync-project-skills.mjs`);
      process.exit(1);
    }
    console.log("project skills in sync");
  } else {
    mkdirSync(DEST, { recursive: true });
    for (const skill of readdirSync(SRC)) {
      rmSync(join(DEST, skill), { recursive: true, force: true });
      cpSync(join(SRC, skill), join(DEST, skill), { recursive: true });
    }
    console.log(`mirrored ${readdirSync(SRC).length} skills to .claude/skills`);
  }
}
