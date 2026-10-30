/**
 * Local, key-free secret redaction. Nothing here calls the network.
 * Model-bound text and files on disk share these shapes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Shapes a model never needs to see, and that must not land in OKF. */
const PATTERNS = [
  {
    kind: "private-key",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  { kind: "github", re: /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g },
  { kind: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "openai", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "bearer", re: /\bBearer\s+[A-Za-z0-9\-._~+/]{16,}=*/gi },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: "url-auth", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/gi },
];

/** Credential shapes. A hit is local; it does not echo the secret. */
export const STRONG_SECRET =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|\b(sk-[A-Za-z0-9]|gh[pousr]_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{8})/;

/** Loose pre-filter only. A hit means "worth asking", never "is a secret". */
export const SECRETISH =
  /(api[_ -]?key|secret|token|passw(or)?d|bearer|credential|private key|BEGIN [A-Z ]*KEY|\bsk-[A-Za-z0-9]|\bgh[pousr]_|AKIA[0-9A-Z]{8})/i;

/**
 * Long opaque tokens. Slugs, paths, hex SHAs and UUIDs are not tokens:
 * a secret run mixes digits with letters and mixed case or a symbol, and is
 * not a hyphenated slug.
 * @param {string} token
 */
export function looksLikeOpaqueSecret(token) {
  if (token.length < 24) return false;
  if (/[\\/]/.test(token)) return false;
  const hyphens = token.split("-").length - 1;
  if (hyphens >= 2) return false;
  // Hex is a SHA. A long digit+letter run that is not hex is a token.
  if (/^[0-9a-f]+$/i.test(token)) return false;
  const hasDigit = /\d/.test(token);
  const hasLetter = /[A-Za-z]/.test(token);
  return hasDigit && hasLetter;
}

/**
 * @param {string} input
 * @param {{ envValues?: string[] }} [opts]
 * @returns {{ text: string, kinds: string[] }}
 */
export function redactText(input, { envValues = [] } = {}) {
  let text = String(input ?? "");
  /** @type {string[]} */
  const kinds = [];
  const mark = (kind) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  for (const p of PATTERNS) {
    text = text.replace(p.re, () => {
      mark(p.kind);
      return `[REDACTED:${p.kind}]`;
    });
  }
  text = text.replace(/[A-Za-z0-9+/_=-]{24,}/g, (token) => {
    if (!looksLikeOpaqueSecret(token)) return token;
    mark("token");
    return "[REDACTED:token]";
  });
  for (const value of envValues) {
    if (typeof value !== "string" || value.length < 8) continue;
    if (!text.includes(value)) continue;
    text = text.split(value).join("[REDACTED:env]");
    mark("env");
  }
  return { text, kinds };
}

/**
 * Text sent to a decision model. Known shapes and high-entropy runs become
 * `[REDACTED]`. Long slugs and paths stay.
 * @param {string} s
 */
export function redactForModel(s) {
  const one = String(s || "").replace(/\s+/g, " ").trim();
  return redactText(one).text.replace(/\[REDACTED:[a-z0-9-]+\]/g, "[REDACTED]");
}

const ENV_NAME = /^\.env(\.|$)/;
const ENV_SKIP = /^\.env\.(example|sample|template|dist)$/i;

/**
 * Values from the repo's `.env*` files. The files themselves are never copied.
 * Short values are ignored so "true" or "dev" cannot blank ordinary prose.
 * @param {string | null | undefined} gitRoot
 * @returns {string[]}
 */
export function loadEnvSecretValues(gitRoot) {
  if (!gitRoot) return [];
  let names = [];
  try {
    names = readdirSync(gitRoot);
  } catch {
    return [];
  }
  /** @type {string[]} */
  const values = [];
  for (const name of names) {
    if (!ENV_NAME.test(name) || ENV_SKIP.test(name)) continue;
    const abs = join(gitRoot, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let text = "";
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v.length >= 8) values.push(v);
    }
  }
  return values;
}

/**
 * @param {string | null | undefined} root
 * @returns {Array<{ path: string, kinds: string[] }>}
 */
export function scanBundleSecrets(root) {
  /** @type {Array<{ path: string, kinds: string[] }>} */
  const hits = [];
  if (!root || !existsSync(root)) return hits;
  const walk = (dir, rel) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const next = rel ? `${rel}/${e.name}` : e.name;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "status") continue;
        walk(abs, next);
      } else if (e.name.endsWith(".md")) {
        let text = "";
        try {
          text = readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        const { kinds } = redactText(text);
        if (kinds.length) hits.push({ path: next, kinds });
      }
    }
  };
  walk(root, "");
  return hits;
}

/**
 * @param {string} text
 * @returns {{ text: string, kinds: string[] }}
 */
export function redactFileText(text) {
  return redactText(text);
}
