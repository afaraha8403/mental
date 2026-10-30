/**
 * Hosts that load Agent Skills. Doctor reports which of them are present and
 * whether they can see the installed Mental skill.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Home-relative dir that means the host is installed, and the skill paths it reads. */
export const SKILL_HOSTS = [
  {
    id: "cursor",
    homeDir: ".cursor",
    reads: ["~/.agents/skills/mental", "~/.cursor/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "claude-code",
    homeDir: ".claude",
    reads: ["~/.claude/skills/mental", "<repo>/.claude/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "codex",
    homeDir: ".codex",
    reads: ["~/.agents/skills/mental", "~/.codex/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "copilot",
    homeDir: ".copilot",
    reads: ["~/.agents/skills/mental", "<repo>/.github/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "opencode",
    homeDir: ".config/opencode",
    reads: ["~/.agents/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "windsurf",
    homeDir: ".codeium/windsurf",
    reads: ["~/.agents/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
  {
    id: "cline",
    homeDir: ".cline",
    reads: ["~/.agents/skills/mental", "<repo>/.agents/skills/mental"],
    invocable: "/mental",
  },
];

/**
 * @param {string} home
 * @param {string} spec `~/.agents/skills/mental` or `<repo>/.agents/skills/mental`
 * @param {string | null} projectDir
 */
function skillFile(home, spec, projectDir) {
  if (spec.startsWith("~/")) return join(home, spec.slice(2), "SKILL.md");
  if (spec.startsWith("<repo>/") && projectDir) return join(projectDir, spec.slice("<repo>/".length), "SKILL.md");
  return null;
}

/**
 * Detected hosts and whether each skill path they read is present.
 * @param {string | null} home
 * @param {string | null} projectDir
 */
export function detectSkillHosts(home, projectDir) {
  if (!home) return [];
  const shared = existsSync(join(home, ".agents", "skills", "mental", "SKILL.md"));
  /** @type {Array<{ id: string, detected: boolean, invocable: string, paths: Array<{ path: string, state: "ok" | "missing" }> }>} */
  const out = [];
  for (const host of SKILL_HOSTS) {
    const detected = existsSync(join(home, host.homeDir));
    if (!detected) continue;
    const paths = host.reads.map((spec) => {
      const file = skillFile(home, spec, projectDir);
      const state = file && existsSync(file) ? "ok" : "missing";
      return { path: spec, state: spec.startsWith("~/") && spec.includes(".agents/skills") ? (shared ? "ok" : "missing") : state };
    });
    out.push({ id: host.id, detected: true, invocable: host.invocable, paths });
  }
  return out;
}
