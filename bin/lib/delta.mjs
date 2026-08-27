/**
 * Compact since-last-pulse counts. Never returns bodies.
 * Scans journal / attention / decisions / notes. Skips status/ (disposable).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./okf.mjs";

const DELTA_DIRS = ["journal", "attention", "decisions", "notes"];

export const PULSE_TITLE_CAP = 4;

/**
 * Frontmatter timestamp, else mtime. Missing/unreadable → 0.
 * @param {string} abs
 * @param {Record<string, string | string[]>} [data]
 */
export function conceptTimeMs(abs, data) {
  const raw = data?.timestamp;
  if (raw) {
    const t = Date.parse(String(raw));
    if (!Number.isNaN(t)) return t;
  }
  try {
    return statSync(abs).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * @param {string | null} root
 * @param {string | null} sinceIso
 * @param {{ titleLimit?: number }} [opts]
 * @returns {{ since: string | null, writes: number, attention: number, decisions: number, titles?: string[] }}
 */
export function collectDelta(root, sinceIso, { titleLimit = 0 } = {}) {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  const out = { since: sinceIso ?? null, writes: 0, attention: 0, decisions: 0 };
  /** @type {string[]} */
  const titles = [];
  if (!root || Number.isNaN(sinceMs)) {
    if (titleLimit > 0) out.titles = [];
    return out;
  }

  for (const dir of DELTA_DIRS) {
    const absDir = join(root, dir);
    if (!existsSync(absDir)) continue;
    let files;
    try {
      files = readdirSync(absDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
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
      if (conceptTimeMs(abs, data) <= sinceMs) continue;
      out.writes += 1;
      if (dir === "attention") out.attention += 1;
      if (dir === "decisions") out.decisions += 1;
      if (titleLimit > 0 && titles.length < titleLimit) {
        titles.push(String(data.title || file.replace(/\.md$/, "")));
      }
    }
  }
  if (titleLimit > 0) out.titles = titles;
  return out;
}

/**
 * Heartbeat shape: counts only. No titles, no bodies.
 * @param {string | null} root
 * @param {string | null} sinceIso
 */
export function heartbeatDelta(root, sinceIso) {
  const { since, writes, attention, decisions } = collectDelta(root, sinceIso);
  return { since, writes, attention, decisions };
}
