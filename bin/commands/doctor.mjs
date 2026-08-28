/**
 * `mental doctor` — PATH, where, bindings, ignore, skill presence.
 * Exit 3 when problems exist (still prints JSON).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveBundle, findLocalMental } from "../lib/resolve.mjs";
import { loadBindings, userMentalDir } from "../lib/bindings.mjs";
import { checkMentalIgnored, ensureMentalExcluded, gitAvailable } from "../lib/ignore.mjs";
import { skillsPresent, userTrackTargets, trackSkillPresent } from "../lib/install-skills.mjs";
import { printResult, brandMark, useAsciiBrand } from "../lib/output.mjs";
import { CMD, NAME, VERSION } from "../lib/pkg.mjs";
import { isOptedInLocal } from "../lib/import-legacy.mjs";
import { findGitRoot } from "../lib/git.mjs";
import { indexPath } from "../lib/index.mjs";
import { leftoverBalakitMentalCount, findBalakitMental } from "../lib/legacy-balakit.mjs";
import { checkForUpdate, cmpSemver, updateHint } from "../lib/update.mjs";
import { hostPluginChecks } from "../lib/host-plugins.mjs";
import { DECISION_HEARTBEAT_CAP, listOpenDecisions } from "../lib/okf.mjs";
import { parseDays, scanStale } from "../lib/stale.mjs";
import { isBundleRoot } from "../lib/heartbeat.mjs";
import { FEATURES, listOptionals, loadConfig, markOptionalSeen } from "../lib/config.mjs";
import { formatOptionalsTable } from "./option.mjs";
import { TIME_DB, listOrphanTimeDbs, runningCount } from "../lib/time.mjs";
import { skillMetadataVersion } from "../lib/lockstep.mjs";

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
    for (const extra of hostPluginChecks({ home, env, version: VERSION })) {
      checks.push(check(extra.id, extra.ok, extra.message, extra.level));
    }

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

    const leftoverWiring = leftoverBalakitMentalCount({ home, projectDir: gitRoot || cwd });
    if (leftoverWiring > 0) {
      const found = findBalakitMental({ home, projectDir: gitRoot || cwd });
      const sample = [
        ...found.skills,
        ...found.rules,
        ...found.plugins,
        ...found.blocks.map((b) => b.file),
      ]
        .slice(0, 4)
        .join(", ");
      checks.push(
        check(
          "legacy-balakit",
          false,
          `Balakit Mental skill/rule still present (${sample}). Run \`${CMD} install\` to remove it.`,
          "warn",
        ),
      );
    }
  }

  if (resolved.ok && isBundleRoot(resolved.data) && resolved.data.root) {
    const days = parseDays(args.flags?.days);
    const stale = scanStale(resolved.data.root, { days });
    if (stale.attention.length) {
      const sample = stale.attention.map((a) => a.title).slice(0, 3).join(", ");
      checks.push(
        check(
          "stale-attention",
          false,
          `${stale.attention.length} open/later attention older than ${days}d (${sample})`,
          "warn",
        ),
      );
    }
    if (stale.decisions.length) {
      const sample = stale.decisions.map((d) => d.title).slice(0, 3).join(", ");
      checks.push(
        check(
          "stale-decision",
          false,
          `${stale.decisions.length} open/deferred decision(s) older than ${days}d (${sample})`,
          "warn",
        ),
      );
    }
    const openN = listOpenDecisions(resolved.data.root).length;
    if (openN > DECISION_HEARTBEAT_CAP) {
      checks.push(
        check(
          "decision-budget",
          false,
          `${openN} open/deferred decisions (heartbeat cap ${DECISION_HEARTBEAT_CAP})`,
          "warn",
        ),
      );
    }
  }

  const upd = checkForUpdate({ env });
  if (!upd.skipped && upd.latest) {
    const behind = cmpSemver(upd.latest, VERSION) > 0;
    checks.push(
      check(
        "update",
        !behind,
        behind ? updateHint(VERSION, upd.latest, NAME) : `CLI ${VERSION} (npm ${upd.latest})`,
        behind ? "warn" : "info",
      ),
    );
  }

  if (home) {
    const cfg = loadConfig(home);
    if (cfg.corrupt) {
      checks.push(check("config", false, "config.json is corrupt; optional features stay off", "warn"));
    }
    const gitRoot = resolved.ok ? resolved.data.gitRoot : findGitRoot(cwd, { env });
    if (gitRoot) {
      const ls = spawnSync("git", ["-C", gitRoot, "ls-files", "-z"], { encoding: "utf8", env });
      if (ls.status === 0) {
        const tracked = (ls.stdout || "").split("\0").filter((f) => /(^|\/)time\.sqlite(-wal|-shm)?$/.test(f));
        if (tracked.length) {
          checks.push(
            check("time-git", false, `time.sqlite is git-tracked (${tracked[0]}). Hours must never be in git.`),
          );
        }
      }
    }
    const leftover = findLocalMental(cwd, {
      home,
      gitRoot: resolved.ok ? resolved.data.gitRoot : findGitRoot(cwd, { env }),
    });
    if (leftover && existsSync(join(leftover, TIME_DB)) && !isOptedInLocal(leftover)) {
      const ign = checkMentalIgnored({ cwd, env });
      if (ign.liveIgnored !== true) {
        checks.push(
          check(
            "time-leftover",
            false,
            `leftover ${leftover}/${TIME_DB} is not gitignored — will not copy hours into a tracked folder`,
          ),
        );
      }
    }
    if (resolved.ok && resolved.data.mode === "local") {
      checks.push(
        check(
          "store-local",
          true,
          "binding store=local — other clones of this origin still write the home slice",
          "warn",
        ),
      );
    }
    if (resolved.ok && (resolved.data.mode === "env" || args.dir)) {
      checks.push(
        check("mental-dir", true, "MENTAL_DIR/--dir hours live here; uninstall --delete-data does not wipe it", "warn"),
      );
    }
    try {
      const bindings = loadBindings(home);
      const live = new Set(bindings.bindings.map((b) => b.id));
      const orphans = listOrphanTimeDbs(join(userMentalDir(home), "projects"), live);
      if (orphans.length) {
        checks.push(
          check("time-orphan", true, `${orphans.length} orphan projects/*/time.sqlite (remap leftover)`, "warn"),
        );
      }
    } catch {
      // bindings already checked
    }
    if (resolved.ok && isBundleRoot(resolved.data)) {
      const n = runningCount(resolved.data.root);
      if (n > 0) {
        checks.push(check("time-running", true, `${n} running interval(s) in time.sqlite`, "info"));
      }
    }
    const trackTargets = userTrackTargets(home);
    const present = trackTargets.skills.filter((d) => existsSync(join(d, "SKILL.md")));
    if (present.length && present.length < trackTargets.skills.length) {
      checks.push(
        check("track-skill-drift", true, "mental-track skill present in some agent dirs but not all", "warn"),
      );
    }
    if (trackSkillPresent(home)) {
      let worst = null;
      for (const dest of trackTargets.skills) {
        const file = join(dest, "SKILL.md");
        if (!existsSync(file)) continue;
        try {
          const v = skillMetadataVersion(readFileSync(file, "utf8"));
          if (v && (worst === null || cmpSemver(v, worst) < 0)) worst = v;
        } catch {
          // fail open per copy
        }
      }
      if (worst && cmpSemver(worst, VERSION) < 0) {
        checks.push(
          check("track-skill-version", true, `mental-track skill ${worst}; CLI ${VERSION}. Run \`${CMD} install\`.`, "warn"),
        );
      }
    }
  }

  const optionals = home ? listOptionals(home, resolved.ok ? resolved.data.id : null) : { optionals: [] };
  if (home) for (const id of FEATURES) markOptionalSeen(home, id);

  const problems = checks.filter((c) => !c.ok && c.level === "error");
  const data = {
    checks,
    where: resolved.ok ? resolved.data : null,
    problems: problems.length,
    optionals: optionals.optionals,
  };
  const ok = problems.length === 0;
  printResult(
    stdout,
    args,
    ok,
    data,
    ok
      ? undefined
      : {
          code: "doctor-failed",
          message: `${problems.length} problem(s)`,
          hint: `Run \`${CMD} doctor --fix-ignore\` for ignore issues, or \`${CMD} install\` for PATH/skill.`,
        },
    (d) => {
      const yes = useAsciiBrand(args.env ?? process.env, args) ? "OK" : "✓";
      const no = useAsciiBrand(args.env ?? process.env, args) ? "X" : "✖";
      return (
        d.checks.map((c) => `${c.ok ? yes : no} ${c.id}: ${c.message}`).join("\n") +
        `\n${formatOptionalsTable(d.optionals)}` +
        (problems.length ? `\n${problems.length} problem(s)` : `\n${brandMark(args.env ?? process.env, args)} doctor clean`)
      );
    },
  );
  return problems.length ? 3 : 0;
}
