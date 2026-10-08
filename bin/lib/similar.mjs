/**
 * "Similar to" hint on writes (#64). Wraps a write command; with no Jev key the handler is
 * returned untouched and stays synchronous. The write is never blocked or altered, only annotated.
 */
import { getJev } from "./jev.mjs";
import { findSimilar } from "./jev-assist.mjs";
import { resolveBundle } from "./resolve.mjs";
import { catalogRoot } from "./heartbeat.mjs";
import { cmdJournal } from "../commands/journal.mjs";
import { cmdDecide } from "../commands/decide.mjs";
import { cmdNote } from "../commands/note.mjs";
import { cmdAttention } from "../commands/attention.mjs";
import { cmdPark } from "../commands/park.mjs";

/** @param {string} kind @param {any} args */
function keyOf(kind, args) {
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
    if (!jev || !key) return handler(args, io);

    return (async () => {
      /** @type {Awaited<ReturnType<typeof findSimilar>>} */
      let similar = [];
      try {
        const resolved = resolveBundle({
          cwd: args.cwd ?? process.cwd(),
          home,
          env,
          dir: args.dir ?? null,
          write: false,
        });
        const root = resolved.ok ? catalogRoot(resolved.data) : null;
        if (root) similar = await findSimilar({ jev, root, title: key.title, body: key.body });
      } catch {
        similar = [];
      }
      if (similar.length === 0) return handler(args, io);

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
        parsed.data.similar = rows;
        out.write(`${JSON.stringify(parsed)}\n`);
      } else {
        out.write(buf);
        if (code === 0 && !args.json) {
          const lines = rows.map((s) => `  [${s.type}] ${s.title} (${s.path}) ${s.score}`);
          out.write(`similar to existing (update it instead of adding?):\n${lines.join("\n")}\n`);
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
