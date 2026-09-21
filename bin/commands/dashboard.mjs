/**
 * `mental dashboard` — optional read-only localhost explorer.
 */
import { listenDashboard, DASHBOARD_PORT } from "../lib/dashboard.mjs";
import { printResult, EXIT_USAGE } from "../lib/output.mjs";

/**
 * @param {{ json?: boolean, flags?: Record<string, string | boolean>, cwd?: string, home?: string, env?: NodeJS.ProcessEnv, dir?: string | null }} args
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export async function cmdDashboard(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const raw = args.flags?.port;
  let port = null;
  let fallbackOnBusy = true;
  if (raw != null && raw !== true) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
      printResult(stdout, args, false, undefined, {
        code: "usage",
        message: "mental dashboard --port must be an integer 0–65535",
      });
      return EXIT_USAGE;
    }
    port = n;
    fallbackOnBusy = false;
  }
  const open = args.flags?.["no-open"] !== true;
  let bind;
  try {
    bind = await listenDashboard({
      cwd: args.cwd,
      home: args.home,
      env: args.env,
      dir: args.dir ?? null,
      port,
      fallbackOnBusy,
      open,
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    const message = err instanceof Error ? err.message : String(err);
    if (code === "EADDRINUSE") {
      printResult(stdout, args, false, undefined, {
        code: "port",
        message: `port ${port ?? DASHBOARD_PORT} is in use`,
        hint: "free that port or pass --port 0",
      });
      return 1;
    }
    if (code === "usage") {
      printResult(stdout, args, false, undefined, { code: "usage", message });
      return EXIT_USAGE;
    }
    printResult(stdout, args, false, undefined, { code: code || "listen", message });
    return 1;
  }

  const data = {
    host: bind.host,
    port: bind.port,
    url: bind.url,
    opened: bind.opened,
    fallback: bind.fallback,
  };
  printResult(stdout, args, true, data, undefined, (d) => {
    const extra = d.fallback ? " (3847 busy; ephemeral)" : "";
    return `Mental dashboard ${d.url}${extra}\nCtrl-C to stop.`;
  });

  await new Promise((resolve) => {
    const stop = () => {
      bind.close().finally(() => resolve(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}
