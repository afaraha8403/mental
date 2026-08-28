/**
 * OKF markdown SoT: tiny frontmatter parse/write + bundle skeleton.
 * No YAML library — templates only need scalars and `[tag, lists]`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { basename, dirname, join, relative, resolve as resolvePath, sep } from "node:path";
import { backupTimeDb, isTimeSidecarName, TIME_DB } from "./time.mjs";

export const CONCEPT_DIRS = ["journal", "decisions", "notes", "attention", "status"];

export const ATTENTION_STATUSES = new Set(["open", "later", "resolved"]);
export const ATTENTION_KINDS = new Set(["direction", "concern", "thread", "verify"]);
export const ATTENTION_HEARTBEAT_CAP = 7;
/** Mirror attention: heartbeat TTY + JSON lists cap here; extras via `list`. */
export const DECISION_HEARTBEAT_CAP = 7;
export const DECISION_STATUSES = new Set(["open", "deferred", "decided", "superseded"]);

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
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    if (!kv) continue;
    let v = kv[2];
    const hash = v.indexOf(" #");
    if (hash >= 0) v = v.slice(0, hash).trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      data[kv[1]] = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[kv[1]] = v.replace(/^["']|["']$/g, "");
    }
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
    if (Array.isArray(v)) lines.push(`${k}: [${v.join(", ")}]`);
    else lines.push(`${k}: ${v}`);
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
    writeFileSync(
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
    writeFileSync(statusPath, renderStatus({ name, date, ts, now: "Not yet derived.", inFlight: "None", decisions: [], resume: "Run `mental status` after the first journal entry." }));
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
  const airLines =
    shownAttention.length === 0
      ? "- None"
      : shownAttention
          .map((a) => {
            const tag = a.status === "later" ? "later" : a.kind || a.status;
            return `- [${a.title}](../attention/${a.file}) — ${tag}`;
          })
          .join("\n") + extraAir;
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
  const text = readFileSync(join(dir, file), "utf8");
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
      text = readFileSync(join(dir, file), "utf8");
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
 * Decided constraints, newest filename first. Titles only on the pulse.
 * @param {string} root
 */
export function listDecidedGuardrails(root) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse()) {
    const text = readFileSync(join(dir, file), "utf8");
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
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse()) {
    const text = readFileSync(join(dir, file), "utf8");
    const { data } = parseFrontmatter(text);
    const status = String(data.status || "");
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
    const text = readFileSync(join(dir, file), "utf8");
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
 * Active/draft notes in the bundle. Superseded files stay on disk but are omitted.
 * Missing `status` (Balakit-era notes) counts as `active`.
 * @param {string} root
 */
export function listNotes(root) {
  const dir = join(root, "notes");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const text = readFileSync(join(dir, file), "utf8");
    const { data, body } = parseFrontmatter(text);
    const status = String(data.status || "active");
    if (status === "superseded") continue;
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
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse()) {
    const text = readFileSync(join(dir, file), "utf8");
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
    const text = readFileSync(join(dir, file), "utf8");
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

/**
 * @param {string} root
 * @param {{ title: string, status?: string, kind: string, from?: string, against?: string, via?: string, description?: string, body?: string, slug?: string, now?: Date }} opts
 */
export function writeAttention(root, { title, status = "open", kind, from, against, via, description = "", body = "", slug, now = new Date() }) {
  ensureSkeleton(root);
  const day = localDate(now);
  const s = slug || slugify(title);
  const rel = `attention/${day}-${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Attention already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  const text = body.trim() || "<why this would cost a reload if forgotten>";
  writeFileSync(
    file,
    stringifyFrontmatter(
      {
        type: "Attention",
        title,
        description: description || title,
        tags: [],
        timestamp: ts,
        status,
        kind,
        from: from || undefined,
        against: against || undefined,
        via: via || undefined,
      },
      `# ${title}

${text}
`,
    ),
  );
  return { path: rel, updated: false };
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {{ title?: string, status?: string, kind?: string, from?: string, against?: string, via?: string, description?: string, body?: string, now?: Date }} opts
 */
export function updateAttention(root, rel, { title, status, kind, from, against, via, description, body, now = new Date() }) {
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
  data.timestamp = now.toISOString();
  data.type = "Attention";
  let nextBody = got.data.body;
  if (body != null && body !== "") {
    const heading = String(data.title || title || "Attention");
    nextBody = `# ${heading}\n\n${body.trim()}\n`;
  } else if (title) {
    nextBody = got.data.body.replace(/^#\s+.+$/m, `# ${title}`);
  }
  writeFileSync(got.data.abs, stringifyFrontmatter(data, nextBody));
  return { path: rel, updated: true };
}

/**
 * @param {string} root
 * @param {{ title: string, body?: string, resume?: string, against?: string, via?: string, hop?: boolean, now?: Date }} opts
 */
export function appendJournal(root, { title, body = "", resume = "Continue. — open loops: none", against, via, hop = false, now = new Date() }) {
  ensureSkeleton(root);
  const day = localDate(now);
  const file = join(root, "journal", `${day}.md`);
  const ts = now.toISOString();
  const time = localTime(now);
  const hopLine = hop ? "Hop: park\n" : "";
  const viaLine = via ? `Via: ${via}\n` : "";
  const againstLine = against ? `\nAgainst: ${against}\n` : "";
  const section = `## ${time} — ${title}
${hopLine}${viaLine}${body.trim()}
${againstLine}
Resume: ${resume}
`;
  if (!existsSync(file)) {
    writeFileSync(
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
        `# ${day}

${section}`,
      ),
    );
  } else {
    const cur = readFileSync(file, "utf8");
    const { data, body: existing } = parseFrontmatter(cur);
    data.timestamp = ts;
    const nextBody = `${existing.replace(/\s*$/, "")}\n\n${section}`;
    writeFileSync(file, stringifyFrontmatter(data, nextBody));
  }
  return { path: `journal/${day}.md`, section, against: against ?? null };
}

/**
 * @param {string} root
 * @param {{ title: string, status?: string, description?: string, body?: string, via?: string, slug?: string, now?: Date }} opts
 */
export function writeDecision(root, { title, status = "open", description = "", body = "", via, slug, now = new Date() }) {
  ensureSkeleton(root);
  const day = localDate(now);
  const s = slug || slugify(title);
  const rel = `decisions/${day}-${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Decision already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  const defaultBody = `## Context
${body.trim() || "<why this choice matters>"}

## Options
- <option A> — <tradeoff>
- <option B> — <tradeoff>

## Outcome
<For open: what input is needed. For deferred: what it awaits. For decided: what was chosen, why, and when.>
`;
  writeFileSync(
    file,
    stringifyFrontmatter(
      {
        type: "Decision",
        title,
        description: description || title,
        tags: [],
        timestamp: ts,
        status,
        via: via || undefined,
      },
      `# ${title}

${defaultBody}`,
    ),
  );
  return { path: rel, updated: false };
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {{ title?: string, status?: string, description?: string, body?: string, via?: string, now?: Date }} opts
 */
export function updateDecision(root, rel, { title, status, description, body, via, now = new Date() }) {
  const got = readBundleFile(root, rel);
  if (!got.ok) {
    throw Object.assign(new Error(got.error.message), { code: got.error.code });
  }
  const data = { ...got.data.data };
  if (title) data.title = title;
  if (status) data.status = status;
  if (description) data.description = description;
  if (via != null && via !== "") data.via = via;
  data.timestamp = now.toISOString();
  data.type = "Decision";
  let nextBody = got.data.body;
  if (body != null && body !== "") {
    const heading = String(data.title || title || "Decision");
    nextBody = `# ${heading}\n\n${body.trim()}\n`;
  } else if (title) {
    nextBody = got.data.body.replace(/^#\s+.+$/m, `# ${title}`);
  }
  writeFileSync(got.data.abs, stringifyFrontmatter(data, nextBody));
  return { path: rel, updated: true };
}

/**
 * @param {string} root
 * @param {{ title: string, status?: string, description?: string, body?: string, slug?: string, now?: Date }} opts
 */
export function writeNote(root, { title, status = "active", description = "", body = "", slug, now = new Date() }) {
  ensureSkeleton(root);
  const s = slug || slugify(title);
  const rel = `notes/${s}.md`;
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) throw Object.assign(new Error(`Note already exists: ${rel}`), { code: "exists" });
  const ts = now.toISOString();
  writeFileSync(
    file,
    stringifyFrontmatter(
      {
        type: "Note",
        title,
        description: description || title,
        tags: [],
        timestamp: ts,
        status,
      },
      `# ${title}

${body.trim() || "<durable, non-obvious, repository-specific fact>"}
`,
    ),
  );
  return { path: rel };
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
  const rel = String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
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
  return { ok: true, data: { path: rel, abs, text, data: parsed.data, body: parsed.body } };
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
