/**
 * OS/shell install recipes. Source of truth for agent paste, setup skill, and CI.
 *
 * Windows PowerShell resolves `mental` to `mental.ps1` first (PATHEXT prepend).
 * Restricted policy or ShellExecute of a leftover / bin target opens `cli.mjs`
 * ("how do you want to open this file?"). After `npm i -g`, Windows PowerShell
 * and Windows Terminal (PowerShell profile) must use `npx --yes` or `mental.cmd`.
 * Never bare `mental` on Windows PowerShell.
 *
 * Windows Terminal is a host, not a shell. Profiles: PowerShell, cmd, Git Bash.
 */
import { CMD, NAME } from "./pkg.mjs";

/** Shells we publish a recipe for. `zsh` shares the bash recipe. */
export const INSTALL_SHELLS = ["powershell", "cmd", "bash", "sh"];

/**
 * @param {string} [shell]
 * @returns {"powershell" | "cmd" | "bash" | "sh"}
 */
export function normalizeShell(shell) {
  const s = String(shell || "").toLowerCase().replace(/\.exe$/i, "");
  if (s === "pwsh" || s === "powershell") return "powershell";
  if (s === "cmd" || s === "command" || s === "command.com" || s === "dos") return "cmd";
  if (s === "zsh" || s === "bash") return "bash";
  if (s === "sh" || s === "dash" || s === "ash") return "sh";
  return "bash";
}

/**
 * @param {string} [platform]
 * @param {string} [shell]
 */
export function recipeId(platform, shell) {
  const plat = platform || "linux";
  const sh = normalizeShell(shell);
  if (plat === "win32") {
    if (sh === "powershell") return "win-powershell";
    if (sh === "cmd") return "win-cmd";
    return "win-bash";
  }
  return sh === "sh" ? "unix-sh" : "unix-bash";
}

/**
 * CreateProcess cannot run npm/npx `.cmd` shims. CI and install spawn this.
 *
 * @param {string} command
 * @param {string} [platform]
 */
export function win32SpawnCommand(command, platform = "linux") {
  if (platform !== "win32") return command;
  if (command === "npm" || command === "npx") return `${command}.cmd`;
  return command;
}

/**
 * Drop a trailing slash so `cmd` + `shell: true` does not turn `C:\pkg\` into `\"`.
 *
 * @param {string} root
 */
export function packageSpecPath(root) {
  const trimmed = String(root).replace(/[\\/]+$/, "");
  return trimmed || root;
}

/**
 * argv that never ShellExecutes a `.mjs` file.
 *
 * @param {string[]} cliArgs
 * @param {{ platform?: string, shell?: string }} [opts]
 * @returns {{ command: string, args: string[], line: string }}
 */
export function invokeArgv(cliArgs, opts = {}) {
  const platform = opts.platform ?? "linux";
  const shell = normalizeShell(opts.shell);
  if (platform === "win32") {
    if (shell === "powershell") {
      const args = ["--yes", NAME, ...cliArgs];
      return { command: "npx", args, line: ["npx", ...args].join(" ") };
    }
    if (shell === "cmd") {
      return {
        command: `${CMD}.cmd`,
        args: cliArgs,
        line: [`${CMD}.cmd`, ...cliArgs].join(" ").trim(),
      };
    }
  }
  return { command: CMD, args: cliArgs, line: [CMD, ...cliArgs].join(" ").trim() };
}

/**
 * Three install lines for one OS/shell.
 *
 * @param {{ platform?: string, shell?: string }} [opts]
 */
export function installLines(opts = {}) {
  const global = `npm i -g ${NAME}`;
  const setup = invokeArgv(["install"], opts);
  const doctor = invokeArgv(["doctor"], opts);
  return [global, setup.line, doctor.line];
}

/** Agent paste / setup skill: one Windows block that works in PowerShell, cmd, and Windows Terminal. */
export function windowsAgentLines() {
  return installLines({ platform: "win32", shell: "powershell" });
}

/** Agent paste / setup skill: macOS, Linux, Git Bash. */
export function unixAgentLines() {
  return installLines({ platform: "linux", shell: "bash" });
}

/**
 * Every published recipe (CI + docs lock).
 *
 * @returns {Array<{ id: string, platform: string, shell: string, host: string, lines: string[] }>}
 */
export function allRecipes() {
  return [
    {
      id: "win-powershell",
      platform: "win32",
      shell: "powershell",
      host: "Windows Terminal (PowerShell profile) or Windows PowerShell",
      lines: installLines({ platform: "win32", shell: "powershell" }),
    },
    {
      id: "win-cmd",
      platform: "win32",
      shell: "cmd",
      host: "Command Prompt, Windows Terminal (cmd), MS-DOS-style cmd.exe",
      lines: installLines({ platform: "win32", shell: "cmd" }),
    },
    {
      id: "win-bash",
      platform: "win32",
      shell: "bash",
      host: "Git Bash in Windows Terminal",
      lines: installLines({ platform: "win32", shell: "bash" }),
    },
    {
      id: "macos-bash",
      platform: "darwin",
      shell: "bash",
      host: "macOS Terminal / iTerm (bash or zsh)",
      lines: installLines({ platform: "darwin", shell: "bash" }),
    },
    {
      id: "linux-bash",
      platform: "linux",
      shell: "bash",
      host: "Linux bash",
      lines: installLines({ platform: "linux", shell: "bash" }),
    },
    {
      id: "linux-sh",
      platform: "linux",
      shell: "sh",
      host: "Linux sh",
      lines: installLines({ platform: "linux", shell: "sh" }),
    },
  ];
}

/**
 * True when this command line would ShellExecute a `.mjs` on Windows.
 *
 * @param {string} line
 */
export function isUnsafeWindowsLine(line) {
  const t = String(line).trim();
  if (/\.mjs(\s|$)/i.test(t) && !/\bnode\b/i.test(t)) return true;
  if (/^mental(\s|$)/.test(t)) return true;
  return false;
}
