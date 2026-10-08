/**
 * Move one OKF concept file from one project bundle to another, byte for byte,
 * so the frontmatter timestamp and body survive. Source is removed only after
 * the destination is written.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { ensureSkeleton, bundleName } from "./okf.mjs";
import { extractLinks, listBacklinks } from "./index.mjs";

/** Concepts that stand alone. Journal hops and status are session-shaped and do not move. */
export const MOVABLE_DIRS = new Set(["attention", "decisions", "notes"]);

function usage(message) {
  return { ok: false, error: { code: "usage", message } };
}

/**
 * @param {string} src bundle-relative source path
 * @returns {{ ok: true, rel: string } | { ok: false, error: { code: string, message: string } }}
 */
export function movablePath(src) {
  const rel = String(src || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!rel) return usage("mental move requires a bundle-relative path");
  if (rel.includes("#")) return usage("mental move takes a whole file, not a journal section");
  const parts = rel.split("/");
  if (parts.length !== 2 || parts.some((p) => !p || p === "." || p === ".." || p.includes("\0"))) {
    return usage("path must look like attention/<file>.md, decisions/<file>.md or notes/<file>.md");
  }
  if (!MOVABLE_DIRS.has(parts[0])) {
    return usage(`only ${[...MOVABLE_DIRS].join(", ")} files can move (got ${parts[0]}/)`);
  }
  if (!rel.endsWith(".md")) return usage("path must be a .md file");
  return { ok: true, rel };
}

/**
 * @param {string} destRoot
 * @param {string} rel
 */
function uniqueDest(destRoot, rel) {
  if (!existsSync(join(destRoot, rel))) return rel;
  const dot = rel.lastIndexOf(".");
  const stem = rel.slice(0, dot);
  const ext = rel.slice(dot);
  for (let n = 2; n < 1000; n++) {
    const next = `${stem}-${n}${ext}`;
    if (!existsSync(join(destRoot, next))) return next;
  }
  throw Object.assign(new Error(`no free filename for ${rel} in the target project`), { code: "exists" });
}

/**
 * @param {{
 *   srcRoot: string,
 *   srcId?: string | null,
 *   destRoot: string,
 *   destName?: string | null,
 *   destId?: string | null,
 *   rel: string,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 * @returns {{ ok: true, data: { from: string, to: string, renamed: boolean, danglingBacklinks: Array<{ path: string, type: string, title: string }>, outboundLinks: string[] } } | { ok: false, error: { code: string, message: string } }}
 */
export function moveConcept({ srcRoot, srcId = null, destRoot, destName = null, destId = null, rel, home = null, env = process.env }) {
  const picked = movablePath(rel);
  if (!picked.ok) return picked;
  if (resolvePath(srcRoot) === resolvePath(destRoot)) {
    return usage("source and target are the same project");
  }
  const srcAbs = join(srcRoot, picked.rel);
  if (!existsSync(srcAbs)) {
    return { ok: false, error: { code: "not-found", message: `no such file: ${picked.rel}` } };
  }
  const text = readFileSync(srcAbs, "utf8");

  const backlinks = (() => {
    try {
      return listBacklinks({ root: srcRoot, path: picked.rel, id: srcId, home, env });
    } catch {
      return [];
    }
  })();
  const outboundLinks = [...new Set(extractLinks(picked.rel, text).map((l) => l.dest))].filter((d) =>
    existsSync(join(srcRoot, d)),
  );

  ensureSkeleton(destRoot, { name: bundleName(destRoot, destName || destId || "project") });
  let toRel;
  try {
    toRel = uniqueDest(destRoot, picked.rel);
  } catch (err) {
    return { ok: false, error: { code: /** @type {any} */ (err).code || "exists", message: String(err.message) } };
  }
  const destAbs = join(destRoot, toRel);
  mkdirSync(dirname(destAbs), { recursive: true });
  writeFileSync(destAbs, text);
  unlinkSync(srcAbs);

  return {
    ok: true,
    data: {
      from: picked.rel,
      to: toRel,
      renamed: toRel !== picked.rel,
      danglingBacklinks: backlinks,
      outboundLinks,
    },
  };
}
