/**
 * Inline chat rows: what a `mental …` shell call looks like in the transcript.
 * Pure parsing, so tests can check it without the engine; the drawing is
 * `toolCardSvg` in desktop.mjs.
 *
 * Many writes answer with little more than a path, so the summary reads the
 * call's own flags (`--title`, `--resume`, `--kind`, `--status`) as well as
 * the JSON it printed.
 */

import { mentalCommandOf, needsLabelOf, receiptTitleOf } from "./model.mjs";
import { oneLine, textOf } from "./format.mjs";

/** The shell command string out of a ToolUse `input` (an object, a string, or JSON text). */
export function commandOfInput(input) {
  if (typeof input === "string") {
    const t = input.trim();
    if (t.startsWith("{")) {
      try {
        return commandOfInput(JSON.parse(t));
      } catch {
        /* plain text */
      }
    }
    return t;
  }
  if (input && typeof input === "object") {
    const o = /** @type {any} */ (input);
    for (const k of ["command", "cmd", "script"]) if (typeof o[k] === "string") return o[k];
  }
  return "";
}

/** @param {string} text */
function jsonOf(text) {
  const at = text.indexOf("{");
  if (at < 0) return null;
  try {
    const body = JSON.parse(text.slice(at));
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

/**
 * Shell words with quotes removed: enough to read Mental's flags back out of
 * a Bash or PowerShell line. Separators (`&&`, `;`, `|`) are their own words.
 * @param {string} line
 */
function wordsOf(line) {
  /** @type {string[]} */
  const words = [];
  const re = /'([^']*)'|"((?:[^"\\]|\\[\s\S])*)"|(&&|\|\||[;|\n])|([^\s'";|&]+|&)/g;
  let word = null;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const glued = m.index === last && word !== null;
    last = re.lastIndex;
    if (m[3]) {
      if (word !== null) words.push(word);
      words.push(m[3]);
      word = null;
      continue;
    }
    const piece = m[1] ?? (m[2] !== undefined ? m[2].replace(/\\(["\\$`])/g, "$1") : m[4]);
    if (glued) word += piece;
    else {
      if (word !== null) words.push(word);
      word = piece;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/**
 * The words after `mental <command>` up to the next shell separator, as
 * positional words and `--flag value` pairs.
 * @param {string} line
 * @param {string} command
 */
export function callArgsOf(line, command) {
  const words = wordsOf(line);
  const at = words.findIndex(
    (w, i) => w.toLowerCase() === command && i > 0 && /(?:^|[\\/])(?:mental(?:\.cmd)?|cli\.mjs)$/i.test(words[i - 1]),
  );
  /** @type {{ rest: string[], flags: Record<string, string | true> }} */
  const args = { rest: [], flags: {} };
  if (at < 0) return args;
  for (let i = at + 1; i < words.length; i++) {
    const w = words[i];
    if (/^(?:&&|\|\||[;|\n])$/.test(w)) break;
    const flag = /^--([a-z][\w-]*)(?:=([\s\S]*))?$/i.exec(w);
    if (!flag) {
      args.rest.push(w);
      continue;
    }
    if (flag[2] !== undefined) args.flags[flag[1]] = flag[2];
    else if (i + 1 < words.length && !words[i + 1].startsWith("--") && !/^(?:&&|\|\||[;|\n])$/.test(words[i + 1])) args.flags[flag[1]] = words[++i];
    else args.flags[flag[1]] = true;
  }
  return args;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const str = (v) => (typeof v === "string" ? oneLine(v) : "");
const join = (...bits) => bits.filter(Boolean).join(" · ");

/** Host names from the files a hooks/option call wrote. */
function hostsOf(paths) {
  const names = new Set();
  for (const p of Array.isArray(paths) ? paths : []) {
    const s = String(p).replace(/\\/g, "/");
    if (/\/\.cursor\//.test(s)) names.add("Cursor");
    else if (/\/\.claude\//.test(s)) names.add("Claude Code");
    else if (/\/\.copilot\/|\/\.github\//.test(s)) names.add("Copilot");
    else if (/\/\.codex\//.test(s)) names.add("Codex");
    else if (/opencode/i.test(s)) names.add("OpenCode");
  }
  return [...names].join(", ");
}

/** "1.3 KB" for a string's length. */
const sizeOf = (text) => {
  const n = String(text || "").length;
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
};

/** Where things stand, for heartbeat / status / brief: resume line, then counts. */
function standing(data) {
  const resume = str(data.handoff?.resume) || str(data.resume);
  const att = Number(data.needYouCount ?? data.attentionCount ?? data.attention?.length ?? data.needsEyes?.total) || 0;
  const dec = Number(data.openDecisionCount ?? (Array.isArray(data.openDecisions) ? data.openDecisions.length : data.openDecisions?.total)) || 0;
  const branch = str(data.git?.branch) || str(data.branch);
  return {
    title: resume ? `Pick up: ${resume}` : "No resume point yet",
    detail: join(att ? needsLabelOf(att) : "", branch, dec ? plural(dec, "open decision") : ""),
  };
}

/**
 * The per-command summary of a finished call.
 * @param {string} command
 * @param {{ rest: string[], flags: Record<string, string | true> }} args
 * @param {any} body the printed JSON (an envelope, or a hook's own payload), or null
 * @param {string} out the raw printed text
 * @returns {{ title: string, detail: string, tone?: string }}
 */
function summaryOf(command, args, body, out) {
  const data = body && typeof body.data === "object" && body.data ? body.data : body || {};
  const flag = (k) => (typeof args.flags[k] === "string" ? oneLine(/** @type {string} */ (args.flags[k])) : "");
  const action = (args.rest[0] || "").toLowerCase();
  switch (command) {
    case "park":
    case "handoff":
    case "journal": {
      const fromSection = /Resume:\s*(.+)/.exec(str(data.section) ? String(data.section) : "")?.[1];
      const resume = str(data.heartbeat?.handoff?.resume) || flag("resume") || oneLine(fromSection || "");
      const title = flag("title") || str(data.heartbeat?.handoff?.outcome);
      return resume ? { title: `Next: ${resume}`, detail: title } : { title: title || "Saved to the journal", detail: str(data.path) };
    }
    case "attention": {
      const status = flag("status");
      const done = status === "resolved" || status === "dismissed";
      const verb = status && status !== "open" ? status : data.updated ? "updated" : "raised";
      return { title: flag("title") || str(data.title) || str(data.path), detail: join(flag("kind"), verb), tone: done ? "ok" : "warn" };
    }
    case "decide": {
      const status = flag("status");
      return {
        title: flag("title") || str(data.title) || str(data.path),
        detail: status || (data.updated ? "updated" : "recorded"),
        tone: status === "decided" ? "ok" : "info",
      };
    }
    case "note":
      return { title: flag("title") || str(data.title) || str(data.path), detail: data.updated ? "updated" : "saved" };
    case "heartbeat":
    case "status":
    case "brief":
      return standing(data);
    case "where":
      return data.id
        ? { title: `Linked to ${str(data.mode) || "home"} project`, detail: str(data.reason) }
        : { title: "Not linked to a Mental project", detail: str(data.reason), tone: "warn" };
    case "search": {
      const hits = Array.isArray(data.hits) ? data.hits : [];
      const q = str(data.q) || args.rest.join(" ");
      return { title: `${plural(hits.length, "result")}${q ? ` for “${q}”` : ""}`, detail: hits.slice(0, 2).map((h) => str(h?.title)).filter(Boolean).join(" · ") };
    }
    case "list": {
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total ?? items.length) || 0;
      const type = str(data.type) || flag("type");
      const one = type ? type.toLowerCase() : "entry";
      const many = one.endsWith("y") ? `${one.slice(0, -1)}ies` : `${one}s`;
      return { title: plural(total, one, many), detail: items.slice(0, 2).map((x) => str(x?.title)).filter(Boolean).join(" · ") };
    }
    case "show": {
      const fm = data.frontmatter || {};
      return { title: str(fm.title) || str(data.path), detail: join(str(fm.type), str(fm.status)) };
    }
    case "hooks": {
      if (action === "session-start") {
        const host = args.rest[1] === "cursor" || body?.additional_context !== undefined ? "Cursor" : args.rest[1] === "claude-code" || body?.hookSpecificOutput ? "Claude Code" : "";
        const context = body?.additional_context ?? body?.hookSpecificOutput?.additionalContext ?? out;
        return { title: `Session-start hook${host ? ` for ${host}` : ""}`, detail: `${sizeOf(context)} context` };
      }
      if (data.action === "on" || data.action === "off") {
        const written = Array.isArray(data.written) ? data.written : [];
        return { title: `Session-start hooks ${data.action}`, detail: written.length ? join(hostsOf(written), plural(written.length, "file")) : "nothing to change" };
      }
      break;
    }
    case "option": {
      if (Array.isArray(data.optionals)) {
        return { title: data.optionals.map((o) => `${o.id} ${o.enabled ? "on" : "off"}`).join(" · "), detail: "" };
      }
      if (data.feature) {
        const written = Array.isArray(data.written) ? data.written : [];
        return { title: `${data.feature} ${data.enabled ? "on" : "off"}`, detail: written.length ? join(hostsOf(written), plural(written.length, "file")) : "" };
      }
      break;
    }
    case "install": {
      if (!Array.isArray(data.written)) break;
      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      return {
        title: data.written.length ? `Installed · ${plural(data.written.length, "file")} written` : "Up to date",
        detail: join(failed ? `${failed} failed` : "", Array.isArray(data.skipped) && data.skipped.length ? `${data.skipped.length} unchanged` : ""),
        tone: failed ? "danger" : "ok",
      };
    }
    case "doctor": {
      if (!Array.isArray(data.checks)) break;
      const bad = data.checks.filter((c) => c && c.ok === false);
      const errors = bad.filter((c) => c.level === "error").length;
      const okCount = data.checks.length - bad.length;
      const next = str(data.next?.command);
      return bad.length
        ? { title: join(errors ? plural(errors, "error") : "", bad.length - errors ? plural(bad.length - errors, "warning") : "", `${okCount} ok`), detail: str(bad[0]?.message) || next, tone: errors ? "danger" : "warn" }
        : { title: `All ${data.checks.length} checks pass`, detail: next ? `next: ${next}` : "", tone: "ok" };
    }
    case "track": {
      const stopped = Array.isArray(data.stopped) ? data.stopped : null;
      if (stopped) {
        const first = stopped[0] || {};
        return { title: stopped.length ? `Clock stopped · ${str(first.wall) || str(first.live_wall) || "0:00"}` : "No clock running", detail: str(first.title_internal) };
      }
      if (data.status === "running") return { title: data.ensured ? "Clock already running" : "Clock started", detail: str(data.title_internal) };
      if (data.status === "stopped") return { title: `Clock stopped · ${str(data.wall) || "0:00"}`, detail: str(data.title_internal) };
      break;
    }
  }
  const title = receiptTitleOf(out) || (body ? "" : oneLine(out.split(/\r?\n/).find((l) => l.trim()) || ""));
  return { title: title || "Done", detail: "" };
}

/**
 * A card model for a ToolUse of Mental, or null when the row is anything else.
 * @param {{ tool?: string, input?: unknown, output?: unknown, isRunning?: boolean, isErrored?: boolean, isInterrupted?: boolean }} props
 * @returns {{ command: string, kind: string, tone: string, title: string, detail: string, state: "running" | "done" | "failed" } | null}
 */
export function toolCardOf(props) {
  const line = commandOfInput(props?.input);
  const command = mentalCommandOf({ tool: props?.tool, command: line });
  if (!command) return null;
  const args = callArgsOf(line, command);
  const sub = args.rest[0] && /^[a-z][a-z-]*$/.test(args.rest[0]) ? ` ${args.rest[0]}` : "";
  const kind = `mental ${command}${sub}`;
  const raw = /** @type {any} */ (props?.output);
  const out = textOf(raw);
  const err = raw && typeof raw === "object" && typeof raw.stderr === "string" ? raw.stderr : "";
  if (props?.isInterrupted) return { command, kind, tone: "danger", title: "Interrupted", detail: "", state: "failed" };
  if (props?.isRunning || (!out.trim() && !err.trim() && !props?.isErrored)) {
    return { command, kind, tone: "accent", title: "Running…", detail: "", state: "running" };
  }
  const body = jsonOf(out);
  const usage = !body && /\b(error|failed|usage)\b/i.test(out) && out.length < 400;
  if (body?.ok === false || props?.isErrored || usage || (!out.trim() && err.trim())) {
    const e = body?.error;
    const msg = (typeof e === "string" ? e : e?.message) || body?.message || out.trim() || err.trim() || "Failed";
    return { command, kind, tone: "danger", title: oneLine(String(msg)), detail: oneLine(String(e?.hint || e?.code || "")), state: "failed" };
  }
  const s = summaryOf(command, args, body, out);
  return { command, kind, tone: s.tone || "accent", title: s.title, detail: s.detail, state: "done" };
}
