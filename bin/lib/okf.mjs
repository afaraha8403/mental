/**
 * OKF markdown SoT: tiny frontmatter parse/write + bundle skeleton.
 * No YAML library — templates only need scalars and `[tag, lists]`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, cpSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve as resolvePath, sep } from "node:path";
import { writeAtomic, withFileLock } from "./atomic.mjs";
import { loadEnvSecretValues, redactText } from "./redact.mjs";
import { backupTimeDb, isTimeSidecarName, TIME_DB } from "./time.mjs";

export const CONCEPT_DIRS = ["journal", "decisions", "notes", "attention", "status"];

export const ATTENTION_STATUSES = new Set(["open", "later", "resolved"]);
export const ATTENTION_KINDS = new Set(["direction", "concern", "thread", "verify"]);
export const ATTENTION_HEARTBEAT_CAP = 7;
/** Mirror attention: heartbeat TTY + JSON lists cap here; extras via `list`. */
export const DECISION_HEARTBEAT_CAP = 7;
export const DECISION_STATUSES = new Set(["open", "deferred", "decided", "superseded", "obsolete"]);

const TAG_SLUG = /^[a-z0-9_-]{2,32}$/;

/**
 * Normalize a comma-separated tag string into one to three slugs.
 * A blank result is usage so an empty flag cannot wipe stored tags.
 * @param {string} raw
 * @returns {{ ok: true, tags: string[] } | { ok: false, message: string }}
 */
export function parseTagList(raw) {
  /** @type {string[]} */
  const tags = [];
  const seen = new Set();
  for (const part of String(raw).split(",")) {
    const slug = part.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) continue;
    if (!TAG_SLUG.test(slug)) {
      return { ok: false, message: `tag must be 2–32 characters of [a-z0-9_-]: ${slug}` };
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    tags.push(slug);
    if (tags.length > 3) return { ok: false, message: "at most 3 tags" };
  }
  if (tags.length === 0) return { ok: false, message: "tag needs 1–3 slugs" };
  return { ok: true, tags };
}

/**
 * Optional `--tag` flag. Omitted stays omitted so update does not rewrite tags.
 * Create commands treat that omission as usage via `missingCreateTag`.
 * @param {string | null | undefined} raw
 * @returns {{ ok: true, tags: string[] | undefined } | { ok: false, message: string }}
 */
export function tagsFromFlag(raw) {
  if (raw == null) return { ok: true, tags: undefined };
  const parsed = parseTagList(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, tags: parsed.tags };
}

/**
 * Usage when decide, attention, or note creates a file without `--tag`.
 * @param {"decide" | "attention" | "note"} command
 * @returns {{ code: "usage", message: string, hint: string }}
 */
export function missingCreateTag(command) {
  const message = command === "note"
    ? "mental note requires --tag (1–3 topic slugs)"
    : `mental ${command} create requires --tag (1–3 topic slugs)`;
  return {
    code: "usage",
    message,
    hint: "Reuse a slug from mental list --tag. Omit --tag on update so existing tags stay.",
  };
}

/**
 * @param {string[] | undefined} tags
 * @returns {string[] | undefined}
 */
function tagsToStore(tags) {
  if (tags === undefined) return undefined;
  const parsed = parseTagList(tags.join(","));
  if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: "usage" });
  return parsed.tags;
}

/**
 * @param {Date} [d]
 */
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {Date} [d]
 */
export function localTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Process-local cache so one heartbeat reads each OKF file once. */
let bundleReadCache = null;

/**
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withBundleReadCache(fn) {
  const prev = bundleReadCache;
  bundleReadCache = new Map();
  try {
    return fn();
  } finally {
    bundleReadCache = prev;
  }
}

/**
 * @param {string} abs
 */
export function readUtf8(abs) {
  if (bundleReadCache?.has(abs)) return bundleReadCache.get(abs);
  const text = readFileSync(abs, "utf8");
  if (bundleReadCache) bundleReadCache.set(abs, text);
  return text;
}

/**
 * Quoted scalars keep ` #`, colons and leading brackets. Unquoted values still
 * drop an inline ` #` comment, which is how older files were written.
 * @param {string} raw
 * @returns {string | string[]}
 */
function parseFrontmatterValue(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return unquoteScalar(trimmed);
  const hash = trimmed.indexOf(" #");
  const v = hash >= 0 ? trimmed.slice(0, hash).trim() : trimmed;
  if (v.startsWith("[") && v.endsWith("]")) {
    return splitFrontmatterList(v.slice(1, -1));
  }
  return v;
}

/**
 * @param {string} s
 */
