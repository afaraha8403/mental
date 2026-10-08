#!/usr/bin/env node
/**
 * Dashboard helper for the Mental panel mod. Each verb returns at once so the
 * mod's `$.process.run` call never waits on the server.
 *
 *   node dash.mjs probe [port]   -> {"serving":bool,"id":string|null,"url":string}
 *   node dash.mjs open <url>     -> opens the URL in the default browser
 *   node dash.mjs start          -> starts `mental dashboard` detached (it opens the browser)
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "bin", "cli.mjs");
const [verb, arg] = process.argv.slice(2);

async function probe(port) {
  const url = `http://localhost:${port}/`;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/where`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { serving: false, id: null, url };
    const body = await r.json().catch(() => null);
    return { serving: true, id: body?.data?.id ?? null, url };
  } catch {
    return { serving: false, id: null, url };
  }
}

if (verb === "probe") {
  const port = Number(arg) > 0 ? Number(arg) : 3847;
  process.stdout.write(`${JSON.stringify(await probe(port))}\n`);
} else if (verb === "open" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(String(arg))) {
  const { openBrowser } = await import(pathToFileURL(join(here, "..", "bin", "lib", "dashboard.mjs")).href);
  process.exit(openBrowser(arg) ? 0 : 1);
} else if (verb === "start") {
  const child = spawn(process.execPath, [cli, "dashboard"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  process.stdout.write(`${JSON.stringify({ started: true, pid: child.pid })}\n`);
} else {
  process.stderr.write("usage: dash.mjs probe [port] | open <url> | start\n");
  process.exit(2);
}
