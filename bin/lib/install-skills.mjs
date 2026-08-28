/**
 * Copy the Mental skill + tiny rule into user agent dirs (one source in-repo).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BEGIN, END, OPTIONAL_DIR, RULES_DIR, SKILLS_DIR } from "./pkg.mjs";
import { loadConfig } from "./config.mjs";

export function skillSourceDir() {
  return join(SKILLS_DIR, "mental");
}

export function ruleSourceFile() {
  return join(RULES_DIR, "mental.mdc");
}

/** Body of the always-on rule (frontmatter stripped) — single source is rules/mental.mdc. */
export function ruleBodyText() {
  const raw = readFileSync(ruleSourceFile(), "utf8");
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (m ? m[1] : raw).trim();
}

/**
 * User-global skill/rule destinations under $HOME.
 * @param {string} home
 */
export function userInstallTargets(home) {
  return {
    skills: [
      join(home, ".claude", "skills", "mental"),
      join(home, ".cursor", "skills", "mental"),
      join(home, ".agents", "skills", "mental"),
      join(home, ".config", "opencode", "skills", "mental"),
    ],
    cursorRule: join(home, ".cursor", "rules", "mental.mdc"),
    managedDocs: [
      join(home, ".claude", "CLAUDE.md"),
      join(home, ".agents", "AGENTS.md"),
    ],
  };
}

function copySkill(dest) {
  mkdirSync(dirname(dest), { recursive: true });
  let target = dest;
  try {
    const st = lstatSync(dest);
    if (st.isSymbolicLink()) {
      // Balakit-era layout: ~/.claude/skills/mental → ~/.agents/skills/mental
      target = realpathSync(dest);
    } else if (!st.isDirectory()) {
      rmSync(dest);
    }
  } catch {
    // dest does not exist yet
  }
  cpSync(skillSourceDir(), target, { recursive: true, force: true });
}

function copyRule(dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(ruleSourceFile(), dest);
}

export function trackSkillSourceDir() {
  return join(OPTIONAL_DIR, "mental-track");
}

export function trackRuleSourceFile() {
  return join(trackSkillSourceDir(), "rules", "mental-track.mdc");
}

/**
 * Track skill dests. Copied only when track is on (or dest already exists).
 * Not under plugin `skills/` — Agent Plugins would auto-load it.
 * @param {string} home
 */
export function userTrackTargets(home) {
  return {
    skills: [
      join(home, ".claude", "skills", "mental-track"),
      join(home, ".cursor", "skills", "mental-track"),
      join(home, ".agents", "skills", "mental-track"),
      join(home, ".config", "opencode", "skills", "mental-track"),
    ],
    cursorRule: join(home, ".cursor", "rules", "mental-track.mdc"),
  };
}

function copyDirFollowLink(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  let target = dest;
  try {
    const st = lstatSync(dest);
    if (st.isSymbolicLink()) target = realpathSync(dest);
    else if (!st.isDirectory()) rmSync(dest);
  } catch {
    // dest does not exist yet
  }
  cpSync(src, target, { recursive: true, force: true });
}

/**
 * @param {string} home
 */
export function trackSkillPresent(home) {
  return userTrackTargets(home).skills.some((d) => existsSync(join(d, "SKILL.md")));
}

/**
 * Recopy when dest exists or track is on for any UUID / default.
 * @param {string} home
 */
export function shouldCopyTrackSkills(home) {
  if (trackSkillPresent(home) || existsSync(userTrackTargets(home).cursorRule)) return true;
  const cfg = loadConfig(home);
  const feat = cfg.features.track;
  if (!feat) return false;
  return feat.default === "on" || feat.on.length > 0;
}

/**
 * @param {string} home
 * @returns {string[]}
 */
export function copyTrackSkills(home) {
  if (!existsSync(join(trackSkillSourceDir(), "SKILL.md"))) return [];
  const targets = userTrackTargets(home);
  /** @type {string[]} */
  const written = [];
  for (const dest of targets.skills) {
    copyDirFollowLink(trackSkillSourceDir(), dest);
    written.push(dest);
  }
  if (existsSync(trackRuleSourceFile())) {
    mkdirSync(dirname(targets.cursorRule), { recursive: true });
    cpSync(trackRuleSourceFile(), targets.cursorRule);
    written.push(targets.cursorRule);
  }
  return written;
}

/**
 * @param {string} home
 */
export function removeTrackSkills(home) {
  const targets = userTrackTargets(home);
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
  return removed;
}

/**
 * Insert or replace a managed HTML-comment block.
 * @param {string} file
 * @param {string} content
 */
export function mergeManaged(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const block = `${BEGIN}\n${content.trim()}\n${END}`;
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    cur = "";
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (cur.includes(BEGIN) && cur.includes(END)) {
    const re = new RegExp(`${esc(BEGIN)}[\\s\\S]*?${esc(END)}`);
    writeFileSync(file, cur.replace(re, block));
    return { file, created: false, updated: true };
  }
  const gap = cur && !cur.endsWith("\n") ? "\n" : "";
  const prefix = cur ? `${cur}${gap}\n` : "";
  writeFileSync(file, `${prefix}${block}\n`);
  return { file, created: !existsSync(file) && !cur, updated: true };
}

/**
 * @param {{ home: string, projectDir?: string | null, dryRun?: boolean }} opts
 */
export function installSkills({ home, projectDir = null, dryRun = false }) {
  const targets = userInstallTargets(home);
  /** @type {string[]} */
  const written = [];
  if (!dryRun) {
    for (const dest of targets.skills) {
      copySkill(dest);
      written.push(dest);
    }
    copyRule(targets.cursorRule);
    written.push(targets.cursorRule);
    for (const doc of targets.managedDocs) {
      mergeManaged(doc, ruleBodyText());
      written.push(doc);
    }
    if (projectDir) {
      const vendored = join(projectDir, ".github", "skills", "mental");
      copySkill(vendored);
      written.push(vendored);
    }
    if (shouldCopyTrackSkills(home)) {
      written.push(...copyTrackSkills(home));
    }
  }
  return { ok: true, written, targets };
}

export function skillsPresent(home) {
  return userInstallTargets(home).skills.some((d) => existsSync(join(d, "SKILL.md")));
}