function unquoteScalar(s) {
  const q = s[0];
  let out = "";
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (q === '"' && c === "\\") {
      out += s[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (c === q) return out;
    out += c;
  }
  return out;
}

/**
 * @param {string} inner
 */
function splitFrontmatterList(inner) {
  /** @type {string[]} */
  const out = [];
  let cur = "";
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      if (c === "\\" && quote === '"') {
        cur += inner[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (c === quote) {
        quote = "";
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ",") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * @param {string} value
 */
function quoteFrontmatterScalar(value) {
  const s = String(value);
  if (/[\r\n]/.test(s)) {
    throw Object.assign(new Error("frontmatter values cannot contain newlines"), { code: "usage" });
  }
  if (
    s === "" ||
    /^(true|false|null|yes|no)$/i.test(s) ||
    /^[\s[{'"*&!|>%@#]/.test(s) ||
    /[:#'"\\]/.test(s) ||
    /\s#/.test(s) ||
    /\s$/.test(s)
  ) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * @param {string[]} items
 */
function quoteFrontmatterList(items) {
  const parts = items.map((item) => {
    const s = String(item);
    if (/[\r\n]/.test(s)) {
      throw Object.assign(new Error("frontmatter values cannot contain newlines"), { code: "usage" });
    }
    if (/^[A-Za-z0-9_./+-]+$/.test(s)) return s;
    return quoteFrontmatterScalar(s);
  });
  return `[${parts.join(", ")}]`;
}

/**
 * A journal body that contains `## ` would split into extra hops. Demote those
 * lines so the hop heading stays the only level-2 heading.
 * @param {string} body
 */
export function demoteJournalBody(body) {
  return String(body || "").replace(/^##(?= )/gm, "###");
}

/**
 * @param {string} text
 * @returns {{ data: Record<string, string | string[]>, body: string }}
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  /** @type {Record<string, string | string[]>} */
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = parseFrontmatterValue(kv[2]);
  }
  return { data, body: m[2] };
}

/**
 * @param {Record<string, string | string[] | undefined>} data
 * @param {string} body
 */
export function stringifyFrontmatter(data, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    if (Array.isArray(v)) lines.push(`${k}: ${quoteFrontmatterList(v)}`);
    else lines.push(`${k}: ${quoteFrontmatterScalar(v)}`);
  }
  lines.push("---", "");
  const b = body.startsWith("\n") ? body.replace(/^\n+/, "") : body;
  return `${lines.join("\n")}${b.endsWith("\n") ? b : `${b}\n`}`;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

export { slugify };

/**
 * Repo-relative pointer (plan file, dump). Rejects `..` and absolute paths.
 * @param {string | undefined} raw
 * @returns {string | null | undefined} undefined if omitted, null if invalid
 */
export function repoRelativePath(raw) {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).replace(/\\/g, "/").trim();
  if (s.startsWith("/") || /^[A-Za-z]:/.test(s)) return null;
  const parts = s.split("/").filter((p) => p && p !== ".");
  if (parts.length === 0 || parts.some((p) => p === ".." || p.includes("\0"))) return null;
  return parts.join("/");
}

/**
 * @param {string} root
 * @param {{ name?: string, now?: Date }} [opts]
 */
export function ensureSkeleton(root, { name = "project", now = new Date() } = {}) {
  mkdirSync(root, { recursive: true });
  for (const d of CONCEPT_DIRS) mkdirSync(join(root, d), { recursive: true });
  const ts = now.toISOString();
  const date = localDate(now);
  const indexPath = join(root, "index.md");
  if (!existsSync(indexPath)) {
    writeAtomic(
      indexPath,
      stringifyFrontmatter(
        {
          type: "Status",
          title: `${name} — .mental index`,
          description: "Entry point and navigation for this .mental bundle.",
          tags: ["index"],
          timestamp: ts,
          status: "active",
        },
        `# ${name} — mental index

Private continuity log. Start at [current status](status/current.md).

- [Status](status/current.md) — disposable snapshot derived from live evidence
- [Journal](journal/) — concise outcomes and exact handoffs
- [Decisions](decisions/) — consequential choices and rationale
- [Attention](attention/) — residue still in the air after a hop
- [Notes](notes/) — durable facts that prevent repeat investigation
`,
      ),
    );
  }
  const statusPath = join(root, "status", "current.md");
  if (!existsSync(statusPath)) {
    writeAtomic(statusPath, renderStatus({ name, date, ts, now: "Not yet derived.", inFlight: "None", decisions: [], resume: "Run `mental status` after the first journal entry." }));
  }
  return root;
}

/**
 * @param {{
 *   name: string,
 *   date: string,
 *   ts: string,
 *   now: string,
 *   inFlight: string,
 *   decisions: Array<{ title: string, file: string, status: string, awaits?: string }>,
 *   attention?: Array<{ title: string, file: string, status: string, kind?: string }>,
 *   notes?: Array<{ title: string, file: string, status: string, description?: string }>,
 *   resume: string,
 *   against?: string | null,
 * }} opts
 */
export function renderStatus({ name, date, ts, now, inFlight, decisions, attention = [], notes = [], resume, against = null }) {
  const decLines =
    decisions.length === 0
      ? "- None"
      : decisions.map((d) => {
          const extra = d.status === "deferred" && d.awaits ? `: ${d.awaits}` : "";
          return `- [${d.title}](../decisions/${d.file}) — ${d.status}${extra}`;
        }).join("\n");
  const shownAttention = attention.slice(0, ATTENTION_HEARTBEAT_CAP);
  const extraAir =
    attention.length > ATTENTION_HEARTBEAT_CAP
      ? `\n- (+${attention.length - ATTENTION_HEARTBEAT_CAP} more)`
      : "";
  const laterShown = shownAttention.filter((a) => a.status === "later");
  const airShown = shownAttention.filter((a) => a.status !== "later");
  const attLine = (a) => {
    const tag = a.kind || a.status;
    return `- [${a.title}](../attention/${a.file}) — ${tag}`;
  };
  const airLines =
    airShown.length === 0 ? "- None" : airShown.map(attLine).join("\n") + (laterShown.length === 0 ? extraAir : "");
  const laterLines =
    laterShown.length === 0
      ? "- None"
      : laterShown.map(attLine).join("\n") + (airShown.length === 0 ? extraAir : "");
  const noteLines =
    notes.length === 0
      ? "- None"
      : notes
          .map((n) => {
            const extra = n.description ? ` — ${n.description}` : "";
            return `- [${n.title}](../notes/${n.file})${extra}`;
          })
          .join("\n");
  const againstLine = against ? `\nAgainst ${against}\n` : "";
  return stringifyFrontmatter(
    {
      type: "Status",
      title: "Current status",
      description: 'Derived "you are here" snapshot — regenerate, don\'t hand-edit.',
      tags: ["status"],
      timestamp: ts,
      status: "active",
    },
    `# Status — ${name}
_Derived ${date} from journal tail + git + residue + decisions + notes. Stale? Re-derive._

## Now
${now}

## In flight
${inFlight}
${againstLine}
## In the air
${airLines}

## Later
${laterLines}

## Unsettled
${decLines}

## Notes
${noteLines}

## ▶ Resume point
${resume}
`,
  );
}

/**
 * Latest journal `Resume:` line and the heading of that section.
 * @param {string} root
 */
export function latestJournalHandoff(root) {
  const empty = { resume: null, outcome: null, file: null, when: null, against: null, via: null };
  const dir = join(root, "journal");
  if (!existsSync(dir)) return empty;
  const all = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const dated = all.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  const files = dated.length ? dated : all.sort();
  if (files.length === 0) return empty;
  const file = files[files.length - 1];
  const text = readUtf8(join(dir, file));
  const { body } = parseFrontmatter(text);
  const sections = body.split(/^## /m).filter(Boolean);
  const last = sections[sections.length - 1] || body;
  const resumeM = last.match(/^Resume:\s*(.+)$/m) || body.match(/^Resume:\s*(.+)$/m);
  const againstM = last.match(/^Against:\s*(.+)$/m) || last.match(/^Plan:\s*(.+)$/m);
  const viaM = last.match(/^Via:\s*(.+)$/m);
  const headingM = last.match(/^([^\n]+)/);
  const heading = headingM ? headingM[1] : "";
  const outcome = heading.replace(/^\d{1,2}:\d{2}\s+—\s+/, "").trim() || null;
  const date = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? null;
  const timeM = heading.match(/^(\d{1,2}:\d{2})/);
  return {
    resume: resumeM ? resumeM[1].trim() : null,
    outcome,
    file: `journal/${file}`,
    when: date ? { date, time: timeM ? timeM[1] : null } : null,
    against: againstM ? againstM[1].trim() : null,
    via: viaM ? viaM[1].trim() : null,
  };
}

/**
 * Split a journal file body into hop sections (skip the `# YYYY-MM-DD` preamble).
 * @param {string} body
 * @returns {Array<{ heading: string, title: string, body: string, fragment: string }>}
 */
export function journalHops(body) {
  const parts = String(body || "").split(/^## /m);
  /** @type {Array<{ heading: string, title: string, body: string, fragment: string }>} */
  const hops = [];
  const used = new Set();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const heading = (part.split(/\r?\n/, 1)[0] || "").trim();
    if (!heading) continue;
    if (i === 0 && !/^\d{1,2}:\d{2}\b/.test(heading)) continue;
    const title = heading.replace(/^\d{1,2}:\d{2}\s+—\s+/, "").trim() || heading;
    const rest = part.slice(heading.length).replace(/^\r?\n/, "");
    hops.push({ heading, title, body: rest, fragment: journalFragment(heading, used) });
  }
  return hops;
}

/**
 * @param {string} heading
 * @param {Set<string>} used
 */
function journalFragment(heading, used) {
  const time = heading.match(/^(\d{1,2}:\d{2})/);
  const base = time
    ? time[1]
    : heading.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "section";
  let frag = base;
  let n = 2;
  while (used.has(frag)) {
    frag = `${base}-${n}`;
    n += 1;
  }
  used.add(frag);
  return frag;
}

/**
 * Newest journal sections first (dated files only). One entry per `## ` heading.
 *
 * @param {string} root
 * @param {number} [limit]
 * @returns {Array<{ path: string, file: string, heading: string, title: string }>}
 */
export function recentJournalSections(root, limit = 8) {
  const dir = join(root, "journal");
  if (!existsSync(dir)) return [];
  const dated = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  /** @type {ReturnType<typeof recentJournalSections>} */
  const out = [];
  for (const file of dated) {
    if (out.length >= limit) break;
    let text;
    try {
      text = readUtf8(join(dir, file));
    } catch {
      continue;
    }
    const { body } = parseFrontmatter(text);
    const sections = body.split(/^## /m).filter(Boolean);
    for (let i = sections.length - 1; i >= 0; i--) {
      if (out.length >= limit) break;
      const heading = (sections[i].split(/\r?\n/, 1)[0] || "").trim();
      if (!heading) continue;
      const title = heading.replace(/^\d{1,2}:\d{2}\s+—\s+/, "").trim() || heading;
      out.push({ path: `journal/${file}`, file, heading, title });
    }
  }
  return out;
}

/**
 * Markdown files under a bundle dir, recursively, as dir-relative posix paths,
 * newest name first. Matches how `list` walks the bundle, so counts agree.
 * @param {string} dir absolute
 * @returns {string[]}
 */
export function listMarkdownRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  const walkDir = (abs, rel) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walkDir(join(abs, e.name), next);
      else if (e.name.endsWith(".md")) out.push(next);
    }
  };
  walkDir(dir, "");
  return out.sort().reverse();
}

/**
 * Decided constraints, newest filename first. Titles only on the pulse.
 * @param {string} root
 */
export function listDecidedGuardrails(root) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of listMarkdownRecursive(dir)) {
    const text = readUtf8(join(dir, file));
    const { data } = parseFrontmatter(text);
    if (String(data.status || "") !== "decided") continue;
    out.push({
      path: `decisions/${file}`,
      file,
      title: String(data.title || basename(file, ".md")),
      status: "decided",
      timestamp: data.timestamp ? String(data.timestamp) : "",
    });
  }
  return out;
}

/**
 * Verify remainder first, then other residue. Newest-first order preserved in each group.
 * @param {Array<{ kind?: string }>} items
 * @param {number} [cap]
 */
export function capHeartbeatAttention(items, cap = ATTENTION_HEARTBEAT_CAP) {
  const verify = items.filter((a) => a.kind === "verify");
  const rest = items.filter((a) => a.kind !== "verify");
  return [...verify, ...rest].slice(0, cap);
}

/**
 * Open or deferred decisions. Newest filename first (same cap order as attention).
 * @param {string} root
 */
export function listOpenDecisions(root) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of listMarkdownRecursive(dir)) {
    const text = readUtf8(join(dir, file));
    const { data } = parseFrontmatter(text);
    const status = String(data.status || "open");
    if (status === "open" || status === "deferred") {
      out.push({
        path: `decisions/${file}`,
        file,
        title: String(data.title || basename(file, ".md")),
        status,
        description: data.description ? String(data.description) : "",
        timestamp: data.timestamp ? String(data.timestamp) : "",
      });
    }
  }
  return out;
}

/**
 * @param {string} root
 * @param {{ path?: string, title?: string }} opts
 * @returns {{ path: string, file: string, title: string, status: string, data: Record<string, string | string[]>, body: string } | null}
 */
export function findDecision(root, { path, title } = {}) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return null;
  if (path) {
    const rel = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
    const got = readBundleFile(root, rel);
    if (!got.ok) return null;
    if (!got.data.path.startsWith("decisions/") || !got.data.path.endsWith(".md")) return null;
    const d = got.data.data;
    return {
      path: got.data.path,
      file: basename(got.data.path),
      title: String(d.title || basename(got.data.path, ".md")),
      status: String(d.status || "open"),
      data: d,
      body: got.data.body,
    };
  }
  if (!title) return null;
  const matches = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = readUtf8(join(dir, file));
    const parsed = parseFrontmatter(text);
    const t = String(parsed.data.title || basename(file, ".md"));
    if (t === title) {
      matches.push({
        path: `decisions/${file}`,
        file,
        title: t,
        status: String(parsed.data.status || "open"),
        data: parsed.data,
        body: parsed.body,
      });
    }
  }
  matches.sort((a, b) => b.file.localeCompare(a.file));
  return matches[0] ?? null;
}

