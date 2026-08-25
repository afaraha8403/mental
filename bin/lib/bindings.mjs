/**
 * UUID bindings: identity survives path change. Origin is a hint, not the id.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeOrigin } from "./git.mjs";

export const BINDINGS_VERSION = 1;

/**
 * @param {string} home
 */
export function userMentalDir(home) {
  return join(home, ".mental");
}

/**
 * @param {string} home
 */
export function bindingsPath(home) {
  return join(userMentalDir(home), "bindings.json");
}

/**
 * @param {string} home
 * @param {string} id
 */
export function projectSliceDir(home, id) {
  return join(userMentalDir(home), "projects", id);
}

/**
 * @param {string} home
 * @returns {{ version: number, bindings: Array<{
 *   id: string,
 *   name: string,
 *   origins: string[],
 *   paths: string[],
 *   updatedAt: string,
 * }> }}
 */
export function loadBindings(home) {
  const file = bindingsPath(home);
  if (!existsSync(file)) {
    return { version: BINDINGS_VERSION, bindings: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Corrupt bindings file: ${file}`);
  }
  if (!parsed || parsed.version !== BINDINGS_VERSION || !Array.isArray(parsed.bindings)) {
    throw new Error(`Unsupported bindings.json in ${file}`);
  }
  return parsed;
}

/**
 * @param {string} home
 * @param {{ version: number, bindings: object[] }} data
 */
export function saveBindings(home, data) {
  const file = bindingsPath(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Record that leftover `./.mental` was copied into this project's home slice.
 * @param {string} home
 * @param {string} id
 * @param {string} from
 * @param {{ copied?: string[], now?: string }} [opts]
 */
export function recordLegacyImport(home, id, from, { copied = [], now = nowIso() } = {}) {
  const data = loadBindings(home);
  const binding = data.bindings.find((b) => b.id === id);
  if (!binding) return false;
  const abs = resolve(from);
  let changed = false;
  if (binding.legacyImportedFrom !== abs) {
    binding.legacyImportedFrom = abs;
    changed = true;
  }
  if (copied.length > 0 || !binding.legacyImportedAt) {
    binding.legacyImportedAt = now;
    changed = true;
  }
  if (changed) {
    binding.updatedAt = now;
    saveBindings(home, data);
  }
  return changed;
}

/**
 * @param {string} home
 * @param {string} id
 * @param {"home" | "local"} store
 */
export function setBindingStore(home, id, store) {
  const data = loadBindings(home);
  const binding = data.bindings.find((b) => b.id === id);
  if (!binding) return false;
  if (binding.store === store) return false;
  binding.store = store;
  binding.updatedAt = nowIso();
  saveBindings(home, data);
  return true;
}

/**
 * Read optional `.mental-id` (uuid only) from a directory.
 * @param {string} dir
 * @returns {string | null}
 */
export function readMentalId(dir) {
  const file = join(dir, ".mental-id");
  if (!existsSync(file)) return null;
  const id = readFileSync(file, "utf8").trim();
  return id || null;
}

/**
 * Write `.mental-id` at git root. Callers must not commit it (doctor ignore).
 * @param {string} dir
 * @param {string} id
 */
export function writeMentalId(dir, id) {
  writeFileSync(join(dir, ".mental-id"), `${id}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function matchesPath(binding, absPath) {
  const want = resolve(absPath);
  return (binding.paths || []).some((p) => resolve(p) === want);
}

/**
 * Resolve (and possibly create) a UUID binding for a git worktree.
 *
 * @param {{
 *   gitRoot: string,
 *   origin?: string | null,
 *   upstream?: string | null,
 *   home: string,
 *   write?: boolean,
 *   now?: string,
 *   newId?: () => string,
 * }} opts
 * @returns {{
 *   ok: true,
 *   id: string,
 *   created: boolean,
 *   reason: string,
 *   binding: object,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 *   fromId?: string,
 * }}
 */
export function resolveOrCreateBinding({
  gitRoot,
  origin = null,
  upstream = null,
  home,
  write = true,
  now = nowIso(),
  newId = () => randomUUID(),
}) {
  const data = loadBindings(home);
  const bindings = data.bindings;
  const absRoot = resolve(gitRoot);
  const originN = normalizeOrigin(origin);
  const upstreamN = normalizeOrigin(upstream);
  const mentalId = readMentalId(absRoot);

  const byId = (id) => bindings.find((b) => b.id === id);

  if (mentalId) {
    const hit = byId(mentalId);
    if (hit) {
      const changed = appendHints(hit, { origin: originN, path: absRoot, now });
      if (write && changed) saveBindings(home, data);
      return { ok: true, id: hit.id, created: false, reason: "matched .mental-id", binding: hit };
    }
    // Stale .mental-id that matches nothing: fall through rather than inventing
    // a binding for a dead uuid (user can remap). Continue other heuristics.
  }

  if (originN) {
    const hits = bindings.filter((b) => (b.origins || []).includes(originN));
    const here = hits.filter((b) => matchesPath(b, absRoot));
    if (hits.length > 1 && here.length !== 1) {
      return {
        ok: false,
        code: "ambiguous-origin",
        message: `Multiple bindings share origin ${originN}. Run mental remap --to <id>.`,
      };
    }
    if (here.length === 1 || hits.length === 1) {
      const hit = here[0] || hits[0];
      const changed = appendHints(hit, { origin: originN, path: absRoot, now });
      const reclaimed = reclaimPath(data, hit.id, absRoot, now);
      if (write && (changed || reclaimed)) saveBindings(home, data);
      return {
        ok: true,
        id: hit.id,
        created: false,
        reason: here.length === 1 ? `matched origin ${originN} at path` : `matched origin ${originN}`,
        binding: hit,
      };
    }
  }

  const pathHits = bindings.filter((b) => matchesPath(b, absRoot));
  if (pathHits.length > 1) {
    return {
      ok: false,
      code: "ambiguous-path",
      message: `Multiple bindings share path ${absRoot}. Run mental remap.`,
    };
  }
  if (pathHits.length === 1) {
    const hit = pathHits[0];
    const changed = appendHints(hit, { origin: originN, path: absRoot, now });
    if (write && changed) saveBindings(home, data);
    return {
      ok: true,
      id: hit.id,
      created: false,
      reason: "matched path",
      binding: hit,
    };
  }

  // Fork heuristic: new origin, but upstream matches an existing origin.
  if (originN && upstreamN && originN !== upstreamN) {
    const upHits = bindings.filter((b) => (b.origins || []).includes(upstreamN));
    if (upHits.length === 1) {
      return {
        ok: false,
        code: "fork",
        message: `Origin ${originN} looks like a fork of ${upHits[0].name} (${upHits[0].id}). Run mental remap --from ${upHits[0].id} or mental split.`,
        fromId: upHits[0].id,
      };
    }
  }

  if (!write) {
    return {
      ok: true,
      id: null,
      created: false,
      reason: "no binding yet (read-only)",
      binding: null,
    };
  }

  const id = newId();
  const name = absRoot.split(/[/\\]/).filter(Boolean).pop() || id;
  const binding = {
    id,
    name,
    origins: originN ? [originN] : [],
    paths: [absRoot],
    updatedAt: now,
  };
  bindings.push(binding);
  saveBindings(home, data);
  // Do not write `.mental-id` here: `where` must not drop files into a
  // worktree that may be public. Identity lives in bindings.json; remap
  // (phase 5) may write the optional hint after ignore is in place.
  return {
    ok: true,
    id,
    created: true,
    reason: originN ? `new binding for ${originN}` : "new binding for path",
    binding,
  };
}

/**
 * When origin later matches an existing binding, drop this path from other
 * bindings (git-init-by-path orphan) so identity merges instead of forking.
 * @returns {boolean} whether anything changed
 */
function reclaimPath(data, keepId, absPath, now) {
  const want = resolve(absPath);
  let changed = false;
  data.bindings = data.bindings.filter((b) => {
    if (b.id === keepId) return true;
    const before = (b.paths || []).length;
    b.paths = (b.paths || []).filter((p) => resolve(p) !== want);
    if (b.paths.length !== before) {
      b.updatedAt = now;
      changed = true;
    }
    if ((b.paths || []).length === 0 && (b.origins || []).length === 0) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed;
}

/**
 * @returns {boolean} whether the binding mutated
 */
function appendHints(binding, { origin, path, now }) {
  let changed = false;
  if (origin && !(binding.origins || []).includes(origin)) {
    binding.origins = [...(binding.origins || []), origin];
    changed = true;
  }
  if (path) {
    const abs = resolve(path);
    const has = (binding.paths || []).some((p) => resolve(p) === abs);
    if (!has) {
      binding.paths = [...(binding.paths || []), abs];
      changed = true;
    }
  }
  if (changed) binding.updatedAt = now;
  return changed;
}

/**
 * Drop `absPath` from every binding. Used by remap/split.
 * @returns {boolean}
 */
export function detachPath(home, absPath, { now = nowIso() } = {}) {
  const data = loadBindings(home);
  const want = resolve(absPath);
  let changed = false;
  for (const b of data.bindings) {
    const before = (b.paths || []).length;
    b.paths = (b.paths || []).filter((p) => resolve(p) !== want);
    if (b.paths.length !== before) {
      b.updatedAt = now;
      changed = true;
    }
  }
  if (changed) saveBindings(home, data);
  return changed;
}

/**
 * Point this git root at an existing UUID. Writes `.mental-id`.
 * @param {{ home: string, gitRoot: string, toId: string, origin?: string | null }} opts
 */
export function remapToBinding({ home, gitRoot, toId, origin = null, now = nowIso() }) {
  const data = loadBindings(home);
  const hit = data.bindings.find((b) => b.id === toId);
  if (!hit) {
    return { ok: false, code: "unknown-id", message: `No binding ${toId}. Run mental remap to list.` };
  }
  const abs = resolve(gitRoot);
  detachPath(home, abs, { now });
  const fresh = loadBindings(home);
  const binding = fresh.bindings.find((b) => b.id === toId);
  appendHints(binding, { origin: normalizeOrigin(origin), path: abs, now });
  saveBindings(home, fresh);
  writeMentalId(abs, toId);
  return { ok: true, id: toId, binding };
}

/**
 * This clone gets a new UUID. Other clones keep the old one.
 * @param {{ home: string, gitRoot: string, origin?: string | null, copyRoot?: string | null, newId?: () => string }} opts
 */
export function splitBinding({
  home,
  gitRoot,
  origin = null,
  now = nowIso(),
  newId = () => randomUUID(),
}) {
  const abs = resolve(gitRoot);
  const id = newId();
  const originN = normalizeOrigin(origin);
  detachPath(home, abs, { now });
  const data = loadBindings(home);
  const name = abs.split(/[/\\]/).filter(Boolean).pop() || id;
  const binding = {
    id,
    name,
    origins: originN ? [originN] : [],
    paths: [abs],
    updatedAt: now,
  };
  data.bindings.push(binding);
  saveBindings(home, data);
  writeMentalId(abs, id);
  return { ok: true, id, binding, dest: projectSliceDir(home, id) };
}
