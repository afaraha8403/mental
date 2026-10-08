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
    decide: blankDecide(),
    corrupt: false,
  };
}

/** Decision-model providers Mental can talk to. Order is display order. */
export const DECIDE_PROVIDERS = ["typesafe", "openai", "cloudflare", "custom"];
/** Per-provider settings the user may store. */
export const DECIDE_FIELDS = ["key", "url", "model", "accountId"];

function blankDecide() {
  return { provider: "typesafe", enabled: true, dailyTokens: null, personal: true, fallback: null, providers: {} };
}

const cleanStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Parse the `decide` block, migrating the legacy `jev` block (single TypeSafe key). */
function parseDecide(parsed) {
  const out = blankDecide();
  const src = parsed.decide && typeof parsed.decide === "object" ? parsed.decide : null;
  const legacy = parsed.jev && typeof parsed.jev === "object" ? parsed.jev : null;
  const base = src || legacy;
  if (!base) return out;
  const dt = Number(base.dailyTokens);
  out.enabled = base.enabled !== false;
  out.dailyTokens = Number.isFinite(dt) && dt > 0 ? Math.floor(dt) : null;
  if (src) {
    if (DECIDE_PROVIDERS.includes(src.provider)) out.provider = src.provider;
    out.personal = src.personal !== false;
    if (DECIDE_PROVIDERS.includes(src.fallback) && src.fallback !== out.provider) out.fallback = src.fallback;
    const provs = src.providers && typeof src.providers === "object" ? src.providers : {};
    for (const id of DECIDE_PROVIDERS) {
      const p = provs[id];
      if (!p || typeof p !== "object") continue;
      const entry = {};
      for (const f of DECIDE_FIELDS) {
        const v = cleanStr(p[f]);
        if (v) entry[f] = v;
      }
      if (Object.keys(entry).length) out.providers[id] = entry;
    }
  } else {
    const key = cleanStr(legacy.key);
    if (key) out.providers.typesafe = { key };
  }
  return out;
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
  out.decide = parseDecide(parsed);
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
    decide: data.decide || blankDecide(),
  };
  // The file may hold an API key; keep it owner-only (no-op on Windows).
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
}

/**
 * The decision model is an optional accelerator, not a feature flag. Keys live in config only.
 * Never print a key.
 * @param {string} home
 * @param {{ provider?: string, enabled?: boolean, dailyTokens?: number | null, personal?: boolean,
 *   fallback?: string | null, set?: { provider: string, field: string, value: string | null } }} patch
 */
export function setDecideConfig(home, patch) {
  const cfg = loadConfig(home);
  if (cfg.corrupt) {
    return { ok: false, error: { code: "config", message: "config.json is corrupt; fix or remove it before changing decide settings." } };
  }
  const d = cfg.decide;
  if (patch.provider !== undefined) {
    if (!DECIDE_PROVIDERS.includes(patch.provider)) {
      return { ok: false, error: { code: "usage", message: `unknown provider "${patch.provider}"; use ${DECIDE_PROVIDERS.join(", ")}` } };
    }
    d.provider = patch.provider;
    if (d.fallback === d.provider) d.fallback = null;
  }
  if (patch.fallback !== undefined) {
    if (patch.fallback !== null && !DECIDE_PROVIDERS.includes(patch.fallback)) {
      return { ok: false, error: { code: "usage", message: `unknown provider "${patch.fallback}"; use ${DECIDE_PROVIDERS.join(", ")}` } };
    }
    d.fallback = patch.fallback === d.provider ? null : patch.fallback;
  }
  if (patch.enabled !== undefined) d.enabled = Boolean(patch.enabled);
  if (patch.personal !== undefined) d.personal = Boolean(patch.personal);
  if (patch.dailyTokens !== undefined) {
    const n = Number(patch.dailyTokens);
    d.dailyTokens = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  if (patch.set) {
    const { provider, field, value } = patch.set;
    if (!DECIDE_PROVIDERS.includes(provider) || !DECIDE_FIELDS.includes(field)) {
      return { ok: false, error: { code: "usage", message: `cannot set ${provider}.${field}` } };
    }
    const entry = { ...(d.providers[provider] || {}) };
    const v = cleanStr(value);
    if (v) entry[field] = v;
    else delete entry[field];
    if (Object.keys(entry).length) d.providers[provider] = entry;
    else delete d.providers[provider];
    // First key stored becomes the active provider if the current one has none.
    if (field === "key" && v && !d.providers[d.provider]?.key) d.provider = provider;
  }
  if (!cfg.seenOptionals.includes("decide")) cfg.seenOptionals.push("decide");
  saveConfig(home, cfg);
  return { ok: true, decide: cfg.decide };
}

/** Back-compat: `setJevConfig(home, {key})` sets the TypeSafe key. */
export function setJevConfig(home, patch) {
  const next = {};
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.dailyTokens !== undefined) next.dailyTokens = patch.dailyTokens;
  if (patch.key !== undefined) next.set = { provider: "typesafe", field: "key", value: patch.key };
  return setDecideConfig(home, next);
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
 * Resolve the active decision-model provider from config. Keys are read from
 * config only (never env). Disabled → no key.
 * @param {string | null} home
 * @param {string} [providerOverride] use this provider instead of the active one
 * @returns {{ provider: string, key: string | null, url: string | null, model: string | null, accountId: string | null,
 *   enabled: boolean, configured: boolean, personal: boolean, fallback: string | null, source: "config" | null,
 *   configuredProviders: string[] }}
 */
export function resolveDecide(home, providerOverride) {
  const cfg = home ? loadConfig(home) : blankConfig();
  const d = cfg.decide;
  const provider = providerOverride && DECIDE_PROVIDERS.includes(providerOverride) ? providerOverride : d.provider;
  const p = d.providers[provider] || {};
  const enabled = d.enabled !== false;
  const configured = Boolean(p.key);
  return {
    provider,
    key: enabled ? p.key || null : null,
    url: p.url || null,
    model: p.model || null,
    accountId: p.accountId || null,
    enabled,
    configured,
    personal: d.personal !== false,
    fallback: d.fallback,
    source: configured ? "config" : null,
    configuredProviders: DECIDE_PROVIDERS.filter((id) => d.providers[id]?.key),
  };
}

/** Back-compat alias for the pre-`decide` name. */
export const resolveJev = (home) => resolveDecide(home);

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
export function listOptionals(home, uuid) {
  const cfg = loadConfig(home);
  const decide = resolveDecide(home);
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
      id: "decide",
      enabled: Boolean(decide.key),
      scope: "user",
      command: "mental option decide key <KEY>",
      summary: "decision model (TypeSafe Jev, OpenAI Decisions, Cloudflare Clef): fuzzy search, similar-to hints, retag, link suggestions, doctor checks",
      isNew: !cfg.seenOptionals.includes("decide") && !cfg.seenOptionals.includes("jev"),
      needsConsent: true,
    },
  ];
  return { optionals: rows, corrupt: cfg.corrupt };
}

export const TRACK_OFF_USAGE = "Time tracking is off for this project.";