/**
 * One-line blurb for status JSON: frontmatter description, else first body paragraph.
 * @param {Record<string, string | string[]>} data
 * @param {string} body
 */
function noteBlurb(data, body) {
  if (data.description) return String(data.description);
  const stripped = body.replace(/^#\s+.+$/m, "").trim();
  const para = stripped.split(/\n\s*\n/)[0] || stripped;
  return para.replace(/\s+/g, " ").trim().slice(0, 240);
}

/**
 * Active/draft notes in the bundle. Superseded and obsolete files stay on disk but are omitted.
 * Missing `status` (Balakit-era notes) counts as `active`.
 * @param {string} root
 */
export function listNotes(root) {
  const dir = join(root, "notes");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const text = readUtf8(join(dir, file));
    const { data, body } = parseFrontmatter(text);
    const status = String(data.status || "active");
    if (status === "superseded" || status === "obsolete") continue;
    out.push({
      path: `notes/${file}`,
      file,
      title: String(data.title || basename(file, ".md")),
      status,
      description: noteBlurb(data, body),
    });
  }
  return out;
}

/**
 * Open or later attention (residue). Newest filename first. Resolved files stay on disk.
 * @param {string} root
 */
export function listOpenAttention(root) {
  const dir = join(root, "attention");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of listMarkdownRecursive(dir)) {
    const text = readUtf8(join(dir, file));
    const { data, body } = parseFrontmatter(text);
    const status = String(data.status || "open");
    if (status !== "open" && status !== "later") continue;
    out.push({
      path: `attention/${file}`,
      file,
      title: String(data.title || basename(file, ".md")),
      status,
      kind: data.kind ? String(data.kind) : "",
      from: data.from ? String(data.from) : "",
      against: data.against ? String(data.against) : "",
      description: noteBlurb(data, body),
      timestamp: data.timestamp ? String(data.timestamp) : "",
    });
  }
  return out;
}

