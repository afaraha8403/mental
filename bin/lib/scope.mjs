/**
 * Project scope for `list` / `search`: the active bundle by default,
 * `--project <id|name>` for one other project, `--all-projects` for every binding.
 */
import { loadBindings } from "./bindings.mjs";
import { catalogRoot } from "./heartbeat.mjs";
import { pulseRootForBinding } from "./pulse.mjs";

/**
 * @typedef {{ id: string | null, name: string | null, root: string | null }} ScopeTarget
 */

/**
 * @param {Record<string, unknown> | undefined} flags
 * @param {{ data: any }} resolved resolveBundle result (ok)
 * @param {string | null} home
 * @returns {{ ok: true, targets: ScopeTarget[], scope: "current" | "project" | "all" } | { ok: false, error: { code: string, message: string } }}
 */
export function resolveScope(flags, resolved, home) {
  const projectFlag = typeof flags?.project === "string" ? flags.project.trim() : "";
  const all = flags?.["all-projects"] === true;
  if (flags?.project === true) {
    return { ok: false, error: { code: "usage", message: "--project requires a project id or name" } };
  }
  if (all && projectFlag) {
    return { ok: false, error: { code: "usage", message: "--all-projects cannot be combined with --project" } };
  }
  /** @type {ScopeTarget} */
  const current = {
    id: resolved.data.id ?? null,
    name: resolved.data.name ?? null,
    root: catalogRoot(resolved.data),
  };
  if (!all && !projectFlag) return { ok: true, targets: [current], scope: "current" };

  /** @type {Array<{ id: string, name?: string, store?: string, paths?: string[] }>} */
  let bindings = [];
  try {
    bindings = home ? loadBindings(home).bindings : [];
  } catch {
    bindings = [];
  }
  const toTarget = (b) => ({
    id: b.id,
    name: String(b.name || b.id),
    root: pulseRootForBinding(home, b),
  });

  if (projectFlag) {
    const needle = projectFlag.toLowerCase();
    let hits = bindings.filter((b) => b.id.toLowerCase() === needle);
    if (hits.length === 0) hits = bindings.filter((b) => String(b.name || "").toLowerCase() === needle);
    if (hits.length === 0) hits = bindings.filter((b) => b.id.toLowerCase().startsWith(needle));
    if (hits.length === 0) {
      return { ok: false, error: { code: "not-found", message: `no project matches ${projectFlag}` } };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        error: {
          code: "usage",
          message: `--project ${projectFlag} is ambiguous: ${hits.map((h) => h.id).join(", ")}`,
        },
      };
    }
    return { ok: true, targets: [toTarget(hits[0])], scope: "project" };
  }

  // Current project first (it may resolve to a local store the bindings view misses), then the rest.
  /** @type {ScopeTarget[]} */
  const targets = [];
  const seen = new Set();
  if (current.root && current.id) {
    targets.push(current);
    seen.add(current.id);
  }
  for (const b of bindings) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const t = toTarget(b);
    if (t.root) targets.push(t);
  }
  return { ok: true, targets, scope: "all" };
}
