/**
 * User-global Mental config (`~/.mental/config.json`).
 * Feature flags: track is per-UUID; hooks/mcp are user-global.
 * Corrupt file → that feature off (fail open for coding).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { userMentalDir } from "./bindings.mjs";

export const CONFIG_VERSION = 1;

export const FEATURES = ["hooks", "mcp", "track"];

const EMPTY_FEATURE = () => ({ default: "off", on: [], off: [] });

/**
 * @param {string} home
 */
export function configPath(home) {
  return join(userMentalDir(home), "config.json");
}

function blankConfig() {
  return {
    version: CONFIG_VERSION,
    features: {
      hooks: EMPTY_FEATURE(),
      mcp: EMPTY_FEATURE(),
      track: EMPTY_FEATURE(),
    },
    seenOptionals: [],
    jev: { key: null, enabled: true, dailyTokens: null },
    corrupt: false,
  };
}

/**
 * @param {string} home
 */
export function loadConfig(home) {
  const file = configPath(home);
  if (!existsSync(file)) return blankConfig();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    const blank = blankConfig();
    blank.corrupt = true;
    return blank;
  }
  if (!parsed || typeof parsed !== "object") {
    const blank = blankConfig();
    blank.corrupt = true;
    return blank;
  }
  const out = blankConfig();
  out.seenOptionals = Array.isArray(parsed.seenOptionals)
    ? parsed.seenOptionals.map(String)
    : [];
  if (parsed.jev && typeof parsed.jev === "object") {
    const key = typeof parsed.jev.key === "string" && parsed.jev.key.trim() ? parsed.jev.key.trim() : null;
    const dt = Number(parsed.jev.dailyTokens);
    out.jev = { key, enabled: parsed.jev.enabled !== false, dailyTokens: Number.isFinite(dt) && dt > 0 ? Math.floor(dt) : null };
  }
  const feats = parsed.features && typeof parsed.features === "object" ? parsed.features : {};
  for (const id of FEATURES) {
    const raw = feats[id];
    if (!raw || typeof raw !== "object") continue;
    const def = raw.default === "on" ? "on" : "off";
    const on = Array.isArray(raw.on) ? raw.on.map(String) : [];
    const off = Array.isArray(raw.off) ? raw.off.map(String) : [];
    out.features[id] = { default: def, on, off };
  }
  return out;
}

/**
 * @param {string} home
 * @param {ReturnType<typeof blankConfig>} data
 */