/** Open attention older than this many days is "aging": a "still true?" review, not an alarm. */
export const AGING_DAYS = 7;

/**
 * Split open attention into what needs the person now, what is aging, standing directions
 * and what was parked on purpose.
 * @param {Array<{ path: string, status: string, kind: string, timestamp?: string }>} items
 * @param {Date} [now]
 * @returns {{ needYou: number, freshEyes: number, aging: number, directions: number, later: number }}
 */
export function splitAttention(items, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ageDays = (item) => {
    const m = /^attention\/(\d{4})-(\d{2})-(\d{2})-/.exec(item.path || "");
    const day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : item.timestamp ? new Date(item.timestamp) : null;
    if (!day || Number.isNaN(day.getTime())) return 0;
    return Math.round((today - new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) / 86400000);
  };
  const out = { needYou: 0, freshEyes: 0, aging: 0, directions: 0, later: 0 };
  for (const item of items) {
    if (item.status === "later") out.later += 1;
    else if (item.kind === "direction") out.directions += 1;
    else if (ageDays(item) >= AGING_DAYS) out.aging += 1;
    else {
      out.needYou += 1;
      if (item.kind === "verify") out.freshEyes += 1;
    }
  }
  return out;
}

/**
 * @param {string} root
 * @param {{ path?: string, title?: string }} opts
 * @returns {{ path: string, file: string, title: string, status: string, kind: string, from: string, against: string, data: Record<string, string | string[]>, body: string } | null}
 */
