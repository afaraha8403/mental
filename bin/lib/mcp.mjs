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

const PROTOCOL = "2024-11-05";

const TOOLS = [
  { name: "heartbeat", description: "Cheap pulse: resume, last outcome, git, residue, unsettled decisions. Safe to re-call any time mid-chat.", inputSchema: { type: "object", properties: {} } },
  { name: "where", description: "Active Mental bundle (root, id, mode)", inputSchema: { type: "object", properties: {} } },
  { name: "status", description: "Git + latest Resume + open decisions + notes", inputSchema: { type: "object", properties: {} } },
  {
    name: "search",
    description: "Search OKF concepts (decisions, attention, notes, journal). Structured filters optional; then show a path.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        type: { type: "string", description: "Concept type (Decision, Attention, Note, Journal)" },
        status: { type: "string" },
        tag: { type: "string" },
        kind: { type: "string", description: "Attention kind: direction | concern | thread | verify" },
      },
      required: ["q"],
    },
  },
  {
    name: "list",
    description: "List OKF concepts with typed frontmatter filters (no query). Prefer this over search for status/type/kind.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        status: { type: "string" },
        tag: { type: "string" },
        kind: { type: "string", description: "Attention kind: direction | concern | thread | verify" },
      },
    },
  },
  {
    name: "show",
    description: "Read one OKF file relative to the bundle root",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "journal",
    description: "Append today's journal section (one per task boundary, not per turn)",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        resume: { type: "string" },
        via: { type: "string", description: "Short client token (cursor, claude-code, copilot, codex, mcp, cli). Not a session id." },
      },
      required: ["title"],
    },
  },
  {
    name: "attention",
    description: "Create or update residue still in the air. Create needs title + kind; update by title or path; close with status resolved.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: ["direction", "concern", "thread", "verify"] },
        status: { type: "string", enum: ["open", "later", "resolved"] },
        from: { type: "string", description: "Who raised it (e.g. Tom)" },
        via: { type: "string", description: "Short client token (cursor, claude-code, …). Not a session id." },
        body: { type: "string" },
        path: { type: "string", description: "Bundle-relative path of an existing item to update" },
      },
    },
  },
  {
    name: "decide",
    description: "Create or update a decision. Same title updates the existing file (close with status decided).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        status: { type: "string", enum: ["open", "deferred", "decided", "superseded"] },
        description: { type: "string" },
        body: { type: "string" },
        via: { type: "string", description: "Short client token (cursor, claude-code, …). Not a session id." },
        path: { type: "string", description: "Bundle-relative path of an existing decision to update" },
      },
    },
  },
  {
    name: "note",
    description: "Record a durable, non-obvious, repository-specific fact",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        status: { type: "string", enum: ["draft", "active", "superseded"] },
        description: { type: "string" },
        body: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "park",
    description: "Encode at an interruption (default title Parked). Requires resume. Optional attention+kind. Then heartbeat.",
    inputSchema: {
      type: "object",
      properties: {
        resume: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        attention: { type: "string", description: "Residue title to record with this park" },
        kind: { type: "string", enum: ["direction", "concern", "thread", "verify"] },
        from: { type: "string" },
        against: { type: "string" },
        via: { type: "string", description: "Short client token (cursor, claude-code, …). Not a session id." },
      },
      required: ["resume"],
    },
  },
  {
    name: "handoff",
    description: "Planned close: journal then heartbeat. Requires title and resume.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        resume: { type: "string" },
        body: { type: "string" },
        against: { type: "string" },
        via: { type: "string", description: "Short client token (cursor, claude-code, …). Not a session id." },
      },
      required: ["title", "resume"],
    },
  },
  {
    name: "pulse",
    description: "Cross-project compact rows (id, name, resume, counts). No journal bodies. Writes pulse watermark for the active bundle.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "option",
    description: "List or set optional features (track per-UUID; hooks/mcp user-global). Handlers no-op with usage when the feature is off. Do not enable unless the user named the feature this turn.",
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", enum: ["track", "hooks", "mcp"] },
        action: { type: "string", enum: ["on", "off"] },
        all: { type: "boolean" },
      },
    },
  },
  {
    name: "track",
    description: "Optional wall/user timers. Usage when tracking is off for this project — do not enable it. Subcommands: glance (default), start, stop, focus, discard, report, export.",
    inputSchema: {
      type: "object",
      properties: {
        sub: { type: "string", description: "glance|start|stop|focus|discard|amend|report|export" },
        title_internal: { type: "string" },
        title_external: { type: "string" },
        body_internal: { type: "string" },
        body_external: { type: "string" },
        task: { type: "string" },
        id: { type: "string" },
        user: { type: "string", description: "h:mm; required on stop --all when any runner is stale" },
        all: { type: "boolean" },
        since: { type: "string" },
        until: { type: "string" },
        out: { type: "string", description: "export path; must be outside the git worktree" },
        format: { type: "string", enum: ["csv", "md"] },
        external: { type: "boolean" },
        project: { type: "string" },
        via: { type: "string" },
        against: { type: "string" },
      },
    },
  },
];

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
  if (name === "heartbeat") return capture(cmdHeartbeat, base);
  if (name === "where") return capture(cmdWhere, base);
  if (name === "status") return capture(cmdStatus, base);
  if (name === "search") {
    return capture(cmdSearch, {
      ...base,
      rest: [String(args.q || "")],
      flags: {
        type: args.type,
        status: args.status,
        tag: args.tag,
        kind: args.kind,
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
        resume: args.resume || "Continue. — open loops: none",
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
