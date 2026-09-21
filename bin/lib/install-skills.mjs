/**
 * Copy the Mental skill + tiny rule into user agent dirs (one source in-repo).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BEGIN, CMD, END, OPTIONAL_DIR, PKG_ROOT, RULES_DIR, VERSION } from "./pkg.mjs";
import { loadConfig } from "./config.mjs";
import { skillMetadataVersion } from "./lockstep.mjs";

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

function destSkillVersion(dest) {
  const file = join(dest, "SKILL.md");
  if (!existsSync(file)) return null;
  try {
    return skillMetadataVersion(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function sameFileBytes(a, b) {
  try {
    return existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function recordAttempt(written, skipped, failed, dest, fn) {
  try {
    const outcome = fn();
    if (outcome === "skipped") skipped.push(dest);
    else written.push(dest);
  } catch (err) {
    failed.push({
      path: dest,
      code: String(err && typeof err === "object" && "code" in err && err.code ? err.code : "internal").toLowerCase(),
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @returns {"written" | "skipped"}
 */
function copySkill(dest, { force = false } = {}) {
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
  if (!force && destSkillVersion(target) === VERSION) return "skipped";
  cpSync(skillSourceDir(), target, { recursive: true, force: true });
  return "written";
}

/**
 * @returns {"written" | "skipped"}
 */
function copyRule(dest, { force = false } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  if (!force && sameFileBytes(dest, ruleSourceFile())) return "skipped";
  cpSync(ruleSourceFile(), dest);
  return "written";
}

/**
 * @returns {"written" | "skipped"}
 */
function writePlainRule(dest, body, { force = false } = {}) {
  const next = `${body.trim()}\n`;
  mkdirSync(dirname(dest), { recursive: true });
  if (!force && existsSync(dest)) {
    try {
      if (readFileSync(dest, "utf8") === next) return "skipped";
    } catch {
      // rewrite
    }
  }
  writeFileSync(dest, next);
  return "written";
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

/**
 * @returns {"written" | "skipped"}
 */
function copyDirFollowLink(src, dest, { force = false } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  let target = dest;
  try {
    const st = lstatSync(dest);
    if (st.isSymbolicLink()) target = realpathSync(dest);
    else if (!st.isDirectory()) rmSync(dest);
  } catch {
    // dest does not exist yet
  }
  if (!force && destSkillVersion(target) === VERSION) return "skipped";
  cpSync(src, target, { recursive: true, force: true });
  return "written";
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
 * @param {{ force?: boolean }} [opts]
 * @returns {{ written: string[], skipped: string[], failed: Array<{ path: string, code: string, message: string }> }}
 */
export function copyTrackSkills(home, { force = false } = {}) {
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const failed = [];
  if (!existsSync(join(trackSkillSourceDir(), "SKILL.md"))) return { written, skipped, failed };
  const targets = userTrackTargets(home);
  for (const dest of targets.skills) {
    recordAttempt(written, skipped, failed, dest, () => copyDirFollowLink(trackSkillSourceDir(), dest, { force }));
  }
  if (existsSync(trackRuleSourceFile())) {
    recordAttempt(written, skipped, failed, targets.cursorRule, () => {
      mkdirSync(dirname(targets.cursorRule), { recursive: true });
      if (!force && sameFileBytes(targets.cursorRule, trackRuleSourceFile())) return "skipped";
      cpSync(trackRuleSourceFile(), targets.cursorRule);
      return "written";
    });
    const body = trackRuleBodyText();
    recordAttempt(written, skipped, failed, targets.claudeRule, () => writePlainRule(targets.claudeRule, body, { force }));
    recordAttempt(written, skipped, failed, targets.agentsRule, () => writePlainRule(targets.agentsRule, body, { force }));
  }
  return { written, skipped, failed };
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
 * @param {{ force?: boolean }} [opts]
 * @returns {{ file: string, created: boolean, updated: boolean, skipped?: boolean }}
 */
export function mergeManaged(file, content, { force = false } = {}) {
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
    const next = cur.replace(re, block);
    if (!force && next === cur) return { file, created: false, updated: false, skipped: true };
    writeFileSync(file, next);
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
 * @param {{ home: string, projectDir?: string | null, dryRun?: boolean, force?: boolean, homeInstall?: boolean }} opts
 */
export function installSkills({
  home,
  projectDir = null,
  dryRun = false,
  force = false,
  homeInstall = true,
}) {
  const targets = userInstallTargets(home);
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const failed = [];
  if (!dryRun) {
    const body = ruleBodyText();
    if (homeInstall) {
      for (const dest of targets.skills) {
        recordAttempt(written, skipped, failed, dest, () => copySkill(dest, { force }));
      }
      recordAttempt(written, skipped, failed, targets.cursorRule, () => copyRule(targets.cursorRule, { force }));
      recordAttempt(written, skipped, failed, targets.claudeRule, () => writePlainRule(targets.claudeRule, body, { force }));
      recordAttempt(written, skipped, failed, targets.agentsRule, () => writePlainRule(targets.agentsRule, body, { force }));
      for (const doc of targets.managedDocs) {
        recordAttempt(written, skipped, failed, doc, () => {
          const r = mergeManaged(doc, body, { force });
          return r.skipped ? "skipped" : "written";
        });
      }
      if (existsSync(targets.opencodeAgents)) {
        recordAttempt(written, skipped, failed, targets.opencodeAgents, () => {
          const r = mergeManaged(targets.opencodeAgents, body, { force });
          return r.skipped ? "skipped" : "written";
        });
      }
    }
    if (projectDir) {
      const vendored = join(projectDir, ".github", "skills", "mental");
      recordAttempt(written, skipped, failed, vendored, () => copySkill(vendored, { force }));
      const projectRule = projectCursorRule(projectDir);
      recordAttempt(written, skipped, failed, projectRule, () => copyRule(projectRule, { force }));
    }
    if (homeInstall && shouldCopyTrackSkills(home)) {
      const track = copyTrackSkills(home, { force });
      written.push(...track.written);
      skipped.push(...track.skipped);
      failed.push(...track.failed);
    }
  }
  return { ok: failed.length === 0, written, skipped, failed, targets };
}

export function skillsPresent(home) {
  return userInstallTargets(home).skills.some((d) => existsSync(join(d, "SKILL.md")));
}
