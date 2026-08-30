/**
 * Stable agent JSON envelope + human printers.
 * Emoji is TTY-only. `--json` never includes a brand mark.
 * Optional envelope sibling `update` (behind npm only) so agents can nag once.
 * TTY prints that hint at most once per day.
 */
import { peekUpdateNotice, takeTtyNag } from "./update.mjs";

/** POSIX usage / argparse exit. */
export const EXIT_USAGE = 2;

/**
 * no-color.org: any non-empty NO_COLOR. Also TERM=dumb, --plain, --no-color.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ plain?: boolean, flags?: Record<string, string | boolean> }} [args]
 */
export function usePlain(env = process.env, args = {}) {
  if (args.plain || args.flags?.plain || args.flags?.["no-color"]) return true;
  const nc = env.NO_COLOR;
  if (nc != null && String(nc) !== "") return true;
  if (env.TERM === "dumb") return true;
  return false;
}

/**
 * `MENTAL_ASCII=1` for consoles that cannot render emoji (legacy cmd.exe).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ plain?: boolean, flags?: Record<string, string | boolean> }} [args]
 */
export function useAsciiBrand(env = process.env, args = {}) {
  if (usePlain(env, args)) return true;
  const v = env.MENTAL_ASCII;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ plain?: boolean, flags?: Record<string, string | boolean> }} [args]
 */
export function brandMark(env = process.env, args = {}) {
  return useAsciiBrand(env, args) ? "[mental]" : "🧠";
}

const KIND_EMOJI = {
  journal: "📓",
  attention: "🚦",
  decision: "🎯",
  note: "📝",
  read: "🔍",
};

const KIND_ASCII = {
  journal: "[journal]",
  attention: "[attention]",
  decision: "[decision]",
  note: "[note]",
  read: "[read]",
};

/**
 * Type mark for TTY writes/reads. `--json` must not call this.
 * @param {"journal" | "attention" | "decision" | "note" | "read"} kind
 * @param {NodeJS.ProcessEnv} [env]
 */
export function kindMark(kind, env = process.env, args = {}) {
  if (useAsciiBrand(env, args)) return KIND_ASCII[kind] || "[mental]";
  return KIND_EMOJI[kind] || brandMark(env, args);
}

/**
 * @param {"journal" | "attention" | "decision" | "note" | "read"} kind
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 */
export function kindLine(kind, text, env = process.env, args = {}) {
  return `${kindMark(kind, env, args)} ${text}`;
}

/**
 * Prefix a TTY success line with the Mental mark.
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 */
export function brandLine(text, env = process.env, args = {}) {
  return `${brandMark(env, args)} ${text}`;
}

/**
 * @param {boolean} ok
 * @param {object} [data]
 * @param {{ code: string, message: string, hint?: string, retryable?: boolean }} [error]
 * @param {{ current: string, latest: string, hint: string } | null} [update]
 */
export function envelope(ok, data, error, update) {
  const body = ok ? { ok: true, data } : { ok: false, error };
  if (!ok && data != null) body.data = data;
  if (update) body.update = update;
  return body;
}

/**
 * @param {NodeJS.WritableStream} out
 * @param {{ json?: boolean, env?: NodeJS.ProcessEnv, stderr?: NodeJS.WritableStream, plain?: boolean }} args
 * @param {boolean} ok
 * @param {object} [data]
 * @param {{ code: string, message: string, hint?: string }} [error]
 * @param {(data: object) => string} [format]
 */
export function printResult(out, args, ok, data, error, format) {
  const json = Boolean(args?.json);
  const env = args?.env ?? process.env;
  const update = peekUpdateNotice({ env });
  if (json) {
    out.write(`${JSON.stringify(envelope(ok, data, error, update))}\n`);
    return;
  }
  const ttyUpdate = takeTtyNag(update, { env });
  if (!ok) {
    if (format && data) out.write(`${format(data)}\n`);
    const dest = args?.stderr ?? out;
    dest.write(`${error?.message || "error"}\n`);
    if (error?.hint) dest.write(`${error.hint}\n`);
    if (ttyUpdate?.hint) dest.write(`${brandLine(ttyUpdate.hint, env, args)}\n`);
    return;
  }
  out.write(`${format ? format(data) : JSON.stringify(data, null, 2)}\n`);
  if (ttyUpdate?.hint) out.write(`${brandLine(ttyUpdate.hint, env, args)}\n`);
}

/** @param {import('./resolve.mjs').WhereData} data */
export function formatWhere(data) {
  const id = data.id ?? "—";
  const lines = [
    `root:    ${data.root}`,
    `id:      ${id}`,
    `mode:    ${data.mode}`,
    `reason:  ${data.reason}`,
    `gitRoot: ${data.gitRoot ?? "—"}`,
  ];
  if (data.imported?.copied?.length) {
    lines.push(`imported: ${data.imported.copied.length} file(s) from ${data.imported.from}`);
  }
  if (data.indexed?.ok) {
    lines.push(`index:    ${data.indexed.concepts} concept(s) → ${data.indexed.path}`);
  }
  return lines.join("\n");
}
