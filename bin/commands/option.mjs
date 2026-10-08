/**
 * `mental option` — user-global feature flags in ~/.mental/config.json.
 * track is per-UUID; hooks/mcp are user-global (--this is usage).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { readFileSync } from "node:fs";
import { FEATURES, JEV_ENV_KEYS, listOptionals, loadConfig, maskKey, resolveJev, setFeature, setJevConfig } from "../lib/config.mjs";
import { JEV_SIGNUP_URL, usageToday } from "../lib/jev.mjs";
import { enableHooks, disableHooks } from "../lib/hooks.mjs";
import { enableMcp, disableMcp } from "../lib/mcp-hosts.mjs";
import { copyTrackSkills } from "../lib/install-skills.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";
import { runningCount } from "../lib/time.mjs";
import { isBundleRoot } from "../lib/heartbeat.mjs";

function formatOptionalsTable(rows) {
  const lines = ["optionals (consent required — do not enable unless the user named the feature this turn):"];
  for (const r of rows) {
    const neu = r.isNew ? "  [new]" : "";
    lines.push(`  ${r.id.padEnd(6)} ${r.enabled ? "on " : "off"}  ${r.scope.padEnd(6)}  ${r.command}${neu}`);
    if (r.summary) lines.push(`         ${r.summary}`);
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

const JEV_USAGE = "mental option jev [key <KEY>|key -|key clear|on|off|budget <tokens/day>|budget off]";

function readStdinSync() {
  try {
    return readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * Jev is an optional API key, not a feature flag. Never echo the key.
 * `key -` reads it from stdin so it stays out of shell history.
 */
function cmdOptionJev(args, io, home) {
  const stdout = io.stdout ?? process.stdout;
  const env = args.env ?? process.env;
  const sub = (args.rest[1] || "").toLowerCase();

  const status = () => {
    const r = resolveJev(home, env);
    const stored = r.source === "config" ? loadConfig(home).jev.key : r.source === "env" ? envKey(env) : null;
    const today = usageToday(home, env);
    return {
      feature: "jev",
      configured: r.configured,
      enabled: r.enabled,
      source: r.source,
      key: maskKey(stored),
      dailyTokens: loadConfig(home).jev?.dailyTokens ?? null,
      today: { requests: today.requests, inputTokens: today.input, outputTokens: today.output },
    };
  };

  if (!sub) {
    printResult(stdout, args, true, status(), undefined, (d) =>
      d.configured
        ? `jev ${d.enabled ? "on" : "off"} (key ${d.key}, from ${d.source}); today ${d.today.requests} requests, ${d.today.inputTokens} input tokens${d.dailyTokens ? ` of ${d.dailyTokens} budget` : ""}`
        : `jev not configured. Optional: get a key at ${JEV_SIGNUP_URL}, then mental option jev key <KEY> (or set MENTAL_JEV_KEY).`,
    );
    return 0;
  }

  if (sub === "budget") {
    const raw = (args.rest[2] || "").toLowerCase();
    const n = Number(raw);
    if (raw !== "off" && !(Number.isFinite(n) && n > 0)) {
      printResult(stdout, args, false, undefined, { code: "usage", message: JEV_USAGE });
      return EXIT_USAGE;
    }
    const r = setJevConfig(home, { dailyTokens: raw === "off" ? null : n });
    if (!r.ok) {
      printResult(stdout, args, false, undefined, r.error);
      return 1;
    }
    printResult(stdout, args, true, status(), undefined, (d) =>
      d.dailyTokens ? `option jev budget ${d.dailyTokens} input tokens/day` : "option jev budget off",
    );
    return 0;
  }

  if (sub === "on" || sub === "off") {
    const r = setJevConfig(home, { enabled: sub === "on" });
    if (!r.ok) {
      printResult(stdout, args, false, undefined, r.error);
      return 1;
    }
    printResult(stdout, args, true, status(), undefined, (d) => `option jev ${sub}${d.configured ? "" : " (no key set; reminders muted)"}`);
    return 0;
  }

  if (sub === "key") {
    const raw = args.rest[2];
    if (!raw) {
      printResult(stdout, args, false, undefined, { code: "usage", message: JEV_USAGE });
      return EXIT_USAGE;
    }
    if (raw === "clear") {
      const r = setJevConfig(home, { key: null });
      if (!r.ok) {
        printResult(stdout, args, false, undefined, r.error);
        return 1;
      }
      printResult(stdout, args, true, status(), undefined, () => "option jev key cleared");
      return 0;
    }
    const key = raw === "-" ? readStdinSync() : raw.trim();
    if (!key || /\s/.test(key)) {
      printResult(stdout, args, false, undefined, { code: "usage", message: "Jev key is empty or contains whitespace." });
      return EXIT_USAGE;
    }
    const r = setJevConfig(home, { key, enabled: true });
    if (!r.ok) {
      printResult(stdout, args, false, undefined, r.error);
      return 1;
    }
    printResult(stdout, args, true, status(), undefined, (d) => `option jev key saved (${d.key}). Jev is on.`);
    return 0;
  }

  printResult(stdout, args, false, undefined, { code: "usage", message: JEV_USAGE });
  return EXIT_USAGE;
}

function envKey(env) {
  for (const n of JEV_ENV_KEYS) if (env[n] && String(env[n]).trim()) return String(env[n]).trim();
  return null;
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

  if (feature === "jev") return cmdOptionJev(args, io, home);

  if (!FEATURES.includes(feature)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option [${FEATURES.join("|")}|jev] on|off`,
    });
    return EXIT_USAGE;
  }
  if (action !== "on" && action !== "off") {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option ${feature} on|off`,
    });
    return EXIT_USAGE;
  }

  if (feature !== "track" && thisFlag) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option ${feature} is user-global; --this is usage`,
    });
    return EXIT_USAGE;
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
    return EXIT_USAGE;
  }

  if (feature === "track" && action === "off" && where && isBundleRoot(where)) {
    const n = runningCount(where.root);
    if (n > 0) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: `Time tracking has ${n} running interval(s). Stop or discard them before option track off.`,
      });
      return EXIT_USAGE;
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
    extra.push(...(copied.written || []));
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
