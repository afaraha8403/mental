/**
 * Copy the Mental skill + tiny rule into user agent dirs (one source in-repo).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BEGIN, END, RULES_DIR, SKILLS_DIR } from "./pkg.mjs";

const RULE_BODY = `Continuity is Mental. On start/finish of real work, or orientation questions, use the Mental skill.

Run \`mental where\` then \`mental status --json\` (or \`mental search --json\`). Do not grep \`.mental\` or \`~/.mental\`. Do not parse YAML frontmatter yourself.

If \`mental\` is not on PATH, try \`npx @mental/cli …\`. If that fails, continue the user's coding task and mention install. Missing Mental must not block work.

Never commit Mental data. Never write secrets. Never edit gitignore; tell the user to run \`mental doctor\`.
`;

export function skillSourceDir() {
  return join(SKILLS_DIR, "mental");
}

export function ruleSourceFile() {
  return join(RULES_DIR, "mental.mdc");
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
      mergeManaged(doc, RULE_BODY);
      written.push(doc);
    }
    if (projectDir) {
      const vendored = join(projectDir, ".github", "skills", "mental");
      copySkill(vendored);
      written.push(vendored);
    }
  }
  return { ok: true, written, targets };
}

export function skillsPresent(home) {
  return userInstallTargets(home).skills.some((d) => existsSync(join(d, "SKILL.md")));
}
