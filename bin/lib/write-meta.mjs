/**
 * Shared write options: refs, git anchor, local redaction, transcript hint.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, isAbsolute, resolve } from "node:path";
import { gitAnchor } from "./git.mjs";
import { repoRelativePath } from "./okf.mjs";

const TRANSCRIPT_DIRS = ["transcripts", ".transcripts"];

/**
 * @param {Record<string, string | boolean | string[]> | undefined} flags
 * @param {string} key
 * @returns {string[]}
 */
export function flagList(flags, key) {
  const v = flags?.[key];
  if (v == null || v === false || v === true) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return [String(v).trim()].filter(Boolean);
}

/**
 * https URL or a path inside the git repo. `file://` and outside paths are rejected
 * so a backup cannot carry another machine's absolute path.
 * @param {string} raw
 * @param {string | null | undefined} gitRoot
 * @returns {{ ok: true, ref: string } | { ok: false, message: string }}
 */
export function parseRef(raw, gitRoot) {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, message: "--ref is empty" };
  if (/[\r\n]/.test(s)) return { ok: false, message: "--ref cannot contain a newline" };
  if (/^file:/i.test(s)) return { ok: false, message: "--ref rejects file:// URLs" };
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, message: "--ref must be an https URL or a repo-relative path" };
      }
      return { ok: true, ref: s };
    } catch {
      return { ok: false, message: "--ref URL is invalid" };
    }
  }
  if (s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s)) {
    if (!gitRoot) return { ok: false, message: "--ref absolute paths need a git repo" };
    const rel = relative(resolve(gitRoot), resolve(s));
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      return { ok: false, message: "--ref must stay inside the git repo" };
    }
    return { ok: true, ref: rel.split("\\").join("/") };
  }
  const rel = repoRelativePath(s);
  if (!rel) return { ok: false, message: "--ref must be an https URL or a repo-relative path (no ..)" };
  return { ok: true, ref: rel };
}

/**
 * Newest file under a known transcript folder, as a repo-relative path.
 * Suggestion only — never stored unless the caller passes `--ref`.
 * @param {string | null | undefined} gitRoot
 * @returns {string | null}
 */
export function suggestTranscriptRef(gitRoot) {
  if (!gitRoot) return null;
  /** @type {{ path: string, mtime: number } | null} */
  let best = null;
  for (const dir of TRANSCRIPT_DIRS) {
    const abs = join(gitRoot, dir);
    if (!existsSync(abs)) continue;
    let names = [];
    try {
      names = readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const file = join(abs, name);
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (!best || st.mtimeMs > best.mtime) best = { path: `${dir}/${name}`, mtime: st.mtimeMs };
    }
  }
  return best ? best.path : null;
}

/**
 * @param {{ flags?: Record<string, string | boolean | string[]>, env?: NodeJS.ProcessEnv }} args
 * @param {{ gitRoot?: string | null }} where
 * @returns {{ ok: true, noRedact: boolean, refs: string[], anchor: { head: string, paths: string[] } | null, refHint: string | null } | { ok: false, error: { code: string, message: string, hint: string } }}
 */
export function writeExtras(args, where) {
  const gitRoot = where?.gitRoot || null;
  const env = args.env ?? process.env;
  /** @type {string[]} */
  const refs = [];
  for (const raw of flagList(args.flags, "ref")) {
    const parsed = parseRef(raw, gitRoot);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "usage",
          message: parsed.message,
          hint: "Pass an https URL or a repo-relative path. file:// and paths outside the repo are rejected. Mental never fetches a ref.",
        },
      };
    }
    refs.push(parsed.ref);
  }
  const anchor = gitAnchor(gitRoot, { env });
  const refHint = refs.length ? null : suggestTranscriptRef(gitRoot);
  return {
    ok: true,
    noRedact: args.flags?.["no-redact"] === true,
    refs,
    anchor,
    refHint,
  };
}
