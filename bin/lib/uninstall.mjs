/**
 * Remove Mental skill+rule copies from user agent dirs. Never deletes OKF
 * unless the uninstall command also gets `--delete-data DELETE`.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BEGIN, END } from "./pkg.mjs";
import { userInstallTargets } from "./install-skills.mjs";

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip the managed BEGIN/END block from AGENTS.md / CLAUDE.md.
 * @param {string} file
 */
export function removeManaged(file) {
  if (!existsSync(file)) return false;
  const cur = readFileSync(file, "utf8");
  if (!cur.includes(BEGIN) || !cur.includes(END)) return false;
  const re = new RegExp(`\\n?${esc(BEGIN)}[\\s\\S]*?${esc(END)}\\n?`);
  const next = cur.replace(re, "\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  writeFileSync(file, next);
  return true;
}

/**
 * @param {{ home: string, projectDir?: string | null }} opts
 */
export function uninstallSkills({ home, projectDir = null }) {
  const targets = userInstallTargets(home);
  /** @type {string[]} */
  const removed = [];
  for (const dest of targets.skills) {
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
      removed.push(dest);
    }
  }
  if (existsSync(targets.cursorRule)) {
    rmSync(targets.cursorRule, { force: true });
    removed.push(targets.cursorRule);
  }
  for (const doc of targets.managedDocs) {
    if (removeManaged(doc)) removed.push(doc);
  }
  if (projectDir) {
    const vendored = join(projectDir, ".github", "skills", "mental");
    if (existsSync(vendored)) {
      rmSync(vendored, { recursive: true, force: true });
      removed.push(vendored);
    }
  }
  return { ok: true, removed };
}