export function findAttention(root, { path, title } = {}) {
  const dir = join(root, "attention");
  if (!existsSync(dir)) return null;
  if (path) {
    const rel = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
    const got = readBundleFile(root, rel);
    if (!got.ok) return null;
    if (!got.data.path.startsWith("attention/") || !got.data.path.endsWith(".md")) return null;
    const d = got.data.data;
    return {
      path: got.data.path,
      file: basename(got.data.path),
      title: String(d.title || basename(got.data.path, ".md")),
      status: String(d.status || "open"),
      kind: d.kind ? String(d.kind) : "",
      from: d.from ? String(d.from) : "",
      against: d.against ? String(d.against) : "",
      data: d,
      body: got.data.body,
    };
  }
  if (!title) return null;
  const matches = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const text = readUtf8(join(dir, file));
    const parsed = parseFrontmatter(text);
    const t = String(parsed.data.title || basename(file, ".md"));
    if (t === title) {
      matches.push({
        path: `attention/${file}`,
        file,
        title: t,
        status: String(parsed.data.status || "open"),
        kind: parsed.data.kind ? String(parsed.data.kind) : "",
        from: parsed.data.from ? String(parsed.data.from) : "",
        against: parsed.data.against ? String(parsed.data.against) : "",
        data: parsed.data,
        body: parsed.body,
      });
    }
  }
  matches.sort((a, b) => b.file.localeCompare(a.file));
  return matches[0] ?? null;
}

const SCRUB_KEYS = ["title", "description", "body", "resume", "from", "against", "via"];

/**
 * @param {Record<string, string | undefined>} fields
 * @param {{ noRedact?: boolean, gitRoot?: string | null }} [opts]
 */
function scrubWriteFields(fields, opts = {}) {
  for (const key of ["title", "description", "resume", "from", "against", "via"]) {
    if (typeof fields[key] === "string" && /[\r\n]/.test(fields[key])) {
      throw Object.assign(new Error(`${key} cannot contain a newline`), { code: "usage" });
    }
  }
  /** @type {Array<{ field: string, kind: string }>} */
  const redacted = [];
  if (opts.noRedact) return { fields, redacted, redact: false };
  const envValues = loadEnvSecretValues(opts.gitRoot || null);
  /** @type {Record<string, string | undefined>} */
  const out = { ...fields };
  for (const key of SCRUB_KEYS) {
    if (typeof out[key] !== "string" || !out[key]) continue;
    const r = redactText(out[key], { envValues });
    out[key] = r.text;
    for (const kind of r.kinds) redacted.push({ field: key, kind });
  }
  return { fields: out, redacted };
}

/**
 * @param {Record<string, string | string[] | undefined>} data
 * @param {{ head?: string, paths?: string[] } | null | undefined} anchor
 * @param {string[] | undefined} refs
 */
function stampAnchor(data, anchor, refs) {
  if (anchor?.head) data.head = anchor.head;
  if (anchor) data.paths = anchor.paths?.length ? anchor.paths : undefined;
  if (refs?.length) data.refs = refs;
  return data;
}

/**
 * @param {{ redacted: Array<{ field: string, kind: string }>, redact?: false, refHint?: string | null }} extra
 */
function writeEnvelope(extra) {
  return {
    ...(extra.redacted?.length ? { redacted: extra.redacted } : {}),
    ...(extra.redact === false ? { redact: false } : {}),
    ...(extra.refHint ? { refHint: extra.refHint } : {}),
  };
}

/**
 * @param {string} root
 * @param {{ title: string, status?: string, kind: string, from?: string, against?: string, via?: string, description?: string, body?: string, slug?: string, tags?: string[], now?: Date, noRedact?: boolean, gitRoot?: string | null, anchor?: { head: string, paths: string[] } | null, refs?: string[], refHint?: string | null }} opts
 */
export function writeAttention(root, opts) {
  const scrub = scrubWriteFields(opts, opts);
  const { title, status = "open", kind, from, against, via, description = "", body = "", slug, tags, now = new Date() } = { ...opts, ...scrub.fields };
  ensureSkeleton(root);
  const day = localDate(now);
  const s = slug || slugify(title);
  const rel = `attention/${day}-${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Attention already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  const text = String(body || "").trim();
  const markdown = text ? `# ${title}\n\n${text}\n` : `# ${title}\n`;
  writeAtomic(
    file,
    stringifyFrontmatter(
      stampAnchor(
        {
          type: "Attention",
          title,
          description: description || title,
          tags: tagsToStore(tags) ?? [],
          timestamp: ts,
          status,
          kind,
          from: from || undefined,
          against: against || undefined,
          via: via || undefined,
        },
        opts.anchor,
        opts.refs,
      ),
      markdown,
    ),
  );
  return { path: rel, updated: false, ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }) };
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {{ title?: string, status?: string, kind?: string, from?: string, against?: string, via?: string, description?: string, body?: string, tags?: string[], now?: Date }} opts
 */
export function updateAttention(root, rel, opts) {
  const scrub = scrubWriteFields(opts, opts);
  const { title, status, kind, from, against, via, description, body, tags, now = new Date() } = { ...opts, ...scrub.fields };
  const got = readBundleFile(root, rel);
  if (!got.ok) {
    throw Object.assign(new Error(got.error.message), { code: got.error.code });
  }
  const data = { ...got.data.data };
  if (title) data.title = title;
  if (status) data.status = status;
  if (kind) data.kind = kind;
  if (from != null && from !== "") data.from = from;
  if (against != null && against !== "") data.against = against;
  if (via != null && via !== "") data.via = via;
  if (description) data.description = description;
  const nextTags = tagsToStore(tags);
  if (nextTags !== undefined) data.tags = nextTags;
  data.timestamp = now.toISOString();
  data.type = "Attention";
  stampAnchor(data, opts.anchor, opts.refs);
  let nextBody = got.data.body;
  if (body != null && body !== "") {
    const heading = String(data.title || title || "Attention");
    nextBody = `# ${heading}\n\n${body.trim()}\n`;
  } else if (title) {
    nextBody = got.data.body.replace(/^#\s+.+$/m, `# ${title}`);
  }
  writeAtomic(got.data.abs, stringifyFrontmatter(data, nextBody));
  return { path: rel, updated: true, ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }) };
}

