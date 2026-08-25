/**
 * OKF markdown SoT: tiny frontmatter parse/write + bundle skeleton.
 * No YAML library — templates only need scalars and `[tag, lists]`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { basename, dirname, join, relative, resolve as resolvePath, sep } from "node:path";

export const CONCEPT_DIRS = ["journal", "decisions", "notes", "status"];

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
 *   notes?: Array<{ title: string, file: string, status: string, description?: string }>,
 *   resume: string,
 * }} opts
 */
export function renderStatus({ name, date, ts, now, inFlight, decisions, notes = [], resume }) {
  const decLines =
    decisions.length === 0
      ? "- None"
      : decisions.map((d) => {
          const extra = d.status === "deferred" && d.awaits ? `: ${d.awaits}` : "";
          return `- [${d.title}](../decisions/${d.file}) — ${d.status}${extra}`;
        }).join("\n");
  const noteLines =
    notes.length === 0
      ? "- None"
      : notes
          .map((n) => {
            const extra = n.description ? ` — ${n.description}` : "";
            return `- [${n.title}](../notes/${n.file})${extra}`;
          })
          .join("\n");
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
_Derived ${date} from journal tail + git + open decisions + notes. Stale? Re-derive._

## Now
${now}

## In flight
${inFlight}

## Open decisions
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
  const empty = { resume: null, outcome: null, file: null, when: null };
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
 * @param {string} root
 */
export function listOpenDecisions(root) {
  const dir = join(root, "decisions");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
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
      });
    }
  }
  return out;
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
 * @param {string} root
 * @param {{ title: string, body?: string, resume?: string, now?: Date }} opts
 */
export function appendJournal(root, { title, body = "", resume = "Continue. — open loops: none", now = new Date() }) {
  ensureSkeleton(root);
  const day = localDate(now);
  const file = join(root, "journal", `${day}.md`);
  const ts = now.toISOString();
  const time = localTime(now);
  const section = `## ${time} — ${title}
${body.trim()}

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
  return { path: `journal/${day}.md`, section };
}

/**
 * @param {string} root
 * @param {{ title: string, status?: string, description?: string, body?: string, slug?: string, now?: Date }} opts
 */
export function writeDecision(root, { title, status = "open", description = "", body = "", slug, now = new Date() }) {
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
      },
      `# ${title}

${defaultBody}`,
    ),
  );
  return { path: rel };
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
    if (skip.has(name) || name === ".mental-local") continue;
    cpSync(join(src, name), join(dest, name), { recursive: true, force: true });
    copied.push(name);
  }
  return copied;
}
