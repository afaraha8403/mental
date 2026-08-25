/**
 * Stable agent JSON envelope + human printers.
 */

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
