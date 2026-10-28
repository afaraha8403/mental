/**
 * Minimal MCP stdio server (JSON-RPC 2.0, newline-delimited JSON). Default off.
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
import { cmdMove } from "../commands/move.mjs";
import { cmdList } from "../commands/list.mjs";
import {
  cmdJournalS as cmdJournal,
  cmdAttentionS as cmdAttention,
  cmdDecideS as cmdDecide,
  cmdNoteS as cmdNote,
  cmdParkS as cmdPark,
} from "./similar.mjs";
import { cmdHandoffS as cmdHandoff } from "../lib/similar.mjs";
import { cmdPulse } from "../commands/pulse.mjs";
import { cmdBrief } from "../commands/brief.mjs";
import { VERSION, CMD } from "./pkg.mjs";
import { mcpToolsFromCatalog } from "./catalog.mjs";

/** Supported MCP protocol revisions, newest first. */
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = mcpToolsFromCatalog();

function capture(handler, args) {
  let buf = "";
  const stdout = {
    write(chunk) {
      buf += chunk;
      return true;
    },
  };
  const fail = (err) => {
    const message = err instanceof Error ? err.message : String(err);
    const errCode = /** @type {{ code?: string }} */ (err).code || "write";
    return { code: 1, body: { ok: false, error: { code: String(errCode), message } } };
  };
  const finish = (code) => {
    let body;
    try {
      body = JSON.parse(buf);
    } catch {
      body = { ok: false, error: { code: "mcp", message: buf || "empty handler output" } };
    }
    return { code, body };
  };
  let code;
  try {
    code = handler({ ...args, json: true }, { stdout });
  } catch (err) {
    return fail(err);
  }
  // Handlers are synchronous unless an optional integration (Jev) is active.
  if (code && typeof code.then === "function") return code.then(finish, fail);
  return finish(code);
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
  if (name === "heartbeat") {
    const flags = {};
    if (args.fields) flags.fields = args.fields;
    if (args.passive) flags.passive = true;
    return capture(cmdHeartbeat, { ...base, flags });
  }
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
        limit: args.limit,
        offset: args.offset,
        all: args.all === true,
        since: args.since,
        on: args.on,
        project: args.project,
        "all-projects": args.all_projects === true,
        any: args.any === true,
        rank: args.rank === true,
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
        limit: args.limit,
        offset: args.offset,
        all: args.all === true,
        since: args.since,
        on: args.on,
        project: args.project,
        "all-projects": args.all_projects === true,
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
        "title-internal": args.title_internal,
        "body-internal": args.body_internal,
        "title-external": args.title_external,
        "body-external": args.body_external,
        billable: args.billable,
        "project-name": args.project_name,
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
        description: args.description,
        via: args.via,
        body: args.body,
        against: args.against,
        slug: args.slug,
        tag: args.tag,
        project: args.project,
        "move-to": args.move_to,
      },
    });
  }
  if (name === "move") {
    return capture(cmdMove, {
      ...base,
      rest: [String(args.path || "")],
      flags: { to: args.to },
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
        slug: args.slug,
        tag: args.tag,
        project: args.project,
      },
    });
  }
  if (name === "note") {
    return capture(cmdNote, {
      ...base,
      flags: { title: args.title, status: args.status, description: args.description, body: args.body, slug: args.slug, tag: args.tag, project: args.project },
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
        "title-internal": args.title_internal,
        "body-internal": args.body_internal,
        "title-external": args.title_external,
        "body-external": args.body_external,
        billable: args.billable,
        "project-name": args.project_name,
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
        "title-internal": args.title_internal,
        "body-internal": args.body_internal,
        "title-external": args.title_external,
        "body-external": args.body_external,
        billable: args.billable,
        "project-name": args.project_name,
      },
    });
  }
  if (name === "pulse") return capture(cmdPulse, base);
  if (name === "brief") {
    return capture(cmdBrief, { ...base, flags: { hops: args.hops, find: args.find, since: args.since, "no-rank": args.no_rank === true } });
  }
  if (name === "option") {
    const feat = String(args.feature || "").toLowerCase();
    if (feat === "jev" || feat === "decide") {
      return { code: 2, body: { ok: false, error: { code: "usage", message: "Decision-model keys are set by the user in a terminal (mental option decide key <KEY>), never over MCP." } } };
    }
    const rest = [];
    if (args.feature) rest.push(String(args.feature));
    if (args.action) rest.push(String(args.action));
    return capture(cmdOption, { ...base, rest, flags: { all: Boolean(args.all), this: Boolean(args.this), provider: args.provider } });
  }
  if (name === "track") {
    const rest = args.sub ? [String(args.sub)] : [];
    const flags = {};
    if (args.title_internal) flags["title-internal"] = args.title_internal;
    if (args.title_external) flags["title-external"] = args.title_external;
    if (args.body_internal) flags["body-internal"] = args.body_internal;
    if (args.body_external) flags["body-external"] = args.body_external;
    if (args.project_name) flags["project-name"] = args.project_name;
    if (args.task) flags.task = args.task;
    if (args.id) flags.id = args.id;
    if (args.user) flags.user = args.user;
    if (args.billable) flags.billable = args.billable;
    if (args.history) flags.history = true;
    if (args.all) flags.all = true;
    if (args.new) flags.new = true;
    if (args.started) flags.started = args.started;
    if (args.accept_stale) flags["accept-stale"] = true;
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

/**
 * Frame one JSON-RPC message for stdio. MCP stdio is newline-delimited JSON and
 * `JSON.stringify` never emits a raw newline, so one message is one line.
 * `lsp` frames with `Content-Length` headers for legacy clients that sent them.
 * @param {object} msg
 * @param {"ndjson" | "lsp"} [framing]
 */
function encode(msg, framing = "ndjson") {
  const json = JSON.stringify(msg);
  if (framing === "lsp") return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  return `${json}\n`;
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function handleOne(msg, ctx) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, -32600, "Invalid Request");
  const id = msg.id;
  const method = msg.method;
  // Notifications have no id and are never answered, even when the method is unknown.
  const isNotification = id === undefined || id === null;
  if (typeof method !== "string") {
    // Client responses (result/error, no method) need no reply either.
    if (isNotification || "result" in msg || "error" in msg) return null;
    return rpcError(id, -32600, "Invalid Request");
  }
  if (isNotification) return null;
  if (method === "initialize") {
    const requested = msg.params?.protocolVersion;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: CMD, version: VERSION },
      },
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const name = msg.params?.name;
    if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
    const args = msg.params?.arguments;
    if (args != null && (typeof args !== "object" || Array.isArray(args))) {
      return rpcError(id, -32602, "Invalid params: arguments must be an object");
    }
    const toReply = ({ body }) => ({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(body) }],
        structuredContent: body,
        isError: body.ok === false,
      },
    });
    const out = runTool(name, args || {}, ctx);
    return typeof out.then === "function" ? out.then(toReply) : toReply(out);
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  return rpcError(id, -32601, `Method not found: ${method}`);
}

