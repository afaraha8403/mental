/**
 * `mental doctor` — PATH, where, bindings, ignore, skill presence.
 * Exit 3 when problems exist (still prints JSON).
 */
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { resolveBundle, findLocalMental } from "../lib/resolve.mjs";
import { loadBindings } from "../lib/bindings.mjs";
import { checkMentalIgnored, ensureMentalExcluded, gitAvailable } from "../lib/ignore.mjs";
import { skillsPresent } from "../lib/install-skills.mjs";
import { printResult, brandMark } from "../lib/output.mjs";
import { CMD } from "../lib/pkg.mjs";
import { isOptedInLocal } from "../lib/import-legacy.mjs";
import { findGitRoot } from "../lib/git.mjs";
import { indexPath } from "../lib/index.mjs";

function check(id, ok, message, level = "error") {
  return { id, ok, level, message };
}

export function cmdDoctor(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const cwd = args.cwd ?? process.cwd();
  const env = args.env ?? process.env;
  const fixIgnore = Boolean(args.flags?.["fix-ignore"]);

  /** @type {ReturnType<typeof check>[]} */
  const checks = [];

  if (!home) {
    checks.push(check("home", false, "HOME unset; no writes"));
  } else {
    checks.push(check("home", true, home));
  }

  checks.push(
    check("git", gitAvailable({ env }), gitAvailable({ env }) ? "git on PATH" : "git missing"),
  );

  if (fixIgnore && home) {
    const r = ensureMentalExcluded({ home, env });
    checks.push(
      check(
        "fix-ignore",
        Boolean(r.ok),
        r.ok ? `excludes: ${r.file}` : r.reason || "fix-ignore failed",
      ),
    );
  }

  const resolved = resolveBundle({
    cwd,
    home,
    env,
    dir: args.dir ?? null,
    write: false,
  });
  if (resolved.ok) {
    checks.push(check("where", true, `${resolved.data.mode} ${resolved.data.root}`));
    if (resolved.data.mode === "local") {
      const ign = checkMentalIgnored({ cwd, env });
      checks.push(
        check(
          "local-ignore",
          ign.liveIgnored === true,
          ign.liveIgnored
            ? ".mental/ is ignored"
            : "local .mental/ is NOT ignored — run mental doctor --fix-ignore",
        ),
      );
    }
    if (resolved.data.id) {
      const file = indexPath(home, resolved.data.id, env);
      const has = existsSync(file);
      checks.push(
        check(
          "index",
          true,
          has ? `sqlite ${file}` : "no sqlite index yet — run mental where or mental reindex",
          has ? "info" : "warn",
        ),
      );
    }
  } else {
    checks.push(check("where", false, resolved.error.message));
  }

  if (home) {
    /** @type {ReturnType<typeof loadBindings> | null} */
    let bindings = null;
    try {
      bindings = loadBindings(home);
      checks.push(check("bindings", true, `${bindings.bindings.length} binding(s)`));
    } catch (err) {
      checks.push(check("bindings", false, err instanceof Error ? err.message : String(err)));
    }

    checks.push(
      check(
        "skills",
        skillsPresent(home),
        skillsPresent(home)
          ? "skill present in a user agent dir"
          : `run \`${CMD} install\``,
      ),
    );

    const gitRoot = resolved.ok ? resolved.data.gitRoot : findGitRoot(cwd, { env });
    const leftover = findLocalMental(cwd, { home, gitRoot });
    if (leftover && !isOptedInLocal(leftover)) {
      const leftoverAbs = resolvePath(leftover);
      const imported = Boolean(
        bindings?.bindings.some(
          (x) => x.legacyImportedFrom && resolvePath(x.legacyImportedFrom) === leftoverAbs,
        ),
      );
      checks.push(
        check(
          "legacy-import",
          true,
          imported
            ? `leftover ${leftover} still on disk; already imported into ~/.mental/projects (not deleted)`
            : `leftover ${leftover} will import into ~/.mental/projects on next write (status/journal/install)`,
          "warn",
        ),
      );
    }
  }

  const problems = checks.filter((c) => !c.ok && c.level === "error");
  const data = {
    checks,
    where: resolved.ok ? resolved.data : null,
    problems: problems.length,
  };
  printResult(
    stdout,
    args.json,
    true,
    data,
    undefined,
    (d) =>
      d.checks
        .map((c) => `${c.ok ? "✓" : "✖"} ${c.id}: ${c.message}`)
        .join("\n") +
      (problems.length ? `\n${problems.length} problem(s)` : `\n${brandMark()} doctor clean`),
  );
  return problems.length ? 3 : 0;
}
