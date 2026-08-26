/**
 * Stable agent JSON envelope + human printers.
 * Emoji is TTY-only. `--json` never includes a brand mark.
 */

/**
 * `MENTAL_ASCII=1` for consoles that cannot render emoji (legacy cmd.exe).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function useAsciiBrand(env = process.env) {
  const v = env.MENTAL_ASCII;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function brandMark(env = process.env) {
  return useAsciiBrand(env) ? "[mental]" : "🧠";
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
export function kindMark(kind, env = process.env) {
  if (useAsciiBrand(env)) return KIND_ASCII[kind] || "[mental]";
  return KIND_EMOJI[kind] || brandMark(env);
}

/**
 * @param {"journal" | "attention" | "decision" | "note" | "read"} kind
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 */
export function kindLine(kind, text, env = process.env) {
  return `${kindMark(kind, env)} ${text}`;
}

/**
 * Prefix a TTY success line with the Mental mark.
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 */
export function brandLine(text, env = process.env) {
  return `${brandMark(env)} ${text}`;
}

/**
 * @param {boolean} ok
 * @param {object} [data]
 * @param {{ code: string, message: string }} [error]
 */
export function envelope(ok, data, error) {
  return ok ? { ok: true, data } : { ok: false, error };
}

/**
 * @param {NodeJS.WritableStream} out
 * @param {boolean} json
 * @param {boolean} ok
 * @param {object} [data]
 * @param {{ code: string, message: string }} [error]
 * @param {(data: object) => string} [format]
 */
export function printResult(out, json, ok, data, error, format) {
  if (json) {
    out.write(`${JSON.stringify(envelope(ok, data, error))}\n`);
    return;
  }
  if (!ok) {
    out.write(`${error?.message || "error"}\n`);
    return;
  }
  out.write(`${format ? format(data) : JSON.stringify(data, null, 2)}\n`);
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
