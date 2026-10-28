#!/usr/bin/env node
/**
 * Dashboard helper for the Mental panel mod. Each verb returns within a few
 * seconds so the mod's `$.process.run` call never waits on the server.
 *
 *   node dash.mjs probe          -> {"serving":bool,"url":string}
 *   node dash.mjs open <url>     -> opens a loopback dashboard URL in the default browser
 *   node dash.mjs start          -> starts `mental dashboard` detached (it opens the browser)
 *   node dash.mjs stop           -> stops the dashboard the port file names
 *
 * One dashboard serves every project (`#/today?p=<id>`), so `probe` looks for
 * any running one: first the port file the server writes
 * (`~/.mental/dashboard.json`), then the default port 3847.
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
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

/** The port file's live dashboard, or null when it is missing, malformed, or its process is gone. */
function advertised() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return null;
  const file = join(home, ".mental", "dashboard.json");
  let body;
  try {
    body = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const url = typeof body?.url === "string" && body.url.endsWith("/") ? body.url : null;
  if (!url || !LOOPBACK_URL.test(url)) return null;
  const pid = Number.isInteger(body.pid) && body.pid > 0 ? body.pid : null;
  // A hard kill leaves the file behind; a dead pid means it is stale.
  if (pid) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if (err?.code === "ESRCH") return null;
    }
  }
  return { url, pid, file };
}

function advertisedUrl() {
  return advertised()?.url ?? null;
}

/**
 * Stop the dashboard the port file names. The pid is trusted only while its
 * URL still answers as a Mental dashboard, so a recycled pid is never killed.
 */
async function stop() {
  const live = advertised();
  if (!live?.pid) return { stopped: false, reason: (await answers(DEFAULT_URL)) ? "unknown-pid" : "not-running" };
  if (!(await answers(live.url))) return { stopped: false, reason: "not-running" };
  try {
    process.kill(live.pid);
  } catch {
    return { stopped: false, reason: "kill-failed" };
  }
  // On Windows the kill is immediate, so the server never gets to remove its own file.
  rmSync(live.file, { force: true });
  return { stopped: true, url: live.url };
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
  // The idle exit keeps a panel-started dashboard from outliving every session that used it.
  const child = spawn(process.execPath, [cli, "dashboard", "--idle-exit", "30"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  process.stdout.write(`${JSON.stringify({ started: true, pid: child.pid })}\n`);
} else if (verb === "stop") {
  process.stdout.write(`${JSON.stringify(await stop())}\n`);
} else {
  process.stderr.write("usage: dash.mjs probe | open <url> | start | stop\n");
  process.exit(2);
}
