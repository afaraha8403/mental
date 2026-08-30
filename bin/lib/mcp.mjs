/**
 * Minimal MCP stdio server (JSON-RPC + Content-Length). Default off.
 * Tools wrap the same command handlers as the CLI; agents should still prefer
 * `mental … --json` when they can shell. MCP exists so agents that only speak
 * tools (parallel sessions, orchestrators) can re-pulse and record mid-chat.
 * Host config writers live in mcp-hosts.mjs (`install --mcp` / `option mcp`).
 */
import { cmdWhere } from "../commands/where.mjs";
import { cmdOption } from "../commands/option.mjs";
import { cmdTrack } from "../commands/track.mjs";
import { enableMcp, disableMcp, cursorMcpPath, claudeMcpPath } from "./mcp-hosts.mjs";
import { cmdHeartbeat } from "../commands/heartbeat.mjs";
import { cmdStatus } from "../commands/status.mjs";
import { cmdSearch } from "../commands/search.mjs";
import { cmdShow } from "../commands/show.mjs";
import { cmdList } from "../commands/list.mjs";
import { cmdJournal } from "../commands/journal.mjs";
import { cmdAttention } from "../commands/attention.mjs";
import { cmdDecide } from "../commands/decide.mjs";
import { cmdNote } from "../commands/note.mjs";
import { cmdPark } from "../commands/park.mjs";
import { cmdHandoff } from "../commands/handoff.mjs";
import { cmdPulse } from "../commands/pulse.mjs";
import { VERSION, CMD } from "./pkg.mjs";
import { mcpToolsFromCatalog } from "./catalog.mjs";

const PROTOCOL = "2024-11-05";

const TOOLS = mcpToolsFromCatalog();

function capture(handler, args) {
  let buf = "";
  const stdout = {
    write(chunk) {
      buf += chunk;
      return true;
    },
  };
  let code;
  try {
    code = handler({ ...args, json: true }, { stdout });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errCode = /** @type {{ code?: string }} */ (err).code || "write";
    return { code: 1, body: { ok: false, error: { code: String(errCode), message } } };
  }
  let body;
  try {
    body = JSON.parse(buf);
  } catch {
    body = { ok: false, error: { code: "mcp", message: buf || "empty handler output" } };
  }
  return { code, body };
}

