/**
 * Compact since-last-pulse counts. Never returns bodies.
 * Scans journal / attention / decisions / notes. Skips status/ (disposable).
 * Park hops are section-level (`Hop: park` or title Parked), not file mtime.
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
 * Local section time from `journal/YYYY-MM-DD.md` + `HH:MM —` heading.
 * @param {string} file
 * @param {string} heading
 */
function sectionTimeMs(file, heading) {
  const day = file.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!day) return 0;
  const y = Number(day[1]);
  const m = Number(day[2]);
  const d = Number(day[3]);
  const tm = heading.match(/^(\d{1,2}):(\d{2})/);
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

function isParkSection(heading, body) {
  if (/^Hop:\s*park\s*$/m.test(body)) return true;
  const title = heading.replace(/^\d{1,2}:\d{2}\s+—\s+/, "").trim();
  return title === "Parked";
}

/**
 * Park hops after `sinceMs` (exclusive). SoT is journal sections.
 * @param {string | null} root
 * @param {number} sinceMs
 */
export function countParkHopsSinceMs(root, sinceMs) {
  if (!root || !Number.isFinite(sinceMs)) return 0;
  const dir = join(root, "journal");
  if (!existsSync(dir)) return 0;
  let files;
  try {
    files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  } catch {
    return 0;
  }
  let n = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    const { body } = parseFrontmatter(text);
    const sections = body.split(/^## /m).filter(Boolean);
    for (const section of sections) {
      const heading = (section.split(/\r?\n/, 1)[0] || "").trim();
      if (!isParkSection(heading, section)) continue;
      if (sectionTimeMs(file, heading) > sinceMs) n += 1;
    }
  }
  return n;
}

export function localDayStartMs(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Park hops since watermark. SoT is journal sections, not the watermark file.
 * @param {string | null} root
 * @param {string | null} sinceIso
 */
export function countParkHops(root, sinceIso) {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  if (!root || Number.isNaN(sinceMs)) return 0;
  return countParkHopsSinceMs(root, sinceMs);
}

/**
 * @param {string | null} root
 * @param {string | null} sinceIso
 * @param {{ titleLimit?: number }} [opts]
 * @returns {{ since: string | null, writes: number, attention: number, decisions: number, parks: number, titles?: string[] }}
 */
export function collectDelta(root, sinceIso, { titleLimit = 0 } = {}) {
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  const out = { since: sinceIso ?? null, writes: 0, attention: 0, decisions: 0, parks: 0 };
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
  out.parks = countParkHops(root, sinceIso);
  if (titleLimit > 0) out.titles = titles;
  return out;
}

/**
 * Heartbeat shape: counts only. No titles, no bodies.
 * @param {string | null} root
 * @param {string | null} sinceIso
 */
export function heartbeatDelta(root, sinceIso) {
  const { since, writes, attention, decisions, parks } = collectDelta(root, sinceIso);
  return { since, writes, attention, decisions, parks };
}
