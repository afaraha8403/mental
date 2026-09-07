/**
 * Copy the Mental skill + tiny rule into user agent dirs (one source in-repo).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BEGIN, CMD, END, OPTIONAL_DIR, PKG_ROOT, RULES_DIR } from "./pkg.mjs";
import { loadConfig } from "./config.mjs";

/**
 * Directory of the full Mental procedure copied by `mental install`.
 * Kept out of plugin `skills/` so Agent Plugins does not auto-load it.
 */
export function skillSourceDir() {
  return join(PKG_ROOT, "skill", "mental");
}

export function ruleSourceFile() {
  return join(RULES_DIR, "mental.mdc");
}

/**
 * Strip YAML frontmatter from a Cursor `.mdc` rule so `.md` hosts get body only.
 * @param {string} raw
 */
export function stripRuleFrontmatter(raw) {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (m ? m[1] : raw).trim();
}

/** Body of the always-on rule (frontmatter stripped) — single source is rules/mental.mdc. */
export function ruleBodyText() {
  return stripRuleFrontmatter(readFileSync(ruleSourceFile(), "utf8"));
}

/**
 * Project Cursor rule that actually loads (`.cursor/rules/*.mdc`).
 * @param {string} projectDir
 */
export function projectCursorRule(projectDir) {
  return join(projectDir, ".cursor", "rules", "mental.mdc");
}

/**
 * User-global skill/rule destinations under $HOME.
 * Cursor 2.1+ loads `cursorRule` (`~/.cursor/rules/*.mdc`) into Agent context.
 * @param {string} home
 */
