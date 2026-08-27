/**
 * `mental remap` — list bindings, or point this clone at an existing UUID.
 * Flags, not a standing TTY session: `--to <id>` or `--from <id>`.
 */
import { findGitRoot, getRemoteUrl } from "../lib/git.mjs";
import { loadBindings, remapToBinding } from "../lib/bindings.mjs";
import { printResult } from "../lib/output.mjs";

export function formatBindings(home) {
  const data = loadBindings(home);
  if (!data.bindings.length) return "(no bindings)";
  return data.bindings
    .map((b) =>
      [
        `${b.id}  ${b.name || ""}`.trim(),
        `  origins  ${(b.origins || []).join(", ") || "—"}`,
        `  paths    ${(b.paths || []).join(", ") || "—"}`,
        b.store ? `  store    ${b.store}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function cmdRemap(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  if (!home) {
    printResult(stdout, args, false, undefined, {
      code: "no-home",
      message: "HOME is unset; Mental will not write.",
    });
    return 1;
  }

  const to =
    (typeof args.flags?.to === "string" && args.flags.to) ||
    (typeof args.flags?.from === "string" && args.flags.from) ||
    null;

  if (!to) {
    const list = formatBindings(home);
    printResult(stdout, args, true, { bindings: loadBindings(home).bindings }, undefined, () =>
      `${list}\n\nPoint this clone: mental remap --to <id>`,
    );
    return 0;
  }

  const gitRoot = findGitRoot(cwd, { env });
  if (!gitRoot) {
    printResult(stdout, args, false, undefined, {
      code: "not-git",
      message: "mental remap needs a git repository.",
    });
    return 1;
  }

  const origin = getRemoteUrl(gitRoot, "origin", { env });
  const result = remapToBinding({ home, gitRoot, toId: to, origin });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, { code: result.code, message: result.message });
    return 1;
  }
  printResult(
    stdout,
    args,
    true,
    { id: result.id, gitRoot, origin },
    undefined,
    () => `this clone → ${result.id}`,
  );
  return 0;
}
