/**
 * `mental option` — user-global feature flags in ~/.mental/config.json.
 * track is per-UUID; hooks/mcp are user-global (--this is usage).
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { readFileSync } from "node:fs";
import { DECIDE_PROVIDERS, FEATURES, listOptionals, loadConfig, maskKey, resolveDecide, setDecideConfig, setFeature } from "../lib/config.mjs";
import { usageToday } from "../lib/jev.mjs";
import { PROVIDER_INFO } from "../lib/decide-providers.mjs";
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

const DECIDE_USAGE =
  "mental option decide [key <KEY>|key -|key clear|provider <P>|url <U>|model <M>|account <ID>|on|off|budget <tokens/day>|budget off|personal on|off|fallback <P>|off] [--provider P]";

function readStdinSync() {
  try {
    return readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * The decision model is an optional API key, not a feature flag. Never echo a key.
 * `key -` reads it from stdin so it stays out of shell history.
 */
function cmdOptionDecide(args, io, home) {
  const stdout = io.stdout ?? process.stdout;
  const env = args.env ?? process.env;
  const sub = (args.rest[1] || "").toLowerCase();
  const usage = (message = DECIDE_USAGE) => {
    printResult(stdout, args, false, undefined, { code: "usage", message });
    return EXIT_USAGE;
  };
  const fail = (r) => {
    printResult(stdout, args, false, undefined, r.error);
    return 1;
  };

  const status = () => {
    const r = resolveDecide(home);
    const cfg = loadConfig(home);
    const today = usageToday(home, env);
    const providers = DECIDE_PROVIDERS.map((id) => {
      const p = cfg.decide.providers[id] || {};
      return {
        provider: id,
        label: PROVIDER_INFO[id].label,
        configured: Boolean(p.key),
        key: maskKey(p.key || null),
        url: p.url || PROVIDER_INFO[id].url || null,
        model: p.model || PROVIDER_INFO[id].model,
        accountId: p.accountId || null,
        active: id === r.provider,
      };
    });
    return {
      feature: "decide",
      configured: r.configured,
      enabled: r.enabled,
      provider: r.provider,
      source: r.source,
      key: providers.find((p) => p.active)?.key ?? null,
      providers,
      fallback: r.fallback,
      personal: r.personal,
      dailyTokens: cfg.decide.dailyTokens ?? null,
      today: { requests: today.requests, inputTokens: today.input, outputTokens: today.output },
    };
  };

  const target = () => {
    const p = String(args.flags?.provider || "").toLowerCase();
    return p || resolveDecide(home).provider;
  };
  const validTarget = (p) => (DECIDE_PROVIDERS.includes(p) ? null : `unknown provider "${p}"; use ${DECIDE_PROVIDERS.join(", ")}`);

  if (!sub) {
    printResult(stdout, args, true, status(), undefined, (d) => {
      if (!d.configured) {
        const others = d.providers.filter((p) => p.configured).map((p) => p.provider);
        return others.length
          ? `decide: active provider ${d.provider} has no key (configured: ${others.join(", ")}). Switch with: mental option decide provider <name>`
          : `decide not configured (optional). Keys: typesafe.ai, platform.openai.com, dash.cloudflare.com (free tier). Then: mental option decide key <KEY> --provider typesafe|openai|cloudflare`;
      }
      const lines = [
        `decide ${d.enabled ? "on" : "off"}: ${d.provider} (key ${d.key}); today ${d.today.requests} requests, ${d.today.inputTokens} input tokens${d.dailyTokens ? ` of ${d.dailyTokens} budget` : ""}`,
        `  personal notes: ${d.personal ? "allowed (secrets are redacted)" : "never sent"}${d.fallback ? `; fallback: ${d.fallback}` : ""}`,
      ];
      for (const p of d.providers.filter((x) => x.configured)) {
        lines.push(`  ${p.active ? "*" : " "} ${p.provider.padEnd(10)} key ${p.key}  model ${p.model}${p.accountId ? `  account ${p.accountId}` : ""}`);
      }
      return lines.join("\n");
    });
    return 0;
  }

  if (sub === "budget") {
    const raw = (args.rest[2] || "").toLowerCase();
    const n = Number(raw);
    if (raw !== "off" && !(Number.isFinite(n) && n > 0)) return usage();
    const r = setDecideConfig(home, { dailyTokens: raw === "off" ? null : n });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) =>
      d.dailyTokens ? `option decide budget ${d.dailyTokens} input tokens/day` : "option decide budget off",
    );
    return 0;
  }

  if (sub === "on" || sub === "off") {
    const r = setDecideConfig(home, { enabled: sub === "on" });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) => `option decide ${sub}${d.configured ? "" : " (no key set; reminders muted)"}`);
    return 0;
  }

  if (sub === "personal") {
    const v = (args.rest[2] || "").toLowerCase();
    if (v !== "on" && v !== "off") return usage("mental option decide personal on|off");
    const r = setDecideConfig(home, { personal: v === "on" });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) =>
      d.personal ? "option decide personal on (personal notes may be sent; secrets are redacted)" : "option decide personal off (personal notes are never sent)",
    );
    return 0;
  }

  if (sub === "provider") {
    const p = (args.rest[2] || "").toLowerCase();
    if (!p) return usage("mental option decide provider <typesafe|openai|cloudflare|custom>");
    const bad = validTarget(p);
    if (bad) return usage(bad);
    const r = setDecideConfig(home, { provider: p });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) =>
      `option decide provider ${p}${d.providers.find((x) => x.provider === p)?.configured ? "" : " (no key yet: mental option decide key <KEY> --provider " + p + ")"}`,
    );
    return 0;
  }

  if (sub === "fallback") {
    const p = (args.rest[2] || "").toLowerCase();
    if (!p) return usage("mental option decide fallback <provider|off>");
    if (p !== "off") {
      const bad = validTarget(p);
      if (bad) return usage(bad);
    }
    const r = setDecideConfig(home, { fallback: p === "off" ? null : p });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) => (d.fallback ? `option decide fallback ${d.fallback}` : "option decide fallback off"));
    return 0;
  }

  if (sub === "url" || sub === "model" || sub === "account") {
    const p = target();
    const bad = validTarget(p);
    if (bad) return usage(bad);
    const raw = args.rest[2];
    if (!raw) return usage(`mental option decide ${sub} <value|clear> [--provider P]`);
    if (sub === "url" && raw !== "clear" && !/^https?:\/\//i.test(raw)) return usage("url must start with http:// or https://");
    const value = raw === "clear" ? null : raw.trim();
    const field = sub === "account" ? "accountId" : sub;
    const r = setDecideConfig(home, { set: { provider: p, field, value } });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, () => `option decide ${p} ${sub} ${value ? "saved" : "cleared"}`);
    return 0;
  }

  if (sub === "key") {
    let raw = args.rest[2];
    let p = target();
    if (raw && DECIDE_PROVIDERS.includes(raw.toLowerCase()) && args.rest[3]) {
      p = raw.toLowerCase();
      raw = args.rest[3];
    }
    const bad = validTarget(p);
    if (bad) return usage(bad);
    if (!raw) return usage();
    if (raw === "clear") {
      const r = setDecideConfig(home, { set: { provider: p, field: "key", value: null } });
      if (!r.ok) return fail(r);
      printResult(stdout, args, true, status(), undefined, () => `option decide ${p} key cleared`);
      return 0;
    }
    const key = raw === "-" ? readStdinSync() : raw.trim();
    if (!key || /\s/.test(key)) return usage("decide key is empty or contains whitespace.");
    const r = setDecideConfig(home, { set: { provider: p, field: "key", value: key }, enabled: true });
    if (!r.ok) return fail(r);
    printResult(stdout, args, true, status(), undefined, (d) => {
      const need = p === "cloudflare" && !d.providers.find((x) => x.provider === p)?.accountId ? " Next: mental option decide account <ACCOUNT_ID> --provider cloudflare" : "";
      return `option decide ${p} key saved (${maskKey(key)}). Active provider: ${d.provider}.${need}`;
    });
    return 0;
  }

  return usage();
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

  if (feature === "decide" || feature === "jev") return cmdOptionDecide(args, io, home);

  if (!FEATURES.includes(feature)) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: `mental option [${FEATURES.join("|")}|decide] on|off`,
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
