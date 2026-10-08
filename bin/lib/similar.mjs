/**
 * Write-time hints (#64 similar, PR 3 guards). Wraps a write command; with no decision-model key the
 * handler is returned untouched and stays synchronous. The write is never blocked or altered, only annotated.
 */
import { getJev } from "./jev.mjs";
import { findSimilar } from "./jev-assist.mjs";
import { guardTexts, writeGuards } from "./guards.mjs";
import { resolveBundle } from "./resolve.mjs";
import { catalogRoot } from "./heartbeat.mjs";
import { cmdJournal } from "../commands/journal.mjs";
import { cmdDecide } from "../commands/decide.mjs";
import { cmdNote } from "../commands/note.mjs";
import { cmdAttention } from "../commands/attention.mjs";
import { cmdPark } from "../commands/park.mjs";
import { cmdHandoff } from "../commands/handoff.mjs";

/** @param {string} kind @param {any} args */
function keyOf(kind, args) {
  if (kind === "handoff") return null; // a session summary is never a duplicate of a concept file
  const f = args.flags || {};
  if (kind !== "journal" && kind !== "note" && f.path) return null; // updating a known file
  const title = kind === "park" ? f.attention || f.title : f.title;
  return typeof title === "string" && title.trim() ? { title: title.trim(), body: typeof f.body === "string" ? f.body : "" } : null;
}

/**
 * @param {string} kind
 * @param {(args: any, io?: any) => number | Promise<number>} handler
 */
export function withSimilar(kind, handler) {
  return (args, io = {}) => {
    const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
    const env = args.env ?? process.env;
    const jev = getJev(home, env);
    const key = jev ? keyOf(kind, args) : null;
    const texts = jev ? guardTexts(kind, args.flags) : null;
    if (!jev || (!key && !texts)) return handler(args, io);

    return (async () => {
      /** @type {Awaited<ReturnType<typeof findSimilar>>} */
      let similar = [];
      /** @type {Awaited<ReturnType<typeof writeGuards>>} */
      let guard = null;
      try {
        const resolved = resolveBundle({
          cwd: args.cwd ?? process.cwd(),
          home,
          env,
          dir: args.dir ?? null,
          write: false,
        });
        // Personal-slice content stays local unless the user allowed it.
        const skip = resolved.ok && resolved.data.mode === "personal" && !jev.personal;
        const root = resolved.ok ? catalogRoot(resolved.data) : null;
        if (!skip) {
          [similar, guard] = await Promise.all([
            root && key ? findSimilar({ jev, root, title: key.title, body: key.body }).catch(() => []) : [],
            texts ? writeGuards({ jev, kind, texts }).catch(() => null) : null,
          ]);
        }
      } catch {
        similar = [];
        guard = null;
      }
      if (similar.length === 0 && !guard) return handler(args, io);

      const out = io.stdout ?? process.stdout;
      let buf = "";
      const code = await handler(args, {
        ...io,
        stdout: {
          write(chunk) {
            buf += chunk;
            return true;
          },
        },
      });
      const rows = similar.map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }));
      let parsed = null;
      if (args.json) {
        try {
          parsed = JSON.parse(buf);
        } catch {
          parsed = null;
        }
      }
      if (parsed && parsed.ok && parsed.data && typeof parsed.data === "object") {
        if (rows.length) parsed.data.similar = rows;
        if (guard) parsed.data.guard = guard;
        out.write(`${JSON.stringify(parsed)}\n`);
      } else {
        out.write(buf);
        if (code === 0 && !args.json) {
          if (rows.length) {
            const lines = rows.map((s) => `  [${s.type}] ${s.title} (${s.path}) ${s.score}`);
            out.write(`similar to existing (update it instead of adding?):\n${lines.join("\n")}\n`);
          }
          if (guard) out.write(`${guard.notes.map((n) => `note: ${n}`).join("\n")}\n`);
        }
      }
      return code;
    })();
  };
}

export const cmdJournalS = withSimilar("journal", cmdJournal);
export const cmdDecideS = withSimilar("decide", cmdDecide);
export const cmdNoteS = withSimilar("note", cmdNote);
export const cmdAttentionS = withSimilar("attention", cmdAttention);
export const cmdParkS = withSimilar("park", cmdPark);
export const cmdHandoffS = withSimilar("handoff", cmdHandoff);
