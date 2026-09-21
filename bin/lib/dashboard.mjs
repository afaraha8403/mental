/**
 * Optional localhost explorer. Loopback only. GET/HEAD. No writes.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { PKG_ROOT } from "./pkg.mjs";
import { resolveBundle } from "./resolve.mjs";
import { catalogRoot, collectHeartbeat } from "./heartbeat.mjs";
import { loadBindings } from "./bindings.mjs";
import { collectPulseProjects, pulseRootForBinding } from "./pulse.mjs";
import { filterConcepts, listConcepts, listBacklinks, searchBundle } from "./index.mjs";
import { readBundleFile } from "./okf.mjs";
import { isFeatureOn } from "./config.mjs";
import { glanceTime } from "./time.mjs";

/** Loopback address the dashboard binds. Never 0.0.0.0. */
export const DASHBOARD_HOST = "127.0.0.1";
/** Default listen port. Busy without `--port` falls back to ephemeral 0. */
export const DASHBOARD_PORT = 3847;

const PAGE_CAP = 50;
const PAGE_MAX = 100;

const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

/**
 * @param {string | undefined} hostHeader
 * @param {number} port
 */
export function isAllowedHost(hostHeader, port) {
  const raw = String(hostHeader || "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  const allowed = new Set([
    "127.0.0.1",
    `127.0.0.1:${port}`,
    "localhost",
    `localhost:${port}`,
    "[::1]",
    `[::1]:${port}`,
  ]);
  return allowed.has(raw);
}

function dashboardAssetsDir() {
  return join(PKG_ROOT, "assets", "dashboard");
}

/**
 * @param {{ id?: string | null, mode?: string }} where
 * @param {Array<{ path: string }>} items
 */
function hideForeignSlices(where, items) {
  if (where?.mode !== "personal") return items;
  return items.filter((c) => !String(c.path).replace(/\\/g, "/").startsWith("projects/"));
}

function intParam(value, fallback, max) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, max);
}

function summarize(c) {
  return {
    path: c.path,
    type: c.type,
    title: c.title,
    description: c.description || "",
    status: c.status,
    kind: c.kind || "",
    tags: c.tags,
  };
}

/**
 * @param {{ cwd?: string, home?: string | null, env?: NodeJS.ProcessEnv, dir?: string | null }} ctx
 * @param {string | null} projectId
 */
export function resolveDashboardProject(ctx, projectId) {
  const cwd = ctx.cwd ?? process.cwd();
  const home = ctx.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = ctx.env ?? process.env;
  const dir = ctx.dir ?? null;
  if (!projectId) {
    const resolved = resolveBundle({ cwd, home, env, dir, write: false });
    if (!resolved.ok) return { ok: false, status: 400, error: resolved.error };
    return { ok: true, where: resolved.data, root: catalogRoot(resolved.data) };
  }
  if (!home) {
    return { ok: false, status: 400, error: { code: "home", message: "HOME unset" } };
  }
  let bindings;
  try {
    bindings = loadBindings(home);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: { code: "bindings", message } };
  }
  const binding = bindings.bindings.find((b) => b.id === projectId);
  if (!binding) {
    return {
      ok: false,
      status: 404,
      error: { code: "not-found", message: `unknown project id: ${projectId}` },
    };
  }
  const root = pulseRootForBinding(home, binding);
  const where = {
    root: root || "",
    id: binding.id,
    mode: "home",
    reason: "dashboard-id",
    gitRoot: (binding.paths && binding.paths[0]) || null,
  };
  return { ok: true, where, root: root && existsSync(root) ? root : null };
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {string} method
 * @param {number} status
 * @param {object} body
 * @param {Record<string, string>} [extra]
 */
function sendJson(res, method, status, body, extra = {}) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(buf.length),
    ...SECURITY_HEADERS,
    ...extra,
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(buf);
}

function sendBuffer(res, method, status, buf, contentType, extra = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": String(buf.length),
    ...SECURITY_HEADERS,
    ...extra,
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(buf);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ cwd?: string, home?: string | null, env?: NodeJS.ProcessEnv, dir?: string | null, port: number }} ctx
 */
