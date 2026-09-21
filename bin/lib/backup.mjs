/**
 * Whole-home OKF backup. Portable directory; identities without machine paths.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalPath, findGitRoot, isInsideDir } from "./git.mjs";
import { loadBindings, projectSliceDir, userMentalDir, isPortableSliceId } from "./bindings.mjs";
import { listPackedOkfFiles } from "./okf.mjs";
import { assertExportOutPath } from "./time.mjs";

export const BACKUP_VERSION = 1;
export const BACKUP_MANIFEST = "backup.json";

/**
 * @param {{ home: string, out: string, cwd: string, env?: NodeJS.ProcessEnv, now?: Date }} opts
 * @returns {{ ok: true, data: object } | { ok: false, error: object }}
 */
export function packHome({ home, out, cwd, env = process.env, now = new Date() }) {
  if (!home) {
    return { ok: false, error: { code: "no-home", message: "HOME is unset; Mental will not write." } };
  }
  const gitRoot = findGitRoot(cwd, { env });
  const gated = assertExportOutPath(out, {
    cwd,
    gitRoot,
    emptyMessage: "mental backup requires --out <dir> outside the git worktree",
    insideMessage: "--out must be outside the git worktree",
  });
  if (!gated.ok) return gated;
  const dest = gated.abs;
  const store = canonicalPath(userMentalDir(home));
  if (dest === store || isInsideDir(store, dest)) {
    return {
      ok: false,
      error: { code: "usage", message: "--out must not write into ~/.mental" },
    };
  }

  const data = loadBindings(home);
  const personalFiles = listPackedOkfFiles(store);
  if (data.bindings.length === 0 && personalFiles.size === 0) {
    return { ok: false, error: { code: "usage", message: "nothing to backup (empty Mental home)" } };
  }

  if (existsSync(dest)) {
    let names = [];
    try {
      names = readdirSync(dest);
    } catch {
      names = [];
    }
    const destHasManifest = existsSync(join(dest, BACKUP_MANIFEST));
    if (names.length > 0 && !destHasManifest) {
      return {
        ok: false,
        error: { code: "usage", message: "--out is not empty and is not a Mental backup (missing backup.json)" },
      };
    }
    if (destHasManifest) {
      rmSync(join(dest, "slices"), { recursive: true, force: true });
      rmSync(join(dest, "personal"), { recursive: true, force: true });
    }
  }
  mkdirSync(dest, { recursive: true });

  /** @type {Array<{ id: string, name: string, origins: string[], files: number }>} */
  const slices = [];
  for (const b of data.bindings) {
    if (!isPortableSliceId(b.id)) continue;
    const root = projectSliceDir(home, b.id);
    const files = listPackedOkfFiles(root);
    const sliceDir = join(dest, "slices", b.id);
    mkdirSync(sliceDir, { recursive: true });
    copyMap(files, sliceDir);
    slices.push({
      id: b.id,
      name: b.name || b.id,
      origins: Array.isArray(b.origins) ? [...b.origins] : [],
      files: files.size,
    });
  }

  let personal = false;
  if (personalFiles.size > 0) {
    const personalDir = join(dest, "personal");
    mkdirSync(personalDir, { recursive: true });
    copyMap(personalFiles, personalDir);
    personal = true;
  }

  const manifest = {
    version: BACKUP_VERSION,
    packedAt: now.toISOString(),
    personal,
    slices: slices.map(({ id, name, origins }) => ({ id, name, origins })),
  };
  writeFileSync(join(dest, BACKUP_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    ok: true,
    data: {
      out: dest,
      personal,
      slices: slices.map(({ id, files }) => ({ id, files })),
    },
  };
}

/**
 * @param {Map<string, string>} files
 * @param {string} destRoot
 */
function copyMap(files, destRoot) {
  for (const [rel, abs] of files) {
    const dest = join(destRoot, ...rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(abs, dest);
  }
}