export function saveConfig(home, data) {
  const file = configPath(home);
  mkdirSync(dirname(file), { recursive: true });
  const out = {
    version: CONFIG_VERSION,
    features: data.features,
    seenOptionals: data.seenOptionals || [],
    jev: data.jev || { key: null, enabled: true, dailyTokens: null },
  };
  // The file may hold an API key; keep it owner-only (no-op on Windows).
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Jev (TypeSafe System One) is an optional accelerator, not a feature flag.
 * Key lives in config; env is the fallback (see jev.mjs). Never print the key.
 * @param {string} home
 * @param {{ key?: string | null, enabled?: boolean }} patch
 */
export function setJevConfig(home, patch) {
  const cfg = loadConfig(home);
  if (cfg.corrupt) {
    return { ok: false, error: { code: "config", message: "config.json is corrupt; fix or remove it before changing Jev settings." } };
  }
  if (patch.key !== undefined) cfg.jev.key = patch.key && String(patch.key).trim() ? String(patch.key).trim() : null;
  if (patch.enabled !== undefined) cfg.jev.enabled = Boolean(patch.enabled);
  if (patch.dailyTokens !== undefined) {
    const n = Number(patch.dailyTokens);
    cfg.jev.dailyTokens = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  if (!cfg.seenOptionals.includes("jev")) cfg.seenOptionals.push("jev");
  saveConfig(home, cfg);
  return { ok: true, jev: cfg.jev };
}

/**
 * Effective on/off. default → on[] → off[] (except wins).
 * @param {{ default: string, on: string[], off: string[] }} feat
 * @param {string | null} uuid
 */
export function featureOn(feat, uuid) {
  if (!feat) return false;
  let on = feat.default === "on";
  if (uuid && feat.on.includes(uuid)) on = true;
  if (uuid && feat.off.includes(uuid)) on = false;
  if (!uuid) on = feat.default === "on";
  return on;
}

/**
 * @param {string} home
 * @param {string} id
 * @param {string | null} uuid
 */
export function isFeatureOn(home, id, uuid) {
  const cfg = loadConfig(home);
  return featureOn(cfg.features[id], uuid);
}

/**
 * @param {string} home
 * @param {string} id
 */
export function markOptionalSeen(home, id) {
  const cfg = loadConfig(home);
  if (cfg.corrupt) return;
  if (!cfg.seenOptionals.includes(id)) {
    cfg.seenOptionals.push(id);
    saveConfig(home, cfg);
  }
}

/**
 * @param {string} home
 * @param {"hooks" | "mcp" | "track"} id
 * @param {"on" | "off"} action
 * @param {{ all?: boolean, uuid?: string | null }} opts
 */
export function setFeature(home, id, action, { all = false, uuid = null } = {}) {
  const cfg = loadConfig(home);
  if (cfg.corrupt) {
    return { ok: false, error: { code: "config", message: "config.json is corrupt; doctor will warn. Tracking stays off." } };
  }
  const feat = cfg.features[id] || EMPTY_FEATURE();
  if (id === "track") {
    if (all) {
      feat.default = action;
      if (action === "on") feat.off = [];
      else feat.on = [];
    } else {
      if (!uuid) {
        return {
          ok: false,
          error: {
            code: "usage",
            message: "mental option track on|off needs a project UUID (run from a git repo after a write). --this before identity exists is usage.",
          },
        };
      }
      if (action === "on") {
        feat.on = [...new Set([...feat.on.filter((x) => x !== uuid), uuid])];
        feat.off = feat.off.filter((x) => x !== uuid);
      } else {
        feat.off = [...new Set([...feat.off.filter((x) => x !== uuid), uuid])];
        feat.on = feat.on.filter((x) => x !== uuid);
      }
    }
  } else {
    if (!all && uuid) {
      return {
        ok: false,
        error: {
          code: "usage",
          message: `mental option ${id} is user-global; --this is usage`,
        },
      };
    }
    feat.default = action;
    feat.on = [];
    feat.off = [];
  }
  cfg.features[id] = feat;
  if (!cfg.seenOptionals.includes(id)) cfg.seenOptionals.push(id);
  saveConfig(home, cfg);
  return { ok: true, feature: feat, enabled: featureOn(feat, uuid) };
}

/** Env fallbacks, in priority order. Config wins; env is for CI and ephemeral setups. */
export const JEV_ENV_KEYS = ["MENTAL_JEV_KEY", "TYPESAFE_API_KEY"];

/**
 * Resolve the Jev key. Config first, then env. Disabled → no key.
 * @param {string | null} home
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ key: string | null, source: "config" | "env" | null, enabled: boolean, configured: boolean }}
 */
export function resolveJev(home, env = process.env) {
  const cfg = home ? loadConfig(home) : blankConfig();
  const enabled = cfg.jev.enabled !== false;
  let key = cfg.jev.key;
  let source = key ? "config" : null;
  if (!key) {
    for (const name of JEV_ENV_KEYS) {
      const v = env?.[name];
      if (typeof v === "string" && v.trim()) {
        key = v.trim();
        source = "env";
        break;
      }
    }
  }
  return { key: enabled ? key : null, source: key ? source : null, enabled, configured: Boolean(key) };
}

/** Last four characters only; never the whole key. */
export function maskKey(key) {
  if (!key) return null;
  return key.length <= 8 ? "****" : `****${key.slice(-4)}`;
}

/**
 * Catalog for install/doctor. needsConsent always true.
 * @param {string} home
 * @param {string | null} uuid
 */
export function listOptionals(home, uuid, env = process.env) {
  const cfg = loadConfig(home);
  const jev = resolveJev(home, env);
  const rows = [
    {
      id: "hooks",
      enabled: featureOn(cfg.features.hooks, null),
      scope: "user",
      command: "mental option hooks on",
      summary: "session-start loads mental status --json; does not clock",
      isNew: !cfg.seenOptionals.includes("hooks"),
      needsConsent: true,
    },
    {
      id: "mcp",
      enabled: featureOn(cfg.features.mcp, null),
      scope: "user",
      command: "mental option mcp on",
      summary: "PATH mental serve for clients that cannot shell the CLI",
      isNew: !cfg.seenOptionals.includes("mcp"),
      needsConsent: true,
    },
    {
      id: "track",
      enabled: featureOn(cfg.features.track, uuid),
      scope: "bundle",
      command: "mental option track on",
      summary: "ledger accepts rows; recording starts with mental track start",
      isNew: !cfg.seenOptionals.includes("track"),
      needsConsent: true,
    },
    {
      id: "jev",
      enabled: Boolean(jev.key),
      scope: "user",
      command: "mental option jev key <KEY>",
      summary: "TypeSafe Jev API key: fuzzy search recovery, similar-to hints, link suggestions",
      isNew: !cfg.seenOptionals.includes("jev"),
      needsConsent: true,
    },
  ];
  return { optionals: rows, corrupt: cfg.corrupt };
}

export const TRACK_OFF_USAGE = "Time tracking is off for this project.";
