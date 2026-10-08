/**
 * `mental extract <file|-> [--apply --tag <slug>]` — residue from a meeting dump via a decision model.
 * Dry run by default. The raw text is read, classified and discarded; only the proposed lines are written, redacted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveBundle } from "../lib/resolve.mjs";
import { catalogRoot } from "../lib/heartbeat.mjs";
import { refreshIndex } from "../lib/index.mjs";
import { getJev } from "../lib/jev.mjs";
import { extractResidue, TARGET, MAX_LINES } from "../lib/extract.mjs";
import { writeAttention, writeDecision, parseTagList } from "../lib/okf.mjs";
import { printResult } from "../lib/output.mjs";
import { CMD } from "../lib/pkg.mjs";

const MAX_BYTES = 256 * 1024;

async function readInput(args) {
  const src = args.rest[0] ? String(args.rest[0]) : "";
  if (!src) return { error: "mental extract needs a text file path, or - to read stdin" };
  try {
    if (src === "-") {
      const chunks = [];
      let size = 0;
      for await (const c of process.stdin) {
        size += c.length;
        if (size > MAX_BYTES) return { error: `input is larger than ${MAX_BYTES / 1024} KB` };
        chunks.push(c);
      }
      return { text: Buffer.concat(chunks).toString("utf8") };
    }
    const abs = resolve(args.cwd ?? process.cwd(), src);
    const buf = readFileSync(abs);
    if (buf.length > MAX_BYTES) return { error: `input is larger than ${MAX_BYTES / 1024} KB` };
    return { text: buf.toString("utf8") };
  } catch (err) {
    return { error: `cannot read ${src}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function cmdExtract(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = args.env ?? process.env;
  const apply = args.flags?.apply === true;

  let tags;
  if (apply) {
    const raw = typeof args.flags?.tag === "string" ? args.flags.tag : "";
    const parsed = raw ? parseTagList(raw) : { ok: false, message: "--apply needs --tag (1–3 topic slugs)" };
    if (!parsed.ok) {
      printResult(stdout, args, false, undefined, { code: "usage", message: parsed.message });
      return 1;
    }
    tags = parsed.tags;
  }

  const input = await readInput(args);
  if (input.error) {
    printResult(stdout, args, false, undefined, { code: "usage", message: input.error });
    return 1;
  }

  const jev = getJev(home, env);
  if (!jev) {
    printResult(stdout, args, false, undefined, {
      code: "jev-off",
      message: "extract needs a decision model, which is optional and not configured.",
      hint: `Set a key with: ${CMD} option decide key <KEY> --provider typesafe|openai|cloudflare, then retry.`,
    });
    return 1;
  }
  const resolved = resolveBundle({ cwd: args.cwd ?? process.cwd(), home, env, dir: args.dir ?? null, write: apply });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  if (resolved.data.mode === "personal" && !jev.personal) {
    printResult(stdout, args, false, undefined, {
      code: "personal-slice",
      message: "extract does not send personal-slice content to a model (personal is off).",
      hint: `Run it from a project bundle, or allow it with: ${CMD} option decide personal on`,
    });
    return 1;
  }
  const root = catalogRoot(resolved.data);
  if (!root) {
    printResult(stdout, args, false, undefined, { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" });
    return 1;
  }

  const r = await extractResidue({ jev, text: input.text });
  const written = [];
  if (apply && r.ok) {
    for (const p of r.proposals) {
      const t = TARGET[p.kind];
      try {
        const w = t.type === "decision"
          ? writeDecision(root, { title: p.title, status: "open", body: p.text, tags, via: "cli" })
          : writeAttention(root, { title: p.title, status: "open", kind: t.kind, from: "meeting notes", body: p.text, tags, via: "cli" });
        written.push({ ...p, path: w.path });
      } catch (err) {
        if (/** @type {{ code?: string }} */ (err).code !== "exists") throw err;
      }
    }
  }
  const indexed = written.length > 0 ? refreshIndex(resolved.data, home, env) : undefined;

  printResult(stdout, args, true, { ...resolved.data, apply, ...r, written, indexed, jevReason: r.reason }, undefined, (d) => {
    if (!d.ok) return `no suggestions (decision model unavailable: ${d.jevReason})`;
    if (d.proposals.length === 0) return `nothing worth keeping in ${d.considered} line(s).`;
    const lines = d.proposals.map((p) => {
      const done = d.written.find((w) => w.text === p.text);
      return `${done ? "wrote " : p.kind.padEnd(8)} ${p.title}${done ? ` (${done.path})` : ""} ${Math.round(p.confidence * 100)}%`;
    });
    const cut = d.lines > d.considered ? ` Only the first ${MAX_LINES} of ${d.lines} lines were read.` : "";
    lines.push(`${d.proposals.length} kept of ${d.considered} line(s); the rest were facts or noise.${cut}`);
    if (!d.apply) lines.push("dry run. Add --apply --tag <slug> to write them. The raw text is never stored.");
    return lines.join("\n");
  });
  return 0;
}
