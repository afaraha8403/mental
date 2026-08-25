/**
 * `mental local` — opt in to a project-local bundle.
 * Refuse unless git will ignore `./.mental/` (v1 always private).
 *
 * Leftover Balakit `./.mental` is snapshotted into the home UUID store first,
 * then this folder becomes the write root.
 *
 * `--import` copies the home UUID slice into `./.mental`.
 * `--move` does the same and marks the binding store=local (home files stay
 * unless `--delete-home`).
 */
import { existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { findGitRoot } from "../lib/git.mjs";
import { assertLocalIgnorable } from "../lib/ignore.mjs";
import { bundleName, copyOkfTree, ensureSkeleton } from "../lib/okf.mjs";
import { printResult } from "../lib/output.mjs";
import { resolveBundle } from "../lib/resolve.mjs";
import { projectSliceDir, setBindingStore } from "../lib/bindings.mjs";
import { isOptedInLocal, markOptedInLocal } from "../lib/import-legacy.mjs";

export function cmdLocal(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  const home = args.home ?? env.HOME ?? env.USERPROFILE ?? null;
  const doImport = Boolean(args.flags?.import);
  const doMove = Boolean(args.flags?.move);
  const deleteHome = Boolean(args.flags?.["delete-home"]);

  const gitRoot = findGitRoot(cwd, { env });
  const destRoot = gitRoot || cwd;
  const dest = join(destRoot, ".mental");

  const gate = assertLocalIgnorable(destRoot, { env });
  if (!gate.ok) {
    printResult(stdout, args.json, false, undefined, gate.error);
    return 1;
  }

  const leftoverExists = existsSync(dest);
  const alreadyOpted = leftoverExists && isOptedInLocal(dest);

  if (leftoverExists && !alreadyOpted) {
    resolveBundle({
      cwd,
      home,
      env,
      dir: args.dir ?? null,
      write: true,
    });
  }

  const homeWhere = resolveBundle({
    cwd,
    home,
    env,
    dir: args.dir ?? null,
    write: true,
  });
  if (!homeWhere.ok) {
    printResult(stdout, args.json, false, undefined, homeWhere.error);
    return 1;
  }

  const created = !leftoverExists;
  ensureSkeleton(dest, { name: bundleName(dest, basename(destRoot)) });

  let copied = [];
  if ((doImport || doMove) && homeWhere.data.id && homeWhere.data.mode !== "local") {
    const slice = projectSliceDir(home, homeWhere.data.id);
    copied = copyOkfTree(slice, dest);
  } else if ((doImport || doMove) && homeWhere.data.mode === "home" && homeWhere.data.root) {
    copied = copyOkfTree(homeWhere.data.root, dest);
  }

  markOptedInLocal(dest);

  const where = resolveBundle({
    cwd,
    home,
    env,
    dir: args.dir ?? null,
    write: true,
  });
  if (where.ok && where.data.id && home) {
    setBindingStore(home, where.data.id, "local");
  }

  let purged = null;
  if (doMove && deleteHome && homeWhere.data.id && home) {
    const slice = projectSliceDir(home, homeWhere.data.id);
    if (existsSync(slice) && slice !== dest) {
      rmSync(slice, { recursive: true, force: true });
      purged = slice;
    }
  }

  const data = {
    root: dest,
    created,
    imported: doImport || doMove,
    copied,
    purged,
    gitRoot: gitRoot || null,
    where: where.ok ? where.data : null,
  };
  printResult(
    stdout,
    args.json,
    true,
    data,
    undefined,
    () =>
      `${created ? "created" : "already present"} ${dest}${copied.length ? `\ncopied ${copied.join(", ")}` : ""}`,
  );
  return 0;
}