export function handleDashboardRequest(req, res, ctx) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, method, 405, { ok: false, error: { code: "method", message: "GET or HEAD only" } }, {
      Allow: "GET, HEAD",
    });
    return;
  }
  if (!isAllowedHost(req.headers.host, ctx.port)) {
    sendJson(res, method, 403, { ok: false, error: { code: "host", message: "loopback Host only" } });
    return;
  }

  let url;
  try {
    url = new URL(req.url || "/", `http://${DASHBOARD_HOST}`);
  } catch {
    sendJson(res, method, 400, { ok: false, error: { code: "url", message: "bad request url" } });
    return;
  }

  const staticHit = STATIC_FILES[url.pathname];
  if (staticHit) {
    const abs = join(dashboardAssetsDir(), staticHit.file);
    if (!existsSync(abs)) {
      sendJson(res, method, 404, { ok: false, error: { code: "not-found", message: "dashboard assets missing" } });
      return;
    }
    sendBuffer(res, method, 200, readFileSync(abs), staticHit.type);
    return;
  }

  if (!url.pathname.startsWith("/api/")) {
    sendJson(res, method, 404, { ok: false, error: { code: "not-found", message: "not found" } });
    return;
  }

  const home = ctx.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();
  const dir = ctx.dir ?? null;
  const id = url.searchParams.get("id") || null;
  const base = { cwd, home, env, dir };

  try {
    routeApi(method, url, res, base, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, method, 500, { ok: false, error: { code: "internal", message } });
  }
}

/**
 * @param {string} method
 * @param {URL} url
 * @param {import("node:http").ServerResponse} res
 * @param {{ cwd: string, home: string | null, env: NodeJS.ProcessEnv, dir: string | null }} base
 * @param {string | null} id
 */
function routeApi(method, url, res, base, id) {
  const path = url.pathname;

  if (path === "/api/projects") {
    const projects = collectPulseProjects(base.home);
    const resolved = resolveBundle({ ...base, write: false });
    const activeId = resolved.ok ? resolved.data.id : null;
    sendJson(res, method, 200, { ok: true, data: { projects, activeId } });
    return;
  }

  const session = resolveDashboardProject(base, id);
  if (!session.ok) {
    sendJson(res, method, session.status, { ok: false, error: session.error });
    return;
  }

  if (path === "/api/where") {
    sendJson(res, method, 200, { ok: true, data: session.where });
    return;
  }

  if (path === "/api/heartbeat") {
    const hb = collectHeartbeat(
      { cwd: base.cwd, home: base.home, env: base.env, dir: session.root },
      { pingTrack: false, where: session.where },
    );
    if (!hb.ok) {
      sendJson(res, method, 400, hb);
      return;
    }
    sendJson(res, method, 200, hb);
    return;
  }

  if (path === "/api/list") {
    const type = url.searchParams.get("type") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const tag = url.searchParams.get("tag") || undefined;
    const kind = url.searchParams.get("kind") || undefined;
    const offset = intParam(url.searchParams.get("offset"), 0, 1_000_000);
    const limit = intParam(url.searchParams.get("limit"), PAGE_CAP, PAGE_MAX);
    const all = session.root
      ? hideForeignSlices(
          session.where,
          filterConcepts(listConcepts(session.root), { type, status, tag, kind }),
        ).map(summarize)
      : [];
    const items = all.slice(offset, offset + limit);
    sendJson(res, method, 200, {
      ok: true,
      data: {
        items,
        total: all.length,
        offset,
        limit,
        truncated: all.length > offset + items.length,
        type: type ?? null,
        status: status ?? null,
        tag: tag ?? null,
        kind: kind ?? null,
      },
    });
    return;
  }

  if (path === "/api/search") {
    const q = String(url.searchParams.get("q") || "").trim();
    const offset = intParam(url.searchParams.get("offset"), 0, 1_000_000);
    const limit = intParam(url.searchParams.get("limit"), PAGE_CAP, PAGE_MAX);
    if (!session.root || !q) {
      sendJson(res, method, 200, {
        ok: true,
        data: { q, hits: [], total: 0, offset, limit, truncated: false, tokens: [], op: "and", backend: "scan" },
      });
      return;
    }
    const found = searchBundle({
      root: session.root,
      id: session.where.id,
      home: base.home,
      env: base.env,
      q,
      type: url.searchParams.get("type") || undefined,
      status: url.searchParams.get("status") || undefined,
      tag: url.searchParams.get("tag") || undefined,
      kind: url.searchParams.get("kind") || undefined,
      limit: offset + limit,
      any: url.searchParams.get("any") === "1",
    });
    const visible = hideForeignSlices(session.where, found.hits);
    const hits = visible.slice(offset, offset + limit);
    sendJson(res, method, 200, {
      ok: true,
      data: {
        q,
        hits,
        total: visible.length,
        offset,
        limit,
        truncated: visible.length > offset + hits.length,
        tokens: found.tokens,
        op: found.op,
        backend: found.backend,
      },
    });
    return;
  }

  if (path === "/api/show") {
    const rel = String(url.searchParams.get("path") || "").trim();
    if (!rel) {
      sendJson(res, method, 400, { ok: false, error: { code: "usage", message: "path is required" } });
      return;
    }
    if (!session.root) {
      sendJson(res, method, 404, {
        ok: false,
        error: { code: "not-found", message: "no Mental bundle yet (home mode without a UUID)" },
      });
      return;
    }
    const relNorm = rel.replace(/\\/g, "/");
    if (session.where.mode === "personal" && relNorm.startsWith("projects/")) {
      sendJson(res, method, 404, { ok: false, error: { code: "not-found", message: `no such file: ${rel}` } });
      return;
    }
    const file = readBundleFile(session.root, rel);
    if (!file.ok) {
      sendJson(res, method, 404, { ok: false, error: file.error });
      return;
    }
    const backlinks = listBacklinks({
      root: session.root,
      path: file.data.path.split("#")[0],
      id: session.where.id,
      home: base.home,
      env: base.env,
    });
    sendJson(res, method, 200, {
      ok: true,
      data: {
        path: file.data.path,
        frontmatter: file.data.data,
        body: file.data.body,
        text: file.data.text,
        backlinks,
      },
    });
    return;
  }

  if (path === "/api/track/glance") {
    const trackId = session.where.id || null;
    if (!base.home || !isFeatureOn(base.home, "track", trackId)) {
      sendJson(res, method, 404, { ok: false, error: { code: "track-disabled", message: "Time tracking is off for this project." } });
      return;
    }
    if (!session.root) {
      sendJson(res, method, 404, { ok: false, error: { code: "not-found", message: "no bundle" } });
      return;
    }
    const glance = glanceTime(session.root);
    if (!glance.ok) {
      sendJson(res, method, 400, glance);
      return;
    }
    sendJson(res, method, 200, glance);
    return;
  }

  sendJson(res, method, 404, { ok: false, error: { code: "not-found", message: "not found" } });
}

