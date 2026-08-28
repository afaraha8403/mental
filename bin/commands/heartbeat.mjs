/**
 * `mental` with no args on a TTY, or `mental heartbeat` — print the pulse and exit.
 * Agents: `mental heartbeat --json`.
 */
import { collectHeartbeat, formatHeartbeat, HEARTBEAT_JSON_FIELDS } from "../lib/heartbeat.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

const FOOTER = "more · mental doctor · mental search · mental --help";
const FIELDS_HINT = `Legal --fields: ${HEARTBEAT_JSON_FIELDS.join(", ")}`;

/**
 * @param {{ json: boolean, dir?: string, cwd?: string, home?: string, env?: NodeJS.ProcessEnv, flags?: Record<string, string | boolean>, plain?: boolean }} args
 * @returns {number}
 */
export function cmdHeartbeat(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const fieldsFlag = args.flags?.fields;
  if (fieldsFlag === true) {
    const data = { fields: HEARTBEAT_JSON_FIELDS };
    printResult(stdout, args, true, data, undefined, () => FIELDS_HINT);
    return 0;
  }

  const collected = collectHeartbeat(args);
  if (!collected.ok) {
    printResult(stdout, args, false, undefined, collected.error);
    return 1;
  }

  if (typeof fieldsFlag === "string") {
    const want = fieldsFlag
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const unknown = want.filter((k) => !HEARTBEAT_JSON_FIELDS.includes(k));
    if (!want.length || unknown.length) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: unknown.length ? `Unknown heartbeat field: ${unknown[0]}` : "--fields requires at least one name",
        hint: FIELDS_HINT,
      });
      return EXIT_USAGE;
    }
    /** @type {Record<string, unknown>} */
    const masked = {};
    for (const k of want) masked[k] = collected.data[k];
    printResult(stdout, { ...args, json: true }, true, masked);
    return 0;
  }

  const env = args.env ?? process.env;
  printResult(stdout, args, true, collected.data, undefined, (d) => {
    const text = formatHeartbeat(d, new Date(), env, args);
    if (!args.json && io.isTTY) return `${text}\n\n${FOOTER}`;
    return text;
  });
  return 0;
}
