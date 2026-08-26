/**
 * Find and remove Balakit-era Mental *tooling* (skill + always-on rule).
 * Never deletes OKF data (`~/.mental` or `./.mental`).
 *
 * Balakit installed the personal Mental rule user-wide (`~/.cursor/rules/mental.mdc`,
 * managed `BEGIN balakit` blocks) and the skill via skills.sh (`-g`) into agent
 * skill dirs. Those copies still tell agents to `npx balakit doctor` and fight
 * the standalone CLI.
 */
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BALAKIT_BEGIN_RE = /<!-- BEGIN balakit\b[^>]*-->/;
const BALAKIT_BLOCK_RE =
  /<!-- BEGIN balakit\b[^>]*-->\r?\n[\s\S]*?<!-- END balakit\b[^>]*-->/g;

/**
 * Distinctive strings from the Balakit `mental` rule/skill (removed from the
 * kit in 02bf1c2). Our current skill/rule never contain these.
 * @param {string} text
 */
export function isBalakitMentalText(text) {
  if (!text) return false;
  return (
    /npx balakit doctor/i.test(text) ||
    /mentalDataPolicy/.test(text) ||
    /\.balakit\/installed\.json/.test(text) ||
    /Respect the installed Mental data policy/.test(text) ||
    /The `\.mental\/` Project Continuity Layer/.test(text) ||
    /plugins\/balakit-mental/.test(text)
  );
}

/** User-global skill dirs skills.sh used for a global `mental` install. */
export function userSkillCandidates(home) {
  return [
    join(home, ".claude", "skills", "mental"),
    join(home, ".cursor", "skills", "mental"),
    join(home, ".agents", "skills", "mental"),
    join(home, ".codex", "skills", "mental"),
    join(home, ".config", "opencode", "skills", "mental"),
    join(home, ".gemini", "skills", "mental"),
    join(home, ".codeium", "windsurf", "skills", "mental"),
    join(home, ".kilocode", "skills", "mental"),
    join(home, ".continue", "skills", "mental"),
    join(home, ".pi", "agent", "skills", "mental"),
    join(home, ".amp", "skills", "mental"),
    join(home, ".roo", "skills", "mental"),
    join(home, ".windsurf", "skills", "mental"),
  ];
}

function projectSkillCandidates(root) {
  if (!root) return [];
  return [
    join(root, ".claude", "skills", "mental"),
    join(root, ".cursor", "skills", "mental"),
    join(root, ".agents", "skills", "mental"),
    join(root, ".github", "skills", "mental"),
    join(root, "plugins", "balakit-mental"),
  ];
}

function userRuleCandidates(home) {
  return [join(home, ".cursor", "rules", "mental.mdc")];
}

function projectRuleCandidates(root) {
  if (!root) return [];
  return [
    join(root, ".cursor", "rules", "mental.mdc"),
    join(root, ".cursor", "rules", "balakit-mental.mdc"),
  ];
}

function managedDocCandidates(home, projectDir) {
  const files = [
    join(home, ".claude", "CLAUDE.md"),
    join(home, ".codex", "AGENTS.md"),
    join(home, ".agents", "AGENTS.md"),
  ];
  if (projectDir) {
    files.push(join(projectDir, "AGENTS.md"), join(projectDir, "CLAUDE.md"));
  }
  return files;
}

function pluginCandidates(home) {
  return [join(home, ".cursor", "plugins", "local", "balakit-mental")];
}

function skillMarkdown(dir) {
  try {
    return readFileSync(join(dir, "SKILL.md"), "utf8");
  } catch {
    return "";
  }
}

function readIfFile(file) {
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return "";
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function isDir(p) {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A Balakit managed block that is only the old Mental rule (safe to delete).
 * Mixed kit blocks (base/testing + mental) are reported, not stripped.
 * @param {string} block
 */
export function isMentalOnlyBalakitBlock(block) {
  if (!isBalakitMentalText(block)) return false;
  const headings = block.match(/^# .+$/gm) || [];
  return headings.length <= 1;
}

/**
 * @param {{ home: string, projectDir?: string | null }} opts
 * @returns {{
 *   skills: string[],
 *   rules: string[],
 *   plugins: string[],
 *   blocks: Array<{ file: string, strip: boolean }>,
 * }}
 */
export function findBalakitMental({ home, projectDir = null }) {
  /** @type {string[]} */
  const skills = [];
  /** @type {string[]} */
  const rules = [];
  /** @type {string[]} */
  const plugins = [];
  /** @type {Array<{ file: string, strip: boolean }>} */
  const blocks = [];

  for (const dir of [...userSkillCandidates(home), ...projectSkillCandidates(projectDir)]) {
    if (isDir(dir) && isBalakitMentalText(skillMarkdown(dir))) skills.push(dir);
  }
  for (const file of [...userRuleCandidates(home), ...projectRuleCandidates(projectDir)]) {
    if (isBalakitMentalText(readIfFile(file))) rules.push(file);
  }
  for (const dir of pluginCandidates(home)) {
    if (existsSync(dir)) plugins.push(dir);
  }
  for (const file of managedDocCandidates(home, projectDir)) {
    const cur = readIfFile(file);
    if (!BALAKIT_BEGIN_RE.test(cur) || !isBalakitMentalText(cur)) continue;
    const m = cur.match(BALAKIT_BLOCK_RE);
    const block = m ? m.join("\n") : cur;
    blocks.push({ file, strip: isMentalOnlyBalakitBlock(block) });
  }
  return { skills, rules, plugins, blocks };
}

function rmPath(p) {
  rmSync(p, { recursive: true, force: true });
}

/**
 * Drop Mental-only `BEGIN balakit` blocks. Leave mixed kit blocks intact.
 * @param {string} file
 */
export function stripMentalOnlyBalakitBlock(file) {
  const cur = readIfFile(file);
  if (!cur) return false;
  const next = cur.replace(BALAKIT_BLOCK_RE, (block) =>
    isMentalOnlyBalakitBlock(block) ? "" : block,
  );
  if (next === cur) return false;
  writeFileSync(file, next.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, ""));
  return true;
}

/**
 * Remove Balakit Mental skill/rule copies. Call *before* writing the new ones.
 * @param {{ home: string, projectDir?: string | null }} opts
 */
export function purgeBalakitMental({ home, projectDir = null }) {
  const found = findBalakitMental({ home, projectDir });
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const leftover = [];

  for (const p of [...found.skills, ...found.rules, ...found.plugins]) {
    try {
      rmPath(p);
      removed.push(p);
    } catch {
      leftover.push(p);
    }
  }
  for (const b of found.blocks) {
    if (b.strip) {
      if (stripMentalOnlyBalakitBlock(b.file)) removed.push(b.file);
      else leftover.push(b.file);
    } else {
      leftover.push(b.file);
    }
  }
  return { removed, leftover, found };
}

/** @param {{ home: string, projectDir?: string | null }} opts */
export function leftoverBalakitMentalCount(opts) {
  const f = findBalakitMental(opts);
  return f.skills.length + f.rules.length + f.plugins.length + f.blocks.length;
}
