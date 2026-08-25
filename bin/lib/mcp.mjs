/**
 * Minimal MCP stdio server (JSON-RPC + Content-Length). Default off.
 * Tools wrap the same command handlers as the CLI; agents should still prefer
 * `mental … --json` when they can shell.
 */
import { cmdWhere } from "../commands/where.mjs";
import { cmdStatus } from "../commands/status.mjs";
import { cmdSearch } from "../commands/search.mjs";
import { cmdShow } from "../commands/show.mjs";
import { cmdJournal } from "../commands/journal.mjs";
import { VERSION, CMD } from "./pkg.mjs";

const PROTOCOL = "2024-11-05";

const TOOLS = [
  { name: "where", description: "Active Mental bundle (root, id, mode)", inputSchema: { type: "object", properties: {} } },
  { name: "status", description: "Git + latest Resume + open decisions", inputSchema: { type: "object", properties: {} } },
  {
    name: "search",
    description: "Search OKF concepts",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
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
    description: "Append today's journal section",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        resume: { type: "string" },
      },
      required: ["title"],
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
  const code = handler({ ...args, json: true }, { stdout });
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
  if (name === "where") return capture(cmdWhere, base);
  if (name === "status") return capture(cmdStatus, base);
  if (name === "search") return capture(cmdSearch, { ...base, rest: [String(args.q || "")] });
  if (name === "show") return capture(cmdShow, { ...base, rest: [String(args.path || "")] });
  if (name === "journal") {
    return capture(cmdJournal, {
      ...base,
      flags: {
        title: args.title,
        body: args.body || "",
        resume: args.resume || "Continue. — open loops: none",
      },
    });
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
    const text = JSON.stringify(body, null, 2);
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

export { TOOLS, handle, encode, runTool };
