/**
 * Copy the Mental skill + tiny rule into user agent dirs (one source in-repo).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { BEGIN, CMD, END, OPTIONAL_DIR, PKG_ROOT, RULES_DIR, VERSION } from "./pkg.mjs";
import { loadConfig } from "./config.mjs";
import { skillMetadataVersion } from "./lockstep.mjs";
import { HOST_VIA } from "./via.mjs";

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
 * Rewrite the shipped `--via cursor` examples for one destination.
 * A string token names the host that reads the copy; `null` marks a copy several
 * hosts share (`~/.agents`, `.github/skills`), which gets the `<host>` placeholder
 * next to the token list the text already carries.
 * Deterministic per token, so managed-block merges and skip checks stay idempotent.
 * @param {string} text
 * @param {string | null} token
 */
export function templateVia(text, token) {
  return text.replace(/--via cursor(?![\w-])/g, `--via ${token ?? "<host>"}`);
}

/**
 * Rule text exactly as a host-specific copy should read.
 * @param {string | null} token
 */
export function ruleBodyFor(token) {
  return templateVia(ruleBodyText(), token);
}

/**
 * The Mental rule shipped by an installed Cursor plugin, or null.
 * Cursor loads plugin `rules/*.mdc` as well as `~/.cursor/rules`, so a home copy
 * next to the plugin puts the rule in context twice.
 * Layouts: `~/.cursor/plugins/local/mental` (local import) and
 * `~/.cursor/plugins/cache/<marketplace>/mental/<hash>` (marketplace install).
 * @param {string} home
 */
