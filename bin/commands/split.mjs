/**
 * `mental split` — this clone gets a new UUID (empty or `--copy` of current OKF).
 */
import { findGitRoot, getRemoteUrl } from "../lib/git.mjs";
import { projectSliceDir, splitBinding } from "../lib/bindings.mjs";
import { bundleName, copyOkfTree, ensureSkeleton } from "../lib/okf.mjs";
import { resolveBundle } from "../lib/resolve.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdSplit(args, io = {}) {
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

  const gitRoot = findGitRoot(cwd, { env });
  if (!gitRoot) {
    printResult(stdout, args, false, undefined, {
      code: "not-git",
      message: "mental split needs a git repository.",
    });
    return 1;
  }

  const copy = Boolean(args.flags?.copy);
  const prior = resolveBundle({ cwd, home, env, dir: args.dir ?? null, write: true });
  if (!prior.ok) {
    printResult(stdout, args, false, undefined, prior.error);
    return 1;
  }
  const fromId = prior.data.id;
  const fromRoot = prior.data.root;

  const origin = getRemoteUrl(gitRoot, "origin", { env });
  const split = splitBinding({ home, gitRoot, origin });
  const dest = split.dest;
  if (copy && fromRoot) copyOkfTree(fromRoot, dest);
  ensureSkeleton(dest, { name: bundleName(dest, split.id) });

  printResult(
    stdout,
    args,
    true,
    { id: split.id, fromId, gitRoot, copied: copy, root: dest, dest: projectSliceDir(home, split.id) },
    undefined,
    () => `split ${fromId || "—"} → ${split.id}${copy ? " (copied OKF)" : ""}`,
  );
  return 0;
}
