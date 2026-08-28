/**
 * `mental option` — user-global feature flags in ~/.mental/config.json.
 * track is per-UUID; hooks/mcp are user-global (--this is usage).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { FEATURES, listOptionals, setFeature } from "../lib/config.mjs";
import { enableHooks, disableHooks } from "../lib/hooks.mjs";
import { enableMcp, disableMcp } from "../lib/mcp-hosts.mjs";
import { copyTrackSkills } from "../lib/install-skills.mjs";
import { printResult } from "../lib/output.mjs";
import { runningCount } from "../lib/time.mjs";
import { isBundleRoot } from "../lib/heartbeat.mjs";

function formatOptionalsTable(rows) {
  const lines = ["optionals (consent required — do not enable unless the user named the feature this turn):"];
  for (const r of rows) {
    const neu = r.isNew ? "  [new]" : "";
    lines.push(`  ${r.id.padEnd(6)} ${r.enabled ? "on " : "off"}  ${r.scope.padEnd(6)}  ${r.command}${neu}`);
  }
  return lines.join("\n");
}

/**
 * UUID for --this / default track scope. Do not mint identity.
 * @param {object} args
 */
function uuidForThis(args) {
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) return { uuid: null, where: null };
  const where = resolved.data;
  if (!where.id) return { uuid: null, where };
  return { uuid: where.id, where };
}

/**
 * @param {{ json: boolean, rest: string[], flags?: Record<string, string | boolean>, cwd?: string, home?: string, env?: NodeJS.ProcessEnv, dir?: string }} args
 */
export function cmdOption(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args, false, undefined, {
      code: "no-home",
      message: "HOME is unset; Mental will not write config.json.",
    });
    return 1;
  }

  const feature = (args.rest[0] || "").toLowerCase();
  const action = (args.rest[1] || "").toLowerCase();
  const all = Boolean(args.flags?.all);
  const thisFlag = Boolean(args.flags?.this);

  if (!feature) {
    const { uuid } = uuidForThis(args);
    const listed = listOptionals(home, uuid);
    printResult(stdout, args, true, listed, undefined, (d) => formatOptionalsTable(d.optionals));
    return 0;
  }

  if (!FEATURES.includes(feature)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option [${FEATURES.join("|")}] on|off`,
    });
    return 1;
  }
  if (action !== "on" && action !== "off") {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option ${feature} on|off`,
    });
    return 1;
  }

  if (feature !== "track" && thisFlag) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option ${feature} is user-global; --this is usage`,
    });
    return 1;
  }

  const { uuid, where } = uuidForThis(args);
  const scopeAll = all || feature !== "track";
  const scopeThis = feature === "track" && !all;

  if (scopeThis && !uuid) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message:
        "mental option track on|off needs a project UUID (run from a git repo after a write). --this before identity exists is usage.",
    });
    return 1;
  }

  if (feature === "track" && action === "off" && where && isBundleRoot(where)) {
    const n = runningCount(where.root);
    if (n > 0) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: `Time tracking has ${n} running interval(s). Stop or discard them before option track off.`,
      });
      return 1;
    }
  }

  const result = setFeature(home, feature, action, { all: scopeAll, uuid: scopeThis ? uuid : null });
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return 1;
  }

  /** @type {string[]} */
  const extra = [];
  if (feature === "hooks") {
    const hook = action === "on" ? enableHooks(home) : disableHooks(home);
    if (!hook.ok) {
      printResult(stdout, args, false, undefined, hook.error);
      return 1;
    }
    extra.push(...(hook.written || []));
  }
  if (feature === "mcp") {
    const mcp = action === "on" ? enableMcp(home) : disableMcp(home);
    if (!mcp.ok) {
      printResult(stdout, args, false, undefined, mcp.error);
      return 1;
    }
    extra.push(...(mcp.written || []));
  }
  if (feature === "track" && action === "on") {
    const copied = copyTrackSkills(home);
    extra.push(...copied);
  }

  const data = {
    feature,
    action,
    all: scopeAll,
    uuid: scopeThis ? uuid : null,
    enabled: result.enabled,
    written: extra,
  };
  printResult(
    stdout,
    args,
    true,
    data,
    undefined,
    () => `option ${feature} ${action}${scopeAll ? " (all)" : uuid ? ` (${uuid})` : ""}`,
  );
  return 0;
}

export { formatOptionalsTable, uuidForThis };
