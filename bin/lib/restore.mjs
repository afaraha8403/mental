/**
 * Restore a Mental backup into this HOME. Default is per-slice merge.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BACKUP_MANIFEST, BACKUP_VERSION } from "./backup.mjs";
import {
  adoptPortableIdentity,
  isPortableSliceId,
  loadBindings,
  projectSliceDir,
  userMentalDir,
} from "./bindings.mjs";
import { listPackedOkfFiles, mergeOkfTree, replaceOkfTree } from "./okf.mjs";
import { reindexBundle } from "./index.mjs";

/**
 * @param {{ home: string, from: string, cwd: string, replace?: boolean, confirm?: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: true, data: object } | { ok: false, error: object }}
 */
export function restoreHome({ home, from, cwd, replace = false, confirm = "", env = process.env }) {
  if (!home) {
    return { ok: false, error: { code: "no-home", message: "HOME is unset; Mental will not write." } };
  }
  if (!from || typeof from !== "string" || !from.trim()) {
    return { ok: false, error: { code: "usage", message: "mental restore requires --from <dir>" } };
  }
  if (replace && confirm !== "REPLACE") {
    return {
      ok: false,
      error: {
        code: "usage",
        message: "Refusing to replace OKF. Pass --replace --confirm REPLACE to wipe packed slices on this machine.",
      },
    };
  }
  const abs = resolve(cwd, from);
  const manifestPath = join(abs, BACKUP_MANIFEST);
  if (!existsSync(manifestPath)) {
    return { ok: false, error: { code: "usage", message: `not a Mental backup (missing ${BACKUP_MANIFEST}): ${abs}` } };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, error: { code: "usage", message: `corrupt ${BACKUP_MANIFEST}` } };
  }
  if (!manifest || manifest.version !== BACKUP_VERSION || !Array.isArray(manifest.slices)) {
    return { ok: false, error: { code: "usage", message: `unsupported backup version in ${BACKUP_MANIFEST}` } };
  }
  for (const identity of manifest.slices) {
    if (!identity?.id) continue;
    if (!isPortableSliceId(identity.id)) {
      return { ok: false, error: { code: "usage", message: `invalid slice id in ${BACKUP_MANIFEST}` } };
    }
  }

  /** @type {Array<{ id: string, action: string, destId?: string, files?: number }>} */
  const rows = [];
  /** @type {string[]} */
  const touched = [];

  for (const identity of manifest.slices) {
    if (!identity?.id) continue;
    const destBindings = loadBindings(home);
    const packRoot = join(abs, "slices", identity.id);
    const packFiles = listPackedOkfFiles(packRoot);
    const destHit = destBindings.bindings.find((b) => b.id === identity.id);
    const originClash = originClashIds(destBindings.bindings, identity.origins || [], identity.id);

    if (!destHit && originClash.length > 0) {
      adoptPortableIdentity(home, identity);
      const destRoot = projectSliceDir(home, identity.id);
      if (replace) replaceOkfTree(destRoot, packFiles);
      else mergeOkfTree(destRoot, packFiles);
      rows.push({
        id: identity.id,
        action: "skipped-ambiguous",
        destId: originClash[0],
        files: packFiles.size,
      });
      touched.push(identity.id);
      continue;
    }

    if (!destHit) {
      adoptPortableIdentity(home, identity);
      const destRoot = projectSliceDir(home, identity.id);
      mergeOkfTree(destRoot, packFiles);
      rows.push({ id: identity.id, action: "adopted", files: packFiles.size });
      touched.push(identity.id);
      continue;
    }

    const destRoot = projectSliceDir(home, identity.id);
    if (replace) {
      replaceOkfTree(destRoot, packFiles);
      rows.push({ id: identity.id, action: "replaced", files: packFiles.size });
    } else {
      mergeOkfTree(destRoot, packFiles);
      rows.push({ id: identity.id, action: "merged", files: packFiles.size });
    }
    touched.push(identity.id);
  }

  let personal = null;
  if (manifest.personal) {
    const packFiles = listPackedOkfFiles(join(abs, "personal"));
    const destRoot = userMentalDir(home);
    if (replace) replaceOkfTree(destRoot, packFiles);
    else mergeOkfTree(destRoot, packFiles);
    personal = { action: replace ? "replaced" : "merged", files: packFiles.size };
  }

  for (const id of touched) {
    try {
      reindexBundle({ root: projectSliceDir(home, id), id, home, env });
    } catch {
      // FTS is derived; restore still succeeded
    }
  }

  return {
    ok: true,
    data: {
      from: abs,
      replace: Boolean(replace),
      slices: rows,
      personal,
    },
  };
}

/**
 * @param {Array<{ id: string, origins?: string[] }>} bindings
 * @param {string[]} origins
 * @param {string} packedId
 */
function originClashIds(bindings, origins, packedId) {
  const want = new Set(origins.filter(Boolean));
  if (want.size === 0) return [];
  return bindings
    .filter((b) => b.id !== packedId && (b.origins || []).some((o) => want.has(o)))
    .map((b) => b.id);
}