export function cursorPluginRule(home) {
  const plugins = join(home, ".cursor", "plugins");
  /** @type {string[]} */
  const candidates = [join(plugins, "local", "mental", "rules", "mental.mdc")];
  const cache = join(plugins, "cache");
  for (const market of safeReaddir(cache)) {
    for (const build of safeReaddir(join(cache, market, "mental"))) {
      candidates.push(join(cache, market, "mental", build, "rules", "mental.mdc"));
    }
  }
  return candidates.find((file) => isCursorMentalRule(file)) ?? null;
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Project Cursor rule that actually loads (`.cursor/rules/*.mdc`).
 * @param {string} projectDir
 */
export function projectCursorRule(projectDir) {
  return join(projectDir, ".cursor", "rules", "mental.mdc");
}

/**
 * Claude Code config dirs that get Mental: `~/.claude` first, then `CLAUDE_CONFIG_DIR`
 * when it names another profile. Claude Code reads only CLAUDE_CONFIG_DIR when it is
 * set, so a profile launched that way never sees what `~/.claude` holds.
 * @param {string} home
 * @param {NodeJS.ProcessEnv} [env]
 */
export function claudeConfigDirs(home, env = process.env) {
  const base = join(home, ".claude");
  const extra = env.CLAUDE_CONFIG_DIR?.trim();
  if (!extra) return [base];
  const dir = resolve(extra);
  const same = process.platform === "win32" ? dir.toLowerCase() === resolve(base).toLowerCase() : dir === resolve(base);
  return same ? [base] : [base, dir];
}

/**
 * User-global skill/rule destinations under $HOME, plus any extra Claude Code profile.
 * Cursor 2.1+ loads `cursorRule` (`~/.cursor/rules/*.mdc`) into Agent context.
 * @param {string} home
 * @param {NodeJS.ProcessEnv} [env]
 */
export function userInstallTargets(home, env = process.env) {
  const claudeProfiles = claudeConfigDirs(home, env).slice(1);
  const profileSkills = claudeProfiles.map((dir) => join(dir, "skills", "mental"));
  const profileRules = claudeProfiles.map((dir) => join(dir, "rules", "mental.md"));
  const profileDocs = claudeProfiles.map((dir) => join(dir, "CLAUDE.md"));
  const claudeMd = join(home, ".claude", "CLAUDE.md");
  const codexAgents = join(home, ".codex", "AGENTS.md");
  const agentsMd = join(home, ".agents", "AGENTS.md");
  const opencodeAgents = join(home, ".config", "opencode", "AGENTS.md");
  const cursorRule = join(home, ".cursor", "rules", "mental.mdc");
  const claudeRule = join(home, ".claude", "rules", "mental.md");
  const agentsRule = join(home, ".agents", "rules", "mental.md");
  const skills = {
    claude: join(home, ".claude", "skills", "mental"),
    cursor: join(home, ".cursor", "skills", "mental"),
    agents: join(home, ".agents", "skills", "mental"),
    opencode: join(home, ".config", "opencode", "skills", "mental"),
  };
  return {
    skills: [skills.claude, ...profileSkills, skills.cursor, skills.agents, skills.opencode],
    cursorRule,
    claudeRule,
    claudeProfiles,
    profileRules,
    agentsRule,
    claudeMd,
    codexAgents,
    agentsMd,
    opencodeAgents,
    managedDocs: [claudeMd, ...profileDocs, codexAgents, agentsMd],
    /**
     * `--via` token per destination; null = shared by several hosts.
     * OpenCode falls back to CLAUDE.md when it has no AGENTS.md of its own, so
     * those sessions see the claude-code token.
     * @type {Record<string, string | null>}
     */
    via: {
      [skills.claude]: HOST_VIA.claudeCode,
      [skills.cursor]: HOST_VIA.cursor,
      [skills.agents]: null,
      [skills.opencode]: HOST_VIA.opencode,
      [cursorRule]: HOST_VIA.cursor,
      [claudeRule]: HOST_VIA.claudeCode,
      [agentsRule]: null,
      [claudeMd]: HOST_VIA.claudeCode,
      [codexAgents]: HOST_VIA.codex,
      [agentsMd]: null,
      [opencodeAgents]: HOST_VIA.opencode,
      ...Object.fromEntries([...profileSkills, ...profileRules, ...profileDocs].map((p) => [p, HOST_VIA.claudeCode])),
    },
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

/**
 * Skip a skill recopy only when the version matches and SKILL.md already carries
 * this destination's `--via` token (installs before 0.12.2 said cursor everywhere).
 * @param {string} src
 * @param {string} target
 * @param {string | null} via
 */
function skillUpToDate(src, target, via) {
  if (destSkillVersion(target) !== VERSION) return false;
  try {
    const want = templateVia(readFileSync(join(src, "SKILL.md"), "utf8"), via);
    return readFileSync(join(target, "SKILL.md"), "utf8") === want;
  } catch {
    return false;
  }
}

/**
 * @param {string} src
 * @param {string} target
 * @param {string | null} via
 */
function copySkillTree(src, target, via) {
  cpSync(src, target, { recursive: true, force: true });
  writeFileSync(join(target, "SKILL.md"), templateVia(readFileSync(join(src, "SKILL.md"), "utf8"), via));
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
function copySkill(dest, { force = false, via = null } = {}) {
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
  if (!force && skillUpToDate(skillSourceDir(), target, via)) return "skipped";
  copySkillTree(skillSourceDir(), target, via);
  return "written";
}

/**
 * Cursor `.mdc` rule (frontmatter kept) with the destination's `--via` token.
 * @returns {"written" | "skipped"}
 */
function copyRule(dest, { force = false, via = HOST_VIA.cursor } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  const next = templateVia(readFileSync(ruleSourceFile(), "utf8"), via);
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
export function userTrackTargets(home, env = process.env) {
  const claudeProfiles = claudeConfigDirs(home, env).slice(1);
  return {
    skills: [
      join(home, ".claude", "skills", "mental-track"),
      ...claudeProfiles.map((dir) => join(dir, "skills", "mental-track")),
      join(home, ".cursor", "skills", "mental-track"),
      join(home, ".agents", "skills", "mental-track"),
      join(home, ".config", "opencode", "skills", "mental-track"),
    ],
    cursorRule: join(home, ".cursor", "rules", "mental-track.mdc"),
    claudeRule: join(home, ".claude", "rules", "mental-track.md"),
    agentsRule: join(home, ".agents", "rules", "mental-track.md"),
    profileRules: claudeProfiles.map((dir) => join(dir, "rules", "mental-track.md")),
  };
}

/**
 * @returns {"written" | "skipped"}
 */
function copyDirFollowLink(src, dest, { force = false, via = null } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  let target = dest;
  try {
    const st = lstatSync(dest);
    if (st.isSymbolicLink()) target = realpathSync(dest);
    else if (!st.isDirectory()) rmSync(dest);
  } catch {
    // dest does not exist yet
  }
  if (!force && skillUpToDate(src, target, via)) return "skipped";
  copySkillTree(src, target, via);
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
 * @param {{ force?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ written: string[], skipped: string[], failed: Array<{ path: string, code: string, message: string }> }}
 */
export function copyTrackSkills(home, { force = false, env = process.env } = {}) {
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const failed = [];
  if (!existsSync(join(trackSkillSourceDir(), "SKILL.md"))) return { written, skipped, failed };
  const targets = userTrackTargets(home, env);
  const via = userInstallTargets(home, env).via;
  targets.skills.forEach((dest) => {
    // Track skills sit next to the main skill in each host's skills dir.
    const token = via[join(dirname(dest), "mental")] ?? null;
    recordAttempt(written, skipped, failed, dest, () =>
      copyDirFollowLink(trackSkillSourceDir(), dest, { force, via: token }),
    );
  });
  if (existsSync(trackRuleSourceFile())) {
    recordAttempt(written, skipped, failed, targets.cursorRule, () => {
      mkdirSync(dirname(targets.cursorRule), { recursive: true });
      if (!force && sameFileBytes(targets.cursorRule, trackRuleSourceFile())) return "skipped";
      cpSync(trackRuleSourceFile(), targets.cursorRule);
      return "written";
    });
    const body = trackRuleBodyText();
    recordAttempt(written, skipped, failed, targets.claudeRule, () => writePlainRule(targets.claudeRule, body, { force }));
    for (const dest of [targets.agentsRule, ...targets.profileRules]) {
      recordAttempt(written, skipped, failed, dest, () => writePlainRule(dest, body, { force }));
    }
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
  for (const file of [targets.cursorRule, targets.claudeRule, targets.agentsRule, ...targets.profileRules]) {
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

function truthyEnv(v) {
  return v != null && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

/**
 * Doctor checks for host-documented rule delivery.
 * Cursor home `~/.cursor/rules/mental.mdc` is coverage. Project `.cursor/rules` is warn-only.
 * @param {{ home: string, gitRoot?: string | null }} opts
 */
export function hostRuleChecks({ home, gitRoot = null, env = process.env }) {
  const t = userInstallTargets(home, env);
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
  for (const dir of t.claudeProfiles) {
    const ok =
      existsSync(join(dir, "skills", "mental", "SKILL.md")) &&
      isPlainMentalRule(join(dir, "rules", "mental.md")) &&
      hasManagedBlock(join(dir, "CLAUDE.md"));
    checks.push({
      id: "rule-claude-profile",
      ok,
      level: "error",
      message: ok
        ? `Claude Code profile ${dir} (CLAUDE_CONFIG_DIR) has the Mental skill and rule`
        : `Claude Code profile ${dir} (CLAUDE_CONFIG_DIR) is missing the Mental skill or rule — ${installHint}`,
    });
  }
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
    const fallbackOff =
      truthyEnv(env.OPENCODE_DISABLE_CLAUDE_CODE) || truthyEnv(env.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT);
    const claudeBlock = hasManagedBlock(t.claudeMd);
    const createHint =
      "create ~/.config/opencode/AGENTS.md (it replaces the CLAUDE.md fallback for OpenCode), then run `" +
      `${CMD} install\``;
    checks.push({
      // A separate id when only the user can fix it, so doctor does not offer --fix.
      id: fallbackOff ? "rule-opencode-fallback" : "rule-opencode",
      ok: claudeBlock && !fallbackOff,
      level: "warn",
      message: fallbackOff
        ? `OpenCode's CLAUDE.md fallback is disabled (OPENCODE_DISABLE_CLAUDE_CODE*) and it has no AGENTS.md — ${createHint}`
        : claudeBlock
          ? "OpenCode has no AGENTS.md; it reads the Mental block in ~/.claude/CLAUDE.md (writes say --via claude-code)"
          : `OpenCode has no AGENTS.md and CLAUDE.md has no Mental block — ${installHint}`,
    });
  }

  const cursorHome = isCursorMentalRule(t.cursorRule);
  if (cursorPluginRule(home)) {
    checks.push({
      id: "rule-cursor-global",
      ok: !cursorHome,
      level: "warn",
      message: cursorHome
        ? `Cursor loads the Mental rule twice (plugin and ~/.cursor/rules/mental.mdc) — ${installHint} to drop the home copy`
        : "Cursor plugin ships the Mental rule",
    });
  } else {
    checks.push({
      id: "rule-cursor-global",
      ok: cursorHome,
      level: "error",
      message: cursorHome
        ? "Cursor ~/.cursor/rules/mental.mdc present"
        : `missing ~/.cursor/rules/mental.mdc — ${installHint}`,
    });
  }

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
 * @param {{ home: string, env?: NodeJS.ProcessEnv, projectDir?: string | null, dryRun?: boolean, force?: boolean, homeInstall?: boolean }} opts
 */
export function installSkills({
  home,
  env = process.env,
  projectDir = null,
  dryRun = false,
  force = false,
  homeInstall = true,
}) {
  const targets = userInstallTargets(home, env);
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const failed = [];
  /** @type {string[]} */
  const removed = [];
  const cursorPlugin = cursorPluginRule(home);
  if (!dryRun) {
    const via = targets.via;
    if (homeInstall) {
      for (const dest of targets.skills) {
        recordAttempt(written, skipped, failed, dest, () => copySkill(dest, { force, via: via[dest] }));
      }
      if (cursorPlugin) {
        // The Cursor plugin already ships this rule; a home copy would load it twice.
        if (isCursorMentalRule(targets.cursorRule)) {
          recordAttempt(removed, skipped, failed, targets.cursorRule, () => {
            rmSync(targets.cursorRule, { force: true });
            return "written";
          });
        }
      } else {
        recordAttempt(written, skipped, failed, targets.cursorRule, () =>
          copyRule(targets.cursorRule, { force, via: via[targets.cursorRule] }),
        );
      }
      for (const dest of [targets.claudeRule, ...targets.profileRules, targets.agentsRule]) {
        recordAttempt(written, skipped, failed, dest, () => writePlainRule(dest, ruleBodyFor(via[dest]), { force }));
      }
      // OpenCode's AGENTS.md is only merged when it exists: creating it would stop
      // OpenCode from reading ~/.claude/CLAUDE.md, which may carry the user's own rules.
      const docs = existsSync(targets.opencodeAgents)
        ? [...targets.managedDocs, targets.opencodeAgents]
        : targets.managedDocs;
      for (const doc of docs) {
        recordAttempt(written, skipped, failed, doc, () => {
          const r = mergeManaged(doc, ruleBodyFor(via[doc]), { force });
          return r.skipped ? "skipped" : "written";
        });
      }
    }
    if (projectDir) {
      const vendored = join(projectDir, ".github", "skills", "mental");
      recordAttempt(written, skipped, failed, vendored, () => copySkill(vendored, { force, via: null }));
      const projectRule = projectCursorRule(projectDir);
      recordAttempt(written, skipped, failed, projectRule, () => copyRule(projectRule, { force }));
    }
    if (homeInstall && shouldCopyTrackSkills(home)) {
      const track = copyTrackSkills(home, { force, env });
      written.push(...track.written);
      skipped.push(...track.skipped);
      failed.push(...track.failed);
    }
  }
  return { ok: failed.length === 0, written, skipped, failed, removed, cursorPlugin, targets };
}

export function skillsPresent(home) {
  return userInstallTargets(home).skills.some((d) => existsSync(join(d, "SKILL.md")));
}
