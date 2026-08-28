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
  };
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
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

/**
 * Catalog for install/doctor. needsConsent always true.
 * @param {string} home
 * @param {string | null} uuid
 */
export function listOptionals(home, uuid) {
  const cfg = loadConfig(home);
  const rows = [
    {
      id: "hooks",
      enabled: featureOn(cfg.features.hooks, null),
      scope: "user",
      command: "mental option hooks on",
      isNew: !cfg.seenOptionals.includes("hooks"),
      needsConsent: true,
    },
    {
      id: "mcp",
      enabled: featureOn(cfg.features.mcp, null),
      scope: "user",
      command: "mental option mcp on",
      isNew: !cfg.seenOptionals.includes("mcp"),
      needsConsent: true,
    },
    {
      id: "track",
      enabled: featureOn(cfg.features.track, uuid),
      scope: "bundle",
      command: "mental option track on",
      isNew: !cfg.seenOptionals.includes("track"),
      needsConsent: true,
    },
  ];
  return { optionals: rows, corrupt: cfg.corrupt };
}

export const TRACK_OFF_USAGE = "Time tracking is off for this project.";