/**
 * @param {string} root
 * @param {{ title: string, body?: string, resume?: string, against?: string, via?: string, hop?: boolean, now?: Date }} opts
 */
function journalSection({ time, title, body, resume, against, via, hop, anchor, refs }) {
  const lines = [`## ${time} — ${title}`];
  if (hop) lines.push("Hop: park");
  if (via) lines.push(`Via: ${via}`);
  if (anchor?.head) lines.push(`Head: ${anchor.head}`);
  if (anchor?.paths?.length) lines.push(`Paths: ${anchor.paths.join(", ")}`);
  for (const ref of refs || []) lines.push(`Ref: ${ref}`);
  const prose = demoteJournalBody(body).trim();
  if (prose) lines.push(prose);
  if (against) lines.push("", `Against: ${against}`);
  lines.push(`Resume: ${resume}`);
  return `${lines.join("\n")}\n`;
}

export function appendJournal(root, opts) {
  const scrub = scrubWriteFields(
    {
      title: opts.title,
      body: opts.body || "",
      resume: opts.resume || "Continue. — open loops: none",
      against: opts.against,
      via: opts.via,
    },
    opts,
  );
  const title = scrub.fields.title;
  const body = scrub.fields.body || "";
  const resume = scrub.fields.resume || "Continue. — open loops: none";
  const against = scrub.fields.against;
  const via = scrub.fields.via;
  const { hop = false, now = new Date() } = opts;
  ensureSkeleton(root);
  const day = localDate(now);
  const file = join(root, "journal", `${day}.md`);
  const lock = `${file}.lock`;
  return withFileLock(lock, () => {
    const ts = now.toISOString();
    const time = localTime(now);
    const section = journalSection({ time, title, body, resume, against, via, hop, anchor: opts.anchor, refs: opts.refs });
    if (!existsSync(file)) {
      writeAtomic(
        file,
        stringifyFrontmatter(
          {
            type: "Journal",
            title: `Journal — ${day}`,
            description: `Work log for ${day}.`,
            tags: ["journal"],
            timestamp: ts,
            status: "active",
          },
          `# ${day}\n\n${section}`,
        ),
      );
    } else {
      const cur = readFileSync(file, "utf8");
      const { data, body: existing } = parseFrontmatter(cur);
      data.timestamp = ts;
      const nextBody = `${existing.replace(/\s*$/, "")}\n\n${section}`;
      writeAtomic(file, stringifyFrontmatter(data, nextBody));
    }
    return {
      path: `journal/${day}.md`,
      section,
      against: against ?? null,
      ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }),
    };
  });
}

/**
 * Create a decision file. `body` is the why — required; never a scaffold of placeholders.
 * @param {string} root
 * @param {{ title: string, status?: string, description?: string, body?: string, via?: string, slug?: string, tags?: string[], now?: Date }} opts
 * @throws {{ code: string }} `usage` when `body` is missing or whitespace, or tags are not a TagList.
 */
export function writeDecision(root, opts) {
  const scrub = scrubWriteFields(opts, opts);
  const { title, status = "open", description = "", body = "", via, slug, tags, now = new Date() } = { ...opts, ...scrub.fields };
  ensureSkeleton(root);
  const text = String(body || "").trim();
  if (!text) {
    throw Object.assign(new Error("mental decide create requires --body"), { code: "usage" });
  }
  const day = localDate(now);
  const s = slug || slugify(title);
  const rel = `decisions/${day}-${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Decision already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  writeAtomic(
    file,
    stringifyFrontmatter(
      stampAnchor(
        {
          type: "Decision",
          title,
          description: description || title,
          tags: tagsToStore(tags) ?? [],
          timestamp: ts,
          status,
          via: via || undefined,
        },
        opts.anchor,
        opts.refs,
      ),
      `# ${title}\n\n${text}\n`,
    ),
  );
  return { path: rel, updated: false, ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }) };
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {{ title?: string, status?: string, description?: string, body?: string, via?: string, tags?: string[], now?: Date }} opts
 */
export function updateDecision(root, rel, opts) {
  const scrub = scrubWriteFields(opts, opts);
  const { title, status, description, body, via, tags, now = new Date() } = { ...opts, ...scrub.fields };
  const got = readBundleFile(root, rel);
  if (!got.ok) {
    throw Object.assign(new Error(got.error.message), { code: got.error.code });
  }
  const data = { ...got.data.data };
  if (title) data.title = title;
  if (status) data.status = status;
  if (description) data.description = description;
  if (via != null && via !== "") data.via = via;
  const nextTags = tagsToStore(tags);
  if (nextTags !== undefined) data.tags = nextTags;
  data.timestamp = now.toISOString();
  data.type = "Decision";
  stampAnchor(data, opts.anchor, opts.refs);
  let nextBody = got.data.body;
  if (body != null && body !== "") {
    const heading = String(data.title || title || "Decision");
    nextBody = `# ${heading}\n\n${body.trim()}\n`;
  } else if (title) {
    nextBody = got.data.body.replace(/^#\s+.+$/m, `# ${title}`);
  }
  writeAtomic(got.data.abs, stringifyFrontmatter(data, nextBody));
  return { path: rel, updated: true, ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }) };
}

/**
 * @param {string} root
 * @param {{ title: string, status?: string, description?: string, body?: string, slug?: string, tags?: string[], now?: Date }} opts
 */
