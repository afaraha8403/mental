/**
 * One project's continuity, packed for a teammate. Never personal files, hours, or keys.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { BACKUP_MANIFEST, BACKUP_VERSION } from "./backup.mjs";
import { loadBindings, projectSliceDir, isPortableSliceId, userMentalDir } from "./bindings.mjs";
import { canonicalPath, findGitRoot, isInsideDir, normalizeOrigin } from "./git.mjs";
import { listOpenAttention, listOpenDecisions, listPackedOkfFiles, latestJournalHandoff, mergeOkfTree } from "./okf.mjs";
import { assertExportOutPath } from "./time.mjs";
import { STRONG_SECRET, redactText } from "./redact.mjs";
import { writeAtomic } from "./atomic.mjs";

export { BACKUP_MANIFEST };

/**
 * @param {string} root
 * @param {string} name
 */
function coverMarkdown(root, name) {
  const handoff = latestJournalHandoff(root);
  const decisions = listOpenDecisions(root);
  const attention = listOpenAttention(root);
  const lines = [
    `# Handoff — ${name}`,
    "",
    "Readable without Mental. Import with `mental import <this-folder>`.",
    "",
    `Resume: ${handoff.resume || "(none)"}`,
    `Last: ${handoff.outcome || "(none)"}`,
  ];
  if (decisions.length) {
    lines.push("", "## Open decisions");
    for (const d of decisions) lines.push(`- ${d.title} (${d.path})`);
  }
  if (attention.length) {
    lines.push("", "## In the air");
    for (const a of attention) lines.push(`- [${a.kind || a.status}] ${a.title} (${a.path})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/**
 * @param {Map<string, string>} files
 * @param {{ since?: string | null, noJournal?: boolean }} opts
 */
function filterShareFiles(files, { since = null, noJournal = false } = {}) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const day = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null;
  for (const [rel, abs] of files) {
    if (rel === "time.sqlite" || rel.endsWith("/time.sqlite")) continue;
    if (rel.startsWith("journal/") && noJournal) continue;
    if (rel.startsWith("journal/") && day) {
      const name = rel.split("/").pop() || "";
      const fileDay = name.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fileDay) && fileDay < day) continue;
    }
    out.set(rel, abs);
  }
  return out;
}

/**
 * @param {Map<string, string>} files
 * @returns {{ ok: true } | { ok: false, kinds: string[] }}
 */
function secretScan(files) {
  /** @type {string[]} */
  const kinds = [];
  for (const abs of files.values()) {
    let text = "";
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (STRONG_SECRET.test(text)) {
      const { kinds: found } = redactText(text);
      for (const k of found) if (!kinds.includes(k)) kinds.push(k);
      if (!kinds.length) kinds.push("secret");
    }
  }
  return kinds.length ? { ok: false, kinds } : { ok: true };
}

/**
 * @param {{
 *   home: string,
 *   id: string,
 *   out: string,
 *   cwd: string,
 *   env?: NodeJS.ProcessEnv,
 *   since?: string | null,
 *   noJournal?: boolean,
 *   allowSecrets?: boolean,
 *   now?: Date,
 * }} opts
 */
export function packProject({ home, id, out, cwd, env = process.env, since = null, noJournal = false, allowSecrets = false, now = new Date() }) {
  if (!home) return { ok: false, error: { code: "no-home", message: "HOME is unset; Mental will not write." } };
  if (!isPortableSliceId(id)) {
    return { ok: false, error: { code: "usage", message: "mental handoff --share needs a project binding" } };
  }
  const gitRoot = findGitRoot(cwd, { env });
  const gated = assertExportOutPath(out, {
    cwd,
    gitRoot,
    emptyMessage: "--share requires a directory outside the git worktree",
    insideMessage: "--share must be outside the git worktree",
  });
  if (!gated.ok) return gated;
  const dest = gated.abs;
  const store = canonicalPath(userMentalDir(home));
  if (dest === store || isInsideDir(store, dest)) {
    return { ok: false, error: { code: "usage", message: "--share must not write into ~/.mental" } };
  }
  const bindings = loadBindings(home);
  const binding = bindings.bindings.find((b) => b.id === id);
  if (!binding) return { ok: false, error: { code: "not-found", message: `no binding ${id}` } };
  const root = projectSliceDir(home, id);
  const files = filterShareFiles(listPackedOkfFiles(root), { since, noJournal });
  const secrets = secretScan(files);
  if (!secrets.ok && !allowSecrets) {
    return {
      ok: false,
      error: {
        code: "secrets",
        message: `refusing to share: credential-shaped text (${secrets.kinds.join(", ")}). Pass --allow-secrets to write it anyway.`,
      },
    };
  }
  if (existsSync(dest)) {
    let names = [];
    try {
      names = readdirSync(dest);
    } catch {
      names = [];
    }
    const hasManifest = existsSync(join(dest, BACKUP_MANIFEST));
    if (names.length > 0 && !hasManifest) {
      return { ok: false, error: { code: "usage", message: "--share directory is not empty and is not a Mental share" } };
    }
    if (hasManifest) rmSync(join(dest, "slices"), { recursive: true, force: true });
  }
  mkdirSync(join(dest, "slices", id), { recursive: true });
  for (const [rel, abs] of files) {
    const target = join(dest, "slices", id, ...rel.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeAtomic(target, readFileSync(abs));
  }
  const name = binding.name || id;
  writeAtomic(join(dest, "HANDOFF.md"), coverMarkdown(root, name));
  const manifest = {
    version: BACKUP_VERSION,
    kind: "share",
    packedAt: now.toISOString(),
    personal: false,
    slices: [{ id, name, origins: Array.isArray(binding.origins) ? [...binding.origins] : [] }],
  };
  writeAtomic(join(dest, BACKUP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    ok: true,
    data: {
      out: dest,
      id,
      files: files.size,
      personal: false,
      secrets: secrets.ok ? [] : secrets.kinds,
    },
  };
}

/**
 * Merge a share into the binding whose origin matches. The teammate keeps their own UUID.
 * @param {{ home: string, from: string, cwd: string, allowSecrets?: boolean, env?: NodeJS.ProcessEnv }} opts
 */
export function importShare({ home, from, cwd, allowSecrets = false, env = process.env }) {
  if (!home) return { ok: false, error: { code: "no-home", message: "HOME is unset; Mental will not write." } };
  if (!from || !String(from).trim()) {
    return { ok: false, error: { code: "usage", message: "mental import requires a share directory" } };
  }
  const abs = canonicalPath(resolvePath(cwd, from));
  const manifestPath = join(abs, BACKUP_MANIFEST);
  if (!existsSync(manifestPath)) {
    return { ok: false, error: { code: "usage", message: `not a Mental share (missing ${BACKUP_MANIFEST})` } };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, error: { code: "usage", message: `corrupt ${BACKUP_MANIFEST}` } };
  }
  const slices = Array.isArray(manifest.slices) ? manifest.slices : [];
  if (manifest.personal) {
    return { ok: false, error: { code: "usage", message: "a share must not include the personal slice" } };
  }
  if (slices.length !== 1) {
    return { ok: false, error: { code: "usage", message: "a share contains exactly one project" } };
  }
  const slice = slices[0];
  const origins = (slice.origins || []).map((o) => normalizeOrigin(o)).filter(Boolean);
  const bindings = loadBindings(home);
  const dest = bindings.bindings.find((b) =>
    (b.origins || []).some((o) => origins.includes(normalizeOrigin(o))),
  );
  if (!dest) {
    return {
      ok: false,
      error: {
        code: "not-found",
        message: "no binding matches this share's git origin",
        hint: "Run mental from that repo so it links, or mental link, then import again.",
      },
    };
  }
  const packRoot = join(abs, "slices", slice.id);
  const packFiles = listPackedOkfFiles(packRoot);
  for (const rel of packFiles.keys()) {
    if (rel.includes("time.sqlite") || rel.startsWith("personal/")) {
      return { ok: false, error: { code: "usage", message: "share contains hours or personal files" } };
    }
  }
  const secrets = secretScan(packFiles);
  if (!secrets.ok && !allowSecrets) {
    return {
      ok: false,
      error: {
        code: "secrets",
        message: `refusing to import: credential-shaped text (${secrets.kinds.join(", ")}). Pass --allow-secrets to merge it anyway.`,
      },
    };
  }
  const destRoot = projectSliceDir(home, dest.id);
  const merged = mergeOkfTree(destRoot, packFiles, { viaImport: slice.name || "share" });
  return {
    ok: true,
    data: {
      id: dest.id,
      from: slice.id,
      wrote: merged.wrote.length,
      kept: merged.kept.length,
      journalMerged: merged.journalMerged.length,
      personal: false,
    },
  };
}
