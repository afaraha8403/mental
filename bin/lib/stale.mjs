/**
 * Stale residue for doctor: open/later attention and open/deferred decisions
 * older than N days. Warn-only — never a hard doctor failure.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter } from "./okf.mjs";
import { conceptTimeMs } from "./delta.mjs";

export const STALE_DAYS_DEFAULT = 14;

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function parseDays(raw, fallback = STALE_DAYS_DEFAULT) {
  if (raw == null || raw === true || raw === false) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * @param {string} root
 * @param {string} dir
 * @param {(status: string) => boolean} keep
 * @param {number} cutoffMs
 */
function scanDir(root, dir, keep, cutoffMs) {
  const absDir = join(root, dir);
  if (!existsSync(absDir)) return [];
  /** @type {Array<{ path: string, title: string, status: string, ageMs: number }>} */
  const out = [];
  let files;
  try {
    files = readdirSync(absDir).filter((f) => f.endsWith(".md"));
  } catch {
    return out;
  }
  for (const file of files) {
    const abs = join(absDir, file);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const { data } = parseFrontmatter(text);
    const status = String(data.status || (dir === "attention" ? "open" : ""));
    if (!keep(status)) continue;
    const ageMs = conceptTimeMs(abs, data);
    if (!ageMs || ageMs > cutoffMs) continue;
    out.push({
      path: `${dir}/${file}`,
      title: String(data.title || basename(file, ".md")),
      status,
      ageMs,
    });
  }
  return out;
}

/**
 * @param {string} root
 * @param {{ days?: number, now?: Date }} [opts]
 */
export function scanStale(root, { days = STALE_DAYS_DEFAULT, now = new Date() } = {}) {
  const cutoffMs = now.getTime() - days * 86400000;
  return {
    days,
    attention: scanDir(root, "attention", (s) => s === "open" || s === "later", cutoffMs),
    decisions: scanDir(root, "decisions", (s) => s === "open" || s === "deferred", cutoffMs),
  };
}
