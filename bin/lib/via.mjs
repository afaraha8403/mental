/**
 * Named writes: a short client token, not a fingerprint.
 * Never emails, URLs, paths, session ids, or machine names.
 */
export const VIA_MAX = 24;

export const VIA_USAGE =
  "--via must be a short client token (cursor, claude-code, copilot, codex, opencode, mcp, cli). No emails, URLs, paths, or session ids.";

export const VIA_HINT =
  "Pass --via with your host's token: claude-code, cursor, codex, copilot, opencode, mcp, or cli. Not a session id.";

/**
 * The `--via` token each agent host's installed rule and skill tell the agent to pass.
 * The shipped sources say `--via cursor` (the Cursor plugin ships them verbatim);
 * `mental install` rewrites that token per destination.
 */
export const HOST_VIA = Object.freeze({
  claudeCode: "claude-code",
  cursor: "cursor",
  codex: "codex",
  copilot: "copilot",
  opencode: "opencode",
});

/**
 * @param {unknown} raw
 * @returns {string | undefined | null} undefined if omitted, null if invalid, else lowercase token
 */
export function sanitizeVia(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (s === "") return undefined;
  if (s.length > VIA_MAX) return null;
  if (/[@:/\\]/.test(s)) return null;
  if (/\s/.test(s)) return null;
  if (/^[0-9a-f-]{16,}$/i.test(s)) return null;
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(s)) return null;
  return s.toLowerCase();
}

/**
 * @param {Record<string, string | boolean> | undefined} flags
 * @returns {{ ok: true, via: string | undefined } | { ok: false }}
 */
export function viaFromFlags(flags) {
  const raw = typeof flags?.via === "string" ? flags.via : null;
  if (raw == null) return { ok: true, via: undefined };
  const via = sanitizeVia(raw);
  if (via == null) return { ok: false };
  return { ok: true, via };
}
