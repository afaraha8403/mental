/**
 * `mental relink [path] [--apply]` — Jev-suggested links between OKF files (#65).
 * Dry run by default. `--apply` appends only high-confidence links as plain markdown.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { listConcepts, refreshIndex } from "../lib/index.mjs";
import { getJev } from "../lib/jev.mjs";
import { suggestLinks, applyLinks } from "../lib/jev-assist.mjs";
import { printResult } from "../lib/output.mjs";
import { CMD } from "../lib/pkg.mjs";

const RECENT = 5;

export async function cmdRelink(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const apply = args.flags?.apply === true;

  const jev = getJev(home, env);
  if (!jev) {
    printResult(stdout, args, false, undefined, {
      code: "jev-off",
      message: "relink needs Jev, which is optional and not configured.",
      hint: `Set a key with: ${CMD} option jev key <KEY> (or env MENTAL_JEV_KEY), then retry. Key: https://typesafe.ai`,
    });
    return 1;
  }
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home,
    env,
    dir: args.dir ?? null,
    write: apply,
  });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const root = catalogRoot(resolved.data);
  if (!root) {
    printResult(stdout, args, false, undefined, { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });
    return 1;
  }

  const given = args.rest[0] ? String(args.rest[0]).trim() : "";
  const concepts = listConcepts(root).filter((c) => c.type !== "Journal");
  const targets = given
    ? concepts.filter((c) => c.path === given || c.path === `${given}.md`)
    : [...concepts].sort((a, b) => b.mtime - a.mtime).slice(0, RECENT);
  if (targets.length === 0) {
    printResult(stdout, args, false, undefined, { code: "not-found", message: given ? `not found: ${given}` : "nothing to relink" });
    return 1;
  }

  const results = [];
  let reason;
  for (const t of targets) {
    const s = await suggestLinks({ jev, root, path: t.path });
    if (!s.ok && s.reason) reason = s.reason;
    let applied = 0;
    if (apply && s.proposed.length) applied = applyLinks(t.abs, s.proposed);
    results.push({ path: t.path, title: t.title, proposed: s.proposed, maybe: s.maybe, applied });
  }
  const applied = results.reduce((n, r) => n + r.applied, 0);
  const indexed = applied > 0 ? refreshIndex(resolved.data, home, env) : undefined;

  printResult(stdout, args, true, { ...resolved.data, apply, results, applied, indexed, jevReason: reason }, undefined, (d) => {
    const lines = [];
    for (const r of d.results) {
      if (!r.proposed.length && !r.maybe.length) continue;
      lines.push(`${r.title} (${r.path})`);
      for (const p of r.proposed) lines.push(`  ${d.apply ? "linked" : "link   "} [${p.type}] ${p.title} (${p.path}) ${Math.round(p.score * 100)}%`);
      for (const p of r.maybe) lines.push(`  maybe   [${p.type}] ${p.title} (${p.path}) ${Math.round(p.score * 100)}%`);
    }
    if (lines.length === 0) lines.push(d.jevReason ? `no suggestions (jev unavailable: ${d.jevReason})` : "no link suggestions");
    else if (!d.apply) lines.push(`dry run. Add --apply to write the "link" rows into the files.`);
    return lines.join("\n");
  });
  return 0;
}
