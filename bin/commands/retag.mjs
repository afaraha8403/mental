/**
 * `mental retag [path] [--apply] [--limit N]` — Jev-suggested topic tags for untagged files.
 * Dry run by default. `--apply` adds one tag to each file that has none; it never edits existing tags.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { listConcepts, refreshIndex } from "../lib/index.mjs";
import { getJev } from "../lib/jev.mjs";
import { proposeTags, applyTag, DEFAULT_LIMIT } from "../lib/retag.mjs";
import { printResult } from "../lib/output.mjs";
import { CMD } from "../lib/pkg.mjs";

export async function cmdRetag(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const apply = args.flags?.apply === true;
  const rawLimit = args.flags?.limit;
  const limit = rawLimit == null ? DEFAULT_LIMIT : Number.parseInt(String(rawLimit), 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    printResult(stdout, args, false, undefined, { code: "usage", message: "--limit must be an integer from 1 to 500" });
    return 1;
  }

  const jev = getJev(home, env);
  if (!jev) {
    printResult(stdout, args, false, undefined, {
      code: "jev-off",
      message: "retag needs Jev, which is optional and not configured.",
      hint: `Set a key with: ${CMD} option jev key <KEY> (or env MENTAL_JEV_KEY), then retry. Key: https://typesafe.ai`,
    });
    return 1;
  }
  const resolved = resolveBundle({ cwd: args.cwd ?? process.cwd(), home, env, dir: args.dir ?? null, write: apply });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  if (resolved.data.mode === "personal") {
    printResult(stdout, args, false, undefined, {
      code: "personal-slice",
      message: "retag does not send personal-slice content to a model.",
      hint: "Run it from a project bundle.",
    });
    return 1;
  }
  const root = catalogRoot(resolved.data);
  if (!root) {
    printResult(stdout, args, false, undefined, { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });
    return 1;
  }

  const given = args.rest[0] ? String(args.rest[0]).trim() : "";
  let path;
  if (given) {
    const hit = listConcepts(root).find((c) => c.path === given || c.path === `${given}.md`);
    if (!hit) {
      printResult(stdout, args, false, undefined, { code: "not-found", message: `not found: ${given}` });
      return 1;
    }
    path = hit.path;
  }

  const r = await proposeTags({ jev, root, path, limit });
  const byPath = new Map(listConcepts(root).map((c) => [c.path, c]));
  let applied = 0;
  if (apply) {
    for (const p of r.proposals) {
      const c = byPath.get(p.path);
      if (c && applyTag(c.abs, p.tag)) applied++;
    }
  }
  const indexed = applied > 0 ? refreshIndex(resolved.data, home, env) : undefined;

  printResult(stdout, args, true, { ...resolved.data, apply, ...r, applied, indexed, jevReason: r.reason }, undefined, (d) => {
    const lines = [];
    const vocab = [...d.vocab.existing, ...d.vocab.bootstrap.map((t) => `${t}*`)];
    if (vocab.length === 0) {
      return `no topic vocabulary yet: need a tag on ${2}+ files or a title word shared by 3+ files.`;
    }
    for (const p of d.proposals) {
      lines.push(`${d.apply ? "tagged" : "tag   "} ${p.tag}${p.isNew ? "*" : " "} ${p.title} (${p.path}) ${Math.round(p.confidence * 100)}%`);
    }
    if (lines.length === 0) {
      lines.push(d.jevReason ? `no suggestions (jev unavailable: ${d.jevReason})` : `no confident suggestions for ${d.untagged} untagged file(s)`);
    } else {
      lines.push(`${d.proposals.length} of ${d.untagged} untagged file(s). * = new topic from frequent title words. Vocabulary: ${vocab.join(", ")}`);
      if (!d.apply) lines.push("dry run. Add --apply to write the tags.");
    }
    return lines.join("\n");
  });
  return 0;
}