export function userInstallTargets(home) {
  const claudeMd = join(home, ".claude", "CLAUDE.md");
  const codexAgents = join(home, ".codex", "AGENTS.md");
  const agentsMd = join(home, ".agents", "AGENTS.md");
  return {
    skills: [
      join(home, ".claude", "skills", "mental"),
      join(home, ".cursor", "skills", "mental"),
      join(home, ".agents", "skills", "mental"),
      join(home, ".config", "opencode", "skills", "mental"),
    ],
    cursorRule: join(home, ".cursor", "rules", "mental.mdc"),
    claudeRule: join(home, ".claude", "rules", "mental.md"),
    agentsRule: join(home, ".agents", "rules", "mental.md"),
    claudeMd,
    codexAgents,
    agentsMd,
    opencodeAgents: join(home, ".config", "opencode", "AGENTS.md"),
    managedDocs: [claudeMd, codexAgents, agentsMd],
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

function writePlainRule(dest, body) {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${body.trim()}\n`);
}

export function trackSkillSourceDir() {
  return join(OPTIONAL_DIR, "mental-track");
}

export function trackRuleSourceFile() {
  return join(trackSkillSourceDir(), "rules", "mental-track.mdc");
}

function trackRuleBodyText() {
  if (!existsSync(trackRuleSourceFile())) return "";
  return stripRuleFrontmatter(readFileSync(trackRuleSourceFile(), "utf8"));
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
    claudeRule: join(home, ".claude", "rules", "mental-track.md"),
    agentsRule: join(home, ".agents", "rules", "mental-track.md"),
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
  const t = userTrackTargets(home);
  if (
    trackSkillPresent(home) ||
    existsSync(t.cursorRule) ||
    existsSync(t.claudeRule) ||
    existsSync(t.agentsRule)
  ) {
    return true;
  }
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
    const body = trackRuleBodyText();
    writePlainRule(targets.claudeRule, body);
    written.push(targets.claudeRule);
    writePlainRule(targets.agentsRule, body);
    written.push(targets.agentsRule);
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
  for (const file of [targets.cursorRule, targets.claudeRule, targets.agentsRule]) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
      removed.push(file);
    }
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
  const existed = existsSync(file);
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
  return { file, created: !existed && !cur, updated: true };
}

/**
 * @param {string} file
 */
export function hasManagedBlock(file) {
  if (!existsSync(file)) return false;
  try {
    const cur = readFileSync(file, "utf8");
    return cur.includes(BEGIN) && cur.includes(END);
  } catch {
    return false;
  }
}

/**
 * True when dest is a frontmatter-free Mental rule body (Claude/agents `.md`).
 * @param {string} file
 */
export function isPlainMentalRule(file) {
  if (!existsSync(file)) return false;
  try {
    const text = readFileSync(file, "utf8");
    return text.includes("Continuity is Mental CLI") && !text.trimStart().startsWith("---");
  } catch {
    return false;
  }
}

/**
 * True when dest is a Cursor `.mdc` Mental rule (frontmatter + alwaysApply).
 * @param {string} file
 */
export function isCursorMentalRule(file) {
  if (!existsSync(file)) return false;
  try {
    const text = readFileSync(file, "utf8");
    return (
      text.trimStart().startsWith("---") &&
      /alwaysApply:\s*true/.test(text) &&
      text.includes("Continuity is Mental CLI")
    );
  } catch {
    return false;
  }
}

/**
 * Doctor checks for host-documented rule delivery.
 * Cursor home `~/.cursor/rules/mental.mdc` is coverage. Project `.cursor/rules` is warn-only.
 * @param {{ home: string, gitRoot?: string | null }} opts
 */
export function hostRuleChecks({ home, gitRoot = null }) {
  const t = userInstallTargets(home);
  const installHint = `run \`${CMD} install\``;
  /** @type {{ id: string, ok: boolean, message: string, level: string }[]} */
  const checks = [];

  checks.push({
    id: "rule-claude-md",
    ok: hasManagedBlock(t.claudeMd),
    level: "error",
    message: hasManagedBlock(t.claudeMd)
      ? "Claude Code CLAUDE.md has managed Mental block"
      : `missing managed Mental block in ~/.claude/CLAUDE.md — ${installHint}`,
  });
  checks.push({
    id: "rule-claude-rules",
    ok: isPlainMentalRule(t.claudeRule),
    level: "error",
    message: isPlainMentalRule(t.claudeRule)
      ? "Claude Code ~/.claude/rules/mental.md present"
      : `missing ~/.claude/rules/mental.md — ${installHint}`,
  });
  checks.push({
    id: "rule-codex",
    ok: hasManagedBlock(t.codexAgents),
    level: "error",
    message: hasManagedBlock(t.codexAgents)
      ? "Codex ~/.codex/AGENTS.md has managed Mental block"
      : `missing managed Mental block in ~/.codex/AGENTS.md — ${installHint}`,
  });

  const override = join(home, ".codex", "AGENTS.override.md");
  if (existsSync(override)) {
    checks.push({
      id: "rule-codex-override",
      ok: false,
      level: "warn",
      message: "Codex loads ~/.codex/AGENTS.override.md instead of AGENTS.md; Mental's block may not apply",
    });
  }

  if (existsSync(t.opencodeAgents)) {
    const ok = hasManagedBlock(t.opencodeAgents);
    checks.push({
      id: "rule-opencode",
      ok,
      level: "error",
      message: ok
        ? "OpenCode ~/.config/opencode/AGENTS.md has managed Mental block"
        : `~/.config/opencode/AGENTS.md exists without a Mental block — ${installHint}`,
    });
  } else {
    checks.push({
      id: "rule-opencode",
      ok: hasManagedBlock(t.claudeMd),
      level: "warn",
      message: hasManagedBlock(t.claudeMd)
        ? "OpenCode has no AGENTS.md; it will fall back to ~/.claude/CLAUDE.md"
        : `OpenCode has no AGENTS.md and CLAUDE.md has no Mental block — ${installHint}`,
    });
  }

  const cursorOk = isCursorMentalRule(t.cursorRule);
  checks.push({
    id: "rule-cursor-global",
    ok: cursorOk,
    level: "error",
    message: cursorOk
      ? "Cursor ~/.cursor/rules/mental.mdc present"
      : `missing ~/.cursor/rules/mental.mdc — ${installHint}`,
  });

  if (gitRoot) {
    const projectRule = projectCursorRule(gitRoot);
    const present = existsSync(projectRule);
    checks.push({
      id: "rule-cursor-project",
      ok: present,
      level: "warn",
      message: present
        ? "project .cursor/rules/mental.mdc present"
        : "no project .cursor/rules/mental.mdc — optional for Cloud/CLI; run `mental install --project`",
    });
  }

  return checks;
}

/**
 * @param {{ home: string, projectDir?: string | null, dryRun?: boolean }} opts
 */
export function installSkills({ home, projectDir = null, dryRun = false }) {
  const targets = userInstallTargets(home);
  /** @type {string[]} */
  const written = [];
  if (!dryRun) {
    const body = ruleBodyText();
    for (const dest of targets.skills) {
      copySkill(dest);
      written.push(dest);
    }
    copyRule(targets.cursorRule);
    written.push(targets.cursorRule);
    writePlainRule(targets.claudeRule, body);
    written.push(targets.claudeRule);
    writePlainRule(targets.agentsRule, body);
    written.push(targets.agentsRule);
    for (const doc of targets.managedDocs) {
      mergeManaged(doc, body);
      written.push(doc);
    }
    if (existsSync(targets.opencodeAgents)) {
      mergeManaged(targets.opencodeAgents, body);
      written.push(targets.opencodeAgents);
    }
    if (projectDir) {
      const vendored = join(projectDir, ".github", "skills", "mental");
      copySkill(vendored);
      written.push(vendored);
      const projectRule = projectCursorRule(projectDir);
      copyRule(projectRule);
      written.push(projectRule);
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
