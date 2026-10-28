/**
 * `mental hooks on|off` — optional session-start snippets. Default off.
 * `mental hooks session-start [claude-code|cursor]` — what those hooks run.
 */
import { disableHooks, enableHooks, detectHookHost, HOOK_HOSTS, sessionStartOutput } from "../lib/hooks.mjs";
import { setFeature } from "../lib/config.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";
import { cmdStatus } from "./status.mjs";

/** How long a host-less run waits for the hook payload on stdin. */
const STDIN_WAIT_MS = 500;

export async function cmdHooks(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const action = (args.rest[0] || "").toLowerCase();
  if (action === "session-start") return runSessionStart(args, io);

  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args, false, undefined, {
      code: "no-home",
      message: "HOME is unset; Mental will not write hooks.",
    });
    return 1;
  }

  if (action !== "on" && action !== "off") {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental hooks on|off  (default off; install does not enable hooks)",
    });
    return EXIT_USAGE;
  }

  const result = action === "on" ? enableHooks(home) : disableHooks(home);
  if (!result.ok) {
    printResult(stdout, args, false, undefined, result.error);
    return 1;
  }
  setFeature(home, "hooks", action, { all: true });
  printResult(
    stdout,
    args,
    true,
    { action, ...result },
    undefined,
    () => `hooks ${action}: ${result.written.join(", ") || "nothing to change"}`,
  );
  return 0;
}

/**
 * Print status as the host's hook output. Always exits 0: a failing hook must
 * never block the host's session from starting.
 */
async function runSessionStart(args, io) {
  const stdout = io.stdout ?? process.stdout;
  const named = (args.rest[1] || "").toLowerCase();
  let host = HOOK_HOSTS.includes(named) ? named : null;
  let event = null;
  if (!named) ({ host, event } = detectHookHost(await readStdin(io.stdin, STDIN_WAIT_MS)));

  let statusText = "";
  try {
    const sink = { write: (chunk) => ((statusText += String(chunk)), true) };
    cmdStatus({ ...args, json: true, rest: [] }, { ...io, stdout: sink });
  } catch {
    statusText = "";
  }
  const out = sessionStartOutput({ host, event, statusText });
  if (out) stdout.write(`${out}\n`);
  return 0;
}

/**
 * @param {NodeJS.ReadableStream | undefined} stdin
 * @param {number} ms
 * @returns {Promise<string>}
 */
function readStdin(stdin, ms) {
  if (!stdin || /** @type {any} */ (stdin).isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let text = "";
    const done = () => {
      clearTimeout(timer);
      stdin.removeListener("data", onData);
      stdin.removeListener("end", done);
      stdin.removeListener("error", done);
      /** @type {any} */ (stdin).pause?.();
      /** @type {any} */ (stdin).unref?.();
      resolve(text);
    };
    const onData = (chunk) => {
      text += String(chunk);
    };
    const timer = setTimeout(done, ms);
    stdin.on("data", onData);
    stdin.once("end", done);
    stdin.once("error", done);
  });
}