export function writeNote(root, opts) {
  const scrub = scrubWriteFields(opts, opts);
  const { title, status = "active", description = "", body = "", slug, tags, now = new Date() } = { ...opts, ...scrub.fields };
  ensureSkeleton(root);
  const s = slug || slugify(title);
  const rel = `notes/${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Note already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  writeAtomic(
    file,
    stringifyFrontmatter(
      stampAnchor(
        {
          type: "Note",
          title,
          description: description || title,
          tags: tagsToStore(tags) ?? [],
          timestamp: ts,
          status,
        },
        opts.anchor,
        opts.refs,
      ),
      `# ${title}\n\n${String(body || "").trim() || "<durable, non-obvious, repository-specific fact>"}\n`,
    ),
  );
  return { path: rel, ...writeEnvelope({ redacted: scrub.redacted, redact: opts.noRedact ? false : undefined, refHint: opts.refHint }) };
}

export function bundleName(root, fallback = "project") {
  const index = join(root, "index.md");
  if (existsSync(index)) {
    const { data } = parseFrontmatter(readFileSync(index, "utf8"));
    if (data.title) return String(data.title).replace(/\s+—\s+\.mental index$/i, "");
  }
  return basename(root) === ".mental" ? basename(dirname(root)) : fallback;
}

/**
 * Read one OKF file relative to the bundle root. Rejects `..` and absolute paths.
 *
 * @param {string} root
 * @param {string} relPath
 * @returns {{ ok: true, data: { path: string, abs: string, text: string, data: Record<string, string | string[]>, body: string } } | { ok: false, error: { code: string, message: string } }}
 */
export function readBundleFile(root, relPath) {
  const raw = String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  const hash = raw.indexOf("#");
  const rel = hash >= 0 ? raw.slice(0, hash) : raw;
  const fragment = hash >= 0 ? raw.slice(hash + 1) : "";
  if (!rel || rel.includes("\0") || rel.split("/").some((p) => p === ".." || p === "")) {
    return { ok: false, error: { code: "path", message: "path must be a relative file inside the bundle" } };
  }
  const abs = resolvePath(root, rel);
  const rootAbs = resolvePath(root);
  const relToRoot = relative(rootAbs, abs);
  if (!relToRoot || relToRoot.startsWith("..") || relToRoot.startsWith(`..${sep}`)) {
    return { ok: false, error: { code: "path", message: "path escapes the bundle root" } };
  }
  if (!existsSync(abs)) {
    return { ok: false, error: { code: "not-found", message: `no such file: ${rel}` } };
  }
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "read", message } };
  }
  const parsed = parseFrontmatter(text);
  let body = parsed.body;
  let pathOut = rel;
  if (fragment) {
    const hops = journalHops(parsed.body);
    const hop = hops.find((h) => h.fragment === fragment);
    if (!hop) {
      return { ok: false, error: { code: "not-found", message: `no such section: ${raw}` } };
    }
    body = `## ${hop.heading}\n${hop.body}`;
    pathOut = raw;
  }
  return { ok: true, data: { path: pathOut, abs, text, data: parsed.data, body } };
}

/**
 * Copy OKF files from one bundle root to another. Skips disposable `status/`.
 * @param {string} src
 * @param {string} dest
 * @param {{ skip?: Set<string> }} [opts]
 * @returns {string[]} copied top-level names
 */
export function copyOkfTree(src, dest, { skip = new Set(["status"]) } = {}) {
  mkdirSync(dest, { recursive: true });
  if (!existsSync(src)) return [];
  /** @type {string[]} */
  const copied = [];
  for (const name of readdirSync(src)) {
    if (skip.has(name) || name === ".mental-local" || isTimeSidecarName(name)) continue;
    cpSync(join(src, name), join(dest, name), { recursive: true, force: true });
    copied.push(name);
  }
  const srcDb = join(src, TIME_DB);
  const destDb = join(dest, TIME_DB);
  if (existsSync(srcDb) && !existsSync(destDb)) {
    const b = backupTimeDb(srcDb, destDb);
    if (b.ok && !b.skipped) copied.push(TIME_DB);
  }
  return copied;
}

/** Dirs packed by backup/restore. Never `status/` or hours. */
export const OKF_PACK_DIRS = ["journal", "decisions", "attention", "notes"];

/**
 * Map of posix-relative OKF paths → absolute files under a bundle root.
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function listPackedOkfFiles(root) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!root || !existsSync(root)) return out;
  for (const dir of OKF_PACK_DIRS) {
    walkPacked(join(root, dir), dir, out);
  }
  return out;
}

/**
 * @param {string} abs
 * @param {string} rel
 * @param {Map<string, string>} out
 */
function walkPacked(abs, rel, out) {
  if (!existsSync(abs)) return;
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    if (isTimeSidecarName(ent.name)) continue;
    const nextAbs = join(abs, ent.name);
    const nextRel = `${rel}/${ent.name}`;
    if (ent.isDirectory()) walkPacked(nextAbs, nextRel, out);
    else if (ent.isFile()) out.set(nextRel, nextAbs);
  }
}

/**
 * Merge pack OKF into dest without last-write-wins on journals.
 * @param {string} destRoot
 * @param {Map<string, string>} packFiles rel → abs in the archive
 * @param {{ dryRun?: boolean }} [opts] dryRun reports the same result without writing anything
 * @returns {{ wrote: string[], kept: string[], journalMerged: string[] }}
 */