/**
 * @param {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void} handler
 * @param {number} port
 * @returns {Promise<{ server: import("node:http").Server, port: number }>}
 */
function listenOnce(handler, port) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    const onErr = (err) => {
      server.off("listening", onListen);
      server.close();
      reject(err);
    };
    const onListen = () => {
      server.off("error", onErr);
      const addr = server.address();
      const actual = addr && typeof addr === "object" ? addr.port : port;
      resolve({ server, port: actual });
    };
    server.once("error", onErr);
    server.once("listening", onListen);
    server.listen(port, DASHBOARD_HOST);
  });
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function openBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (platform === "win32") {
      spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Bind 127.0.0.1. Default port 3847; if busy and fallbackOnBusy, retry port 0.
 * @param {{
 *   cwd?: string,
 *   home?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   dir?: string | null,
 *   port?: number | null,
 *   fallbackOnBusy?: boolean,
 *   open?: boolean,
 * }} [opts]
 */
export async function listenDashboard(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const env = opts.env ?? process.env;
  const dir = opts.dir ?? null;
  const explicit = opts.port != null;
  const target = explicit ? Number(opts.port) : DASHBOARD_PORT;
  const fallbackOnBusy = opts.fallbackOnBusy !== false && !explicit;
  const wantOpen = opts.open !== false;

  if (!Number.isInteger(target) || target < 0 || target > 65535) {
    const err = new Error(`Invalid port: ${opts.port}`);
    err.code = "usage";
    throw err;
  }

  const ctx = { cwd, home, env, dir, port: target };
  const handler = (req, res) => handleDashboardRequest(req, res, ctx);

  let bound;
  let fallback = false;
  try {
    bound = await listenOnce(handler, target);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "EADDRINUSE" && fallbackOnBusy) {
      bound = await listenOnce(handler, 0);
      fallback = true;
    } else {
      throw err;
    }
  }
  ctx.port = bound.port;
  const url = `http://${DASHBOARD_HOST}:${bound.port}/`;
  let opened = false;
  if (wantOpen) opened = openBrowser(url);

  const close = () =>
    new Promise((resolve, reject) => {
      if (typeof bound.server.closeAllConnections === "function") {
        bound.server.closeAllConnections();
      }
      bound.server.close((err) => (err ? reject(err) : resolve()));
    });

  return {
    server: bound.server,
    host: DASHBOARD_HOST,
    port: bound.port,
    url,
    opened,
    fallback,
    close,
  };
}