/**
 * Answer one parsed JSON-RPC payload: a single message or a batch array.
 * Returns null when nothing must be sent (notifications, client responses),
 * else the reply, or a promise of it when a tool handler is async.
 * @param {unknown} msg
 * @param {{ cwd?: string, home?: string | null, env?: NodeJS.ProcessEnv, dir?: string | null }} ctx
 */
function handle(msg, ctx) {
  if (!Array.isArray(msg)) return handleOne(msg, ctx);
  if (msg.length === 0) return rpcError(null, -32600, "Invalid Request: empty batch");
  const replies = msg.map((m) => handleOne(m, ctx));
  const collect = (all) => {
    const sent = all.filter(Boolean);
    return sent.length ? sent : null;
  };
  return replies.some((r) => r && typeof r.then === "function") ? Promise.all(replies).then(collect) : collect(replies);
}

const LSP_HEADER = /^content-length:/i;

/**
 * Serve MCP on the given streams. Resolves when stdin ends.
 * Input is newline-delimited JSON. `Content-Length`-framed input is still
 * accepted, and a client that sends it gets replies framed the same way.
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
    /** @type {"ndjson" | "lsp"} */
    let framing = "ndjson";
    const pending = new Set();
    const send = (reply) => {
      if (reply) stdout.write(encode(reply, framing));
    };
    const dispatch = (text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        send(rpcError(null, -32700, "Parse error"));
        return;
      }
      const reply = handle(msg, rpcCtx);
      if (reply && typeof reply.then === "function") {
        const p = reply
          .then(send)
          .catch((err) => send(rpcError(msg?.id, -32603, err instanceof Error ? err.message : String(err))))
          .finally(() => pending.delete(p));
        pending.add(p);
      } else send(reply);
    };
    /** Takes one framed message off `buf`; false when more bytes are needed. */
    const next = () => {
      const start = buf.findIndex((b) => b !== 0x0a && b !== 0x0d && b !== 0x20 && b !== 0x09);
      if (start < 0) {
        buf = Buffer.alloc(0);
        return false;
      }
      buf = buf.subarray(start);
      if (LSP_HEADER.test(buf.subarray(0, 15).toString("latin1"))) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) return false;
        const lenM = buf.subarray(0, headerEnd).toString("utf8").match(/Content-Length:\s*(\d+)/i);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + Number(lenM?.[1] ?? 0);
        if (buf.length < bodyEnd) return false;
        framing = "lsp";
        const text = buf.subarray(bodyStart, bodyEnd).toString("utf8");
        buf = buf.subarray(bodyEnd);
        dispatch(text);
        return true;
      }
      const nl = buf.indexOf(0x0a);
      if (nl < 0) return false;
      const text = buf.subarray(0, nl).toString("utf8");
      buf = buf.subarray(nl + 1);
      dispatch(text);
      return true;
    };
    stdin.on("data", (chunk) => {
      buf = Buffer.concat([buf, Buffer.from(chunk)]);
      while (next());
    });
    stdin.on("end", () => {
      // A last NDJSON line without a trailing newline is still a message.
      const rest = buf.toString("utf8").trim();
      if (rest && !LSP_HEADER.test(rest)) dispatch(rest);
      Promise.all([...pending]).then(() => resolve(0));
    });
    stdin.on("error", () => resolve(1));
  });
}

export { TOOLS, handle, encode, runTool, enableMcp, disableMcp, cursorMcpPath, claudeMcpPath };