function runTool(name, args, ctx) {
  const base = {
    json: true,
    cwd: ctx.cwd,
    home: ctx.home,
    env: ctx.env,
    dir: ctx.dir,
    flags: {},
    rest: [],
  };
  if (name === "heartbeat") return capture(cmdHeartbeat, { ...base, flags: args.fields ? { fields: args.fields } : {} });
  if (name === "where") return capture(cmdWhere, base);
  if (name === "status") return capture(cmdStatus, base);
  if (name === "search") {
    const q = args.q;
    const rest = Array.isArray(q) ? [] : [String(q || "")];
    const queries = Array.isArray(q) ? q.map(String) : undefined;
    return capture(cmdSearch, {
      ...base,
      rest,
      queries,
      flags: {
        type: args.type,
        status: args.status,
        tag: args.tag,
        kind: args.kind,
        any: args.any === true,
      },
    });
  }
  if (name === "list") {
    return capture(cmdList, {
      ...base,
      flags: {
        type: args.type,
        status: args.status,
        tag: args.tag,
        kind: args.kind,
      },
    });
  }
  if (name === "show") return capture(cmdShow, { ...base, rest: [String(args.path || "")] });
  if (name === "journal") {
    return capture(cmdJournal, {
      ...base,
      flags: {
        title: args.title,
        body: args.body || "",
        resume: args.resume,
        against: args.against,
        via: args.via,
      },
    });
  }
  if (name === "attention") {
    return capture(cmdAttention, {
      ...base,
      flags: {
        title: args.title,
        path: args.path,
        kind: args.kind,
        status: args.status,
        from: args.from,
        via: args.via,
        body: args.body,
        against: args.against,
      },
    });
  }
  if (name === "decide") {
    return capture(cmdDecide, {
      ...base,
      flags: {
        title: args.title,
        path: args.path,
        status: args.status,
        description: args.description,
        body: args.body,
        via: args.via,
      },
    });
  }
  if (name === "note") {
    return capture(cmdNote, {
      ...base,
      flags: { title: args.title, status: args.status, description: args.description, body: args.body },
    });
  }
  if (name === "park") {
    return capture(cmdPark, {
      ...base,
      flags: {
        resume: args.resume,
        title: args.title,
        body: args.body,
        attention: args.attention,
        kind: args.kind,
        from: args.from,
        against: args.against,
        via: args.via,
      },
    });
  }
  if (name === "handoff") {
    return capture(cmdHandoff, {
      ...base,
      flags: {
        title: args.title,
        resume: args.resume,
        body: args.body,
        against: args.against,
        via: args.via,
      },
    });
  }
  if (name === "pulse") return capture(cmdPulse, base);
  if (name === "option") {
    const rest = [];
    if (args.feature) rest.push(String(args.feature));
    if (args.action) rest.push(String(args.action));
    return capture(cmdOption, { ...base, rest, flags: { all: Boolean(args.all) } });
  }
  if (name === "track") {
    const rest = args.sub ? [String(args.sub)] : [];
    const flags = {};
    if (args.title_internal) flags["title-internal"] = args.title_internal;
    if (args.title_external) flags["title-external"] = args.title_external;
    if (args.body_internal) flags["body-internal"] = args.body_internal;
    if (args.body_external) flags["body-external"] = args.body_external;
    if (args.task) flags.task = args.task;
    if (args.id) flags.id = args.id;
    if (args.user) flags.user = args.user;
    if (args.all) flags.all = true;
    if (args.since) flags.since = args.since;
    if (args.until) flags.until = args.until;
    if (args.out) flags.out = args.out;
    if (args.format) flags.format = args.format;
    if (args.external) flags.external = true;
    if (args.project) flags.project = args.project;
    if (args.via) flags.via = args.via;
    if (args.against) flags.against = args.against;
    return capture(cmdTrack, { ...base, rest, flags });
  }
  return { code: 1, body: { ok: false, error: { code: "unknown-tool", message: name } } };
}

function encode(msg) {
  const json = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function handle(msg, ctx) {
  if (!msg || typeof msg !== "object") return null;
  const id = msg.id;
  const method = msg.method;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: CMD, version: VERSION },
      },
    };
  }
  if (method === "notifications/initialized" || method === "initialized") return null;
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    const { body } = runTool(name, args, ctx);
    const text = JSON.stringify(body);
    const isError = body.ok === false;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text }],
        isError,
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (id == null) return null;
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

/**
 * Serve MCP on the given streams. Resolves when stdin ends.
 * @param {{ cwd?: string, home?: string, env?: NodeJS.ProcessEnv, dir?: string | null, stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream }} ctx
 */
export function serveMcp(ctx = {}) {
  const stdin = ctx.stdin ?? process.stdin;
  const stdout = ctx.stdout ?? process.stdout;
  const rpcCtx = {
    cwd: ctx.cwd ?? process.cwd(),
    home: ctx.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: ctx.env ?? process.env,
    dir: ctx.dir ?? null,
  };

  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    stdin.on("data", (chunk) => {
      buf = Buffer.concat([buf, Buffer.from(chunk)]);
      while (true) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const header = buf.slice(0, headerEnd).toString("utf8");
        const lenM = header.match(/Content-Length:\s*(\d+)/i);
        if (!lenM) {
          buf = buf.slice(headerEnd + 4);
          continue;
        }
        const len = Number(lenM[1]);
        const start = headerEnd + 4;
        if (buf.length < start + len) break;
        const json = buf.slice(start, start + len).toString("utf8");
        buf = buf.slice(start + len);
        let msg;
        try {
          msg = JSON.parse(json);
        } catch {
          continue;
        }
        const reply = handle(msg, rpcCtx);
        if (reply) stdout.write(encode(reply));
      }
    });
    stdin.on("end", () => resolve(0));
    stdin.on("error", () => resolve(1));
  });
}

export { TOOLS, handle, encode, runTool, enableMcp, disableMcp, cursorMcpPath, claudeMcpPath };
