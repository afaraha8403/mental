#!/usr/bin/env node
/**
 * Dashboard helper for the Mental panel mod. Each verb returns within a few
 * seconds so the mod's `$.process.run` call never waits on the server.
 *
 *   node dash.mjs probe          -> {"serving":bool,"url":string}
 *   node dash.mjs open <url>     -> opens a loopback dashboard URL in the default browser
 *   node dash.mjs start          -> starts `mental dashboard` detached (it opens the browser)
 *
 * One dashboard serves every project (`#/today?p=<id>`), so `probe` looks for
 * any running one: first the port file the server writes
 * (`~/.mental/dashboard.json`), then the default port 3847.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "bin", "cli.mjs");
const [verb, arg] = process.argv.slice(2);
const DEFAULT_URL = "http://127.0.0.1:3847/";
// The same set `isLaunchableUrl` allows: Windows hands the URL to `cmd start`,
// where `&`, `|`, `^`, `%` and quotes are shell syntax.
const LOOPBACK_URL = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}\/[\w\-./?=#:+~]*$/;

/** True when `url` answers like a Mental dashboard. */
async function answers(url) {
  try {
    const r = await fetch(`${url}api/where`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** The advertised dashboard URL, or null when the file is missing, malformed, or its process is gone. */
function advertisedUrl() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  let body;
  try {
    body = JSON.parse(readFileSync(join(home, ".mental", "dashboard.json"), "utf8"));
  } catch {
    return null;
  }
  const url = typeof body?.url === "string" && body.url.endsWith("/") ? body.url : null;
  if (!url || !LOOPBACK_URL.test(url)) return null;
  // A hard kill leaves the file behind; a dead pid means it is stale.
  if (Number.isInteger(body.pid)) {
    try {
      process.kill(body.pid, 0);
    } catch (err) {
      if (err?.code === "ESRCH") return null;
    }
  }
  return url;
}

async function probe() {
  const advertised = advertisedUrl();
  if (advertised && (await answers(advertised))) return { serving: true, url: advertised };
  if (await answers(DEFAULT_URL)) return { serving: true, url: DEFAULT_URL };
  return { serving: false, url: null };
}

if (verb === "probe") {
  process.stdout.write(`${JSON.stringify(await probe())}\n`);
} else if (verb === "open" && LOOPBACK_URL.test(String(arg))) {
  const { openBrowser } = await import(pathToFileURL(join(here, "..", "bin", "lib", "dashboard.mjs")).href);
  process.exit(openBrowser(arg) ? 0 : 1);
} else if (verb === "start") {
  // CONCERN: pass `--idle-exit 30` once `mental dashboard` accepts it, so a
  // dashboard the panel started does not outlive every session that used it.
  const child = spawn(process.execPath, [cli, "dashboard"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  process.stdout.write(`${JSON.stringify({ started: true, pid: child.pid })}\n`);
} else {
  process.stderr.write("usage: dash.mjs probe | open <url> | start\n");
  process.exit(2);
}