export function mergeOkfTree(destRoot, packFiles, { dryRun = false, viaImport = "" } = {}) {
  if (!dryRun) mkdirSync(destRoot, { recursive: true });
  const destFiles = listPackedOkfFiles(destRoot);
  /** @type {string[]} */
  const wrote = [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const journalMerged = [];
  const rels = new Set([...destFiles.keys(), ...packFiles.keys()]);
  for (const rel of rels) {
    const destAbs = destFiles.get(rel);
    const packAbs = packFiles.get(rel);
    if (!packAbs) {
      kept.push(rel);
      continue;
    }
    if (!destAbs) {
      if (!dryRun) copyPackedFile(packAbs, join(destRoot, ...rel.split("/")));
      wrote.push(rel);
      continue;
    }
    if (rel.startsWith("journal/") && rel.endsWith(".md")) {
      const r = mergeJournalFile(destAbs, packAbs, { dryRun, viaImport });
      if (r.changed) journalMerged.push(rel);
      else kept.push(rel);
      continue;
    }
    if (packConceptNewer(destAbs, packAbs)) {
      if (!dryRun) copyPackedFile(packAbs, destAbs);
      wrote.push(rel);
    } else {
      kept.push(rel);
    }
  }
  return { wrote, kept, journalMerged };
}

/**
 * Replace dest OKF (four dirs only) with pack files. Leaves hours/status/index.
 * @param {string} destRoot
 * @param {Map<string, string>} packFiles
 */
export function replaceOkfTree(destRoot, packFiles, { dryRun = false } = {}) {
  if (!dryRun) mkdirSync(destRoot, { recursive: true });
  const destFiles = listPackedOkfFiles(destRoot);
  const removed = [];
  for (const [rel, abs] of destFiles) {
    if (!packFiles.has(rel)) {
      removed.push(rel);
      if (dryRun) continue;
      try {
        rmSync(abs);
      } catch {
        // dest-only file already gone
      }
    }
  }
  for (const [rel, packAbs] of packFiles) {
    if (!dryRun) copyPackedFile(packAbs, join(destRoot, ...rel.split("/")));
  }
  return { removed, wrote: [...packFiles.keys()] };
}

/**
 * @param {string} destAbs
 * @param {string} packAbs
 */
function packConceptNewer(destAbs, packAbs) {
  const destText = readFileSync(destAbs, "utf8");
  const packText = readFileSync(packAbs, "utf8");
  const destMs = conceptTimeFromText(destAbs, destText);
  const packMs = conceptTimeFromText(packAbs, packText);
  return packMs > destMs;
}

/**
 * @param {string} abs
 * @param {string} text
 */
function conceptTimeFromText(abs, text) {
  const { data } = parseFrontmatter(text);
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
 * Union journal hops. Same heading + different body keeps dest and appends
 * the pack hop as `## HH:MM — Title (from backup)`.
 * @param {string} destAbs
 * @param {string} packAbs
 * @returns {{ changed: boolean }}
 */
export function mergeJournalFile(destAbs, packAbs, { dryRun = false, viaImport = "" } = {}) {
  const destRaw = readFileSync(destAbs, "utf8");
  const packRaw = readFileSync(packAbs, "utf8");
  const dest = parseFrontmatter(destRaw);
  const pack = parseFrontmatter(packRaw);
  const destHops = journalHops(dest.body);
  const packHops = journalHops(pack.body);
  const destExact = new Set(destHops.map((h) => hopIdentity(h)));
  /** @type {typeof destHops} */
  const extra = [];
  for (const hop of packHops) {
    if (destExact.has(hopIdentity(hop))) continue;
    const clash = destHops.some((d) => d.heading === hop.heading && normHopBody(stripImportVia(d.body)) !== normHopBody(stripImportVia(hop.body)));
    if (clash) {
      const renamed = {
        ...hop,
        heading: backupHopHeading(hop.heading),
        body: tagImportHop(hop.body, viaImport),
      };
      if (destExact.has(hopIdentity(renamed))) continue;
      if (extra.some((e) => hopIdentity(e) === hopIdentity(renamed))) continue;
      extra.push(renamed);
      continue;
    }
    extra.push({ ...hop, body: tagImportHop(hop.body, viaImport) });
  }
  if (extra.length === 0) return { changed: false };
  if (dryRun) return { changed: true };
  const preamble = journalPreamble(dest.body);
  const destBlocks = destHops.map((h) => `## ${h.heading}\n${h.body.replace(/\s+$/, "")}`).join("\n\n");
  const extraBlocks = extra.map((h) => `## ${h.heading}\n${h.body.replace(/\s+$/, "")}`).join("\n\n");
  const nextBody = [preamble.replace(/\s+$/, ""), destBlocks, extraBlocks].filter(Boolean).join("\n\n") + "\n";
  dest.data.timestamp = new Date().toISOString();
  writeAtomic(destAbs, stringifyFrontmatter(dest.data, nextBody));
  return { changed: true };
}

/**
 * @param {{ heading: string, body: string }} hop
 */
function stripImportVia(body) {
  return String(body || "").replace(/^Via: import .+\n?/gm, "");
}

function hopIdentity(hop) {
  return `${hop.heading}\n${normHopBody(stripImportVia(hop.body))}`;
}

/**
 * @param {string} body
 * @param {string} viaImport
 */
function tagImportHop(body, viaImport) {
  if (!viaImport) return body;
  const line = `Via: import ${viaImport}`;
  if (new RegExp(`^Via: import ${viaImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(body)) return body;
  return `${line}\n${String(body || "").replace(/^\n/, "")}`;
}

/** @param {string} body */
function normHopBody(body) {
  return String(body || "").replace(/\s+$/g, "").trim();
}

/** @param {string} heading */
function backupHopHeading(heading) {
  if (/\s+\(from backup\)$/.test(heading)) return heading;
  return `${heading} (from backup)`;
}

/** @param {string} body */
function journalPreamble(body) {
  const idx = String(body || "").search(/^## /m);
  if (idx < 0) return String(body || "").trim();
  return String(body).slice(0, idx).trim();
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyPackedFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}
