/**
 * Mental for Claude Code — the in-session panel (Claude Code mods, 2.1.287+).
 *
 * Draws a two-row band above the prompt (resume point, live session pulse,
 * residue counts, context dial, receipts when Mental writes) and a `/mental`
 * pane with Now / Residue / Decisions / Session / Time tabs. On Claude Desktop
 * (and other surfaces that draw `Svg`) the pane is a column of rich cards and a
 * persistent Mental button sits in the prompt footer. It reads the
 * thread through `mental heartbeat --json --passive` and never writes: Park
 * and Handoff fill the prompt so the agent records them through the skill.
 *
 * Runs in the mods sandbox: web globals only, no Node, no timers but `$.clock`.
 */

import {
  isWriteCommand,
  mentalCommandOf,
  newSession,
  noteContext,
  noteEdit,
  noteReceipt,
  noteTurnComplete,
  receiptOf,
  viewModelOf,
  EDIT_TOOLS,
  RECEIPT_MS,
} from "./lib/model.mjs";
import { bandView, paneView, TABS } from "./lib/views.mjs";
import { bandDesktop, footerDesktop, paneDesktop, toolRowDesktop } from "./lib/desktop.mjs";
import { toolCardOf } from "./lib/toolcard.mjs";

const PANE_ID = "mental";
const PANE_TITLE = "Mental";
const DOCK_MIN_COLUMNS = 110;
// Sites where the AbovePrompt band draws (the engine raises it on the terminal;
// a Desktop build that raises it too gets the rich band).
const BAND_SURFACES = ["terminal", "desktop"];
// Surfaces that draw `Svg`, so they get the rich cards instead of text rows.
const RICH_SURFACES = ["desktop", "vscode", "mobile"];
const DEBOUNCE_MS = 15_000;
const POLL_MS = 60_000;
const FRAME_MS = 600;
const HEARTBEAT_TIMEOUT_MS = 20_000;
const STORE_TAB_KEY = "tab";
const STORE_OPEN_KEY = "open";
const REOPEN_MS = 800;
const PARK_PROMPT = "Park this session in Mental";
const HANDOFF_PROMPT = "Hand off this session in Mental";
const TRACK_START_PROMPT = "Start the Mental time clock for this work";
const TRACK_STOP_PROMPT = "Stop the Mental time clock";
const DASH_PORT = 3847;
const DASH_URL = `http://localhost:${DASH_PORT}/`;
const DASH_TIMEOUT_MS = 8_000;
const DASH_RECHECK_MS = 2_500;
const DASH_STARTING_MS = 20_000;

const COMMAND_SPEC = {
  name: "mental",
  description: "Toggle the Mental panel: resume point, residue, decisions, this session",
  immediate: true,
};

/** Parse heartbeat stdout (may carry a leading warning line). */
export function heartbeatOf(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

/** @param {string} root */
export function heartbeatArgvs(root) {
  const tail = ["heartbeat", "--json", "--passive"];
  const out = [];
  if (root) out.push(["node", `${String(root).replace(/[\\/]+$/, "")}/bin/cli.mjs`, ...tail]);
  out.push(["mental", ...tail], ["mental.cmd", ...tail]);
  return out;
}

/**
 * argv for the dashboard helper (`claude-mod/dash.mjs`), or null without a plugin root.
 * @param {string} root
 * @param {string[]} args
 */
export function dashArgv(root, args) {
  if (!root) return null;
  return ["node", `${String(root).replace(/[\\/]+$/, "")}/claude-mod/dash.mjs`, ...args];
}

/**
 * What the probe says about port 3847 for this project.
 * @param {{ exitCode: number, stdout: string } | null} r
 * @param {string | null} projectId
 * @returns {"running" | "other" | "stopped"}
 */
export function dashStateOf(r, projectId) {
  if (!r || r.exitCode !== 0) return "stopped";
  const got = heartbeatOf(r.stdout);
  if (!got || got.serving !== true) return "stopped";
  if (projectId && got.id && got.id !== projectId) return "other";
  return "running";
}

/**
 * The engine calls the panel needs, each spelled `$.noun.verb(...)` at its
 * call site (the mods validator forbids holding `$` itself).
 * @typedef {{
 *   run: (argv: string[], init?: object) => Promise<{ exitCode: number, stdout: string, stderr: string }>,
 *   after: (ms: number, fn: () => void) => { cancel: () => void },
 *   every: (ms: number, fn: () => void) => { cancel: () => void },
 *   invalidate: () => void,
 *   open: (args: object) => Promise<unknown>,
 *   close: (args: object) => Promise<unknown>,
 *   fill: (args: object) => Promise<{ isFilled?: boolean } | undefined>,
 *   toast: (text: string) => void,
 *   storeSet: (key: string, value: unknown) => Promise<unknown>,
 * }} Host
 */

/** @type {import('claude-code').Register} */
export const register = (on) => {
  /** @type {Host | null} */
  let host = null;
  let cwd = "";
  let root = "";
  let s = newSession(Date.now());
  /** @type {any} */
  let vm = null;
  let updatedAt = null;
  let error = "";
  let tab = "now";
  let isPaneOpen = false;
  let isFullscreen = false;
  let isRich = false;
  let bandSeen = false;
  /** @type {string | null} */
  let projectId = null;
  /** @type {{ state: "running" | "starting" | "stopped" | "other" | "unknown", url: string, since: number }} */
  let dash = { state: "unknown", url: DASH_URL, since: 0 };
  let frame = 0;
  let inFlight = false;
  let queued = false;
  /** @type {{ cancel: () => void } | null} */
  let debounce = null;
  /** @type {{ cancel: () => void } | null} */
  let poll = null;
  /** @type {{ cancel: () => void } | null} */
  let breath = null;
  /** @type {{ cancel: () => void } | null} */
  let receiptTimer = null;

  const nowOf = () => Date.now();

  function redraw() {
    try {
      host?.invalidate();
    } catch {
      /* the session may be gone */
    }
  }

  async function runHeartbeat() {
    let lastError = "";
    for (const argv of heartbeatArgvs(root)) {
      try {
        const init = cwd ? { cwd, timeoutMs: HEARTBEAT_TIMEOUT_MS } : { timeoutMs: HEARTBEAT_TIMEOUT_MS };
        const r = await host.run(argv, init);
        const hb = heartbeatOf(r.stdout);
        if (hb) return { hb, error: "" };
        lastError = (r.stderr || "").trim().split("\n")[0] || `exit ${r.exitCode}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return { hb: null, error: lastError || "heartbeat failed" };
  }

  async function refresh() {
    if (!host) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      const { hb, error: err } = await runHeartbeat();
      if (hb) {
        vm = viewModelOf(hb, nowOf());
        projectId = typeof hb.data?.id === "string" ? hb.data.id : null;
        error = "";
        updatedAt = nowOf();
      } else {
        error = err;
        if (!vm) vm = { linked: false };
      }
      if (isRich) await probeDash();
    } finally {
      inFlight = false;
      redraw();
    }
    if (queued) {
      queued = false;
      void refresh();
    }
  }

  async function runDash(args) {
    const argv = dashArgv(root, args);
    if (!argv) return null;
    try {
      return await host.run(argv, cwd ? { cwd, timeoutMs: DASH_TIMEOUT_MS } : { timeoutMs: DASH_TIMEOUT_MS });
    } catch {
      return null;
    }
  }

  async function probeDash() {
    if (!root) return;
    const next = dashStateOf(await runDash(["probe", String(DASH_PORT)]), projectId);
    // While a launch is warming up, "stopped" just means "not yet".
    if (dash.state === "starting" && next === "stopped" && nowOf() - dash.since < DASH_STARTING_MS) return;
    dash = { state: next, url: DASH_URL, since: nowOf() };
  }

  /** Open the dashboard if this project's is serving; otherwise start one (it opens the browser). */
  async function onDashboard() {
    if (!host) return;
    if (!root) {
      host.toast("Run `mental dashboard` in a terminal to open it");
      return;
    }
    if (dash.state === "starting") return;
    await probeDash();
    if (dash.state === "running") {
      const r = await runDash(["open", dash.url]);
      if (!r || r.exitCode !== 0) host.toast(`Open ${dash.url} in your browser`);
      redraw();
      return;
    }
    const r = await runDash(["start"]);
    if (!r || r.exitCode !== 0) {
      host.toast("Couldn't start the dashboard — run `mental dashboard` in a terminal");
      return;
    }
    dash = { state: "starting", url: DASH_URL, since: nowOf() };
    host.toast("Starting the Mental dashboard — it opens in your browser");
    redraw();
    const recheck = () =>
      host.after(DASH_RECHECK_MS, async () => {
        await probeDash();
        redraw();
        if (dash.state === "starting") recheck();
      });
    recheck();
  }

  function refreshSoon(delay = DEBOUNCE_MS) {
    if (!host) return;
    debounce?.cancel();
    debounce = host.after(delay, () => {
      debounce = null;
      void refresh();
    });
  }

  function setWorking(isWorking) {
    s.working = isWorking;
    // Rich surfaces animate in SVG; rebuilding their frames each tick would flicker.
    if (isWorking && !breath && host && !isRich) {
      breath = host.every(FRAME_MS, () => {
        frame += 1;
        redraw();
      });
    } else if (!isWorking && breath) {
      breath.cancel();
      breath = null;
    }
    redraw();
  }

  function resetSession() {
    breath?.cancel();
    breath = null;
    s = newSession(nowOf());
    redraw();
  }

  async function openPane() {
    const dialog = !isFullscreen;
    const args = dialog
      ? { id: PANE_ID, title: PANE_TITLE, holdToasts: true, closeOnEscape: true, rows: 18, focus: true }
      : { id: PANE_ID, title: PANE_TITLE, holdToasts: true };
    /** @type {any} */
    const opened = await host.open(args);
    if (opened && typeof opened === "object" && opened.isPlaced === false) {
      await host.close({ id: PANE_ID }).catch(() => undefined);
      return false;
    }
    isPaneOpen = true;
    rememberOpen(true);
    void refresh();
    redraw();
    return true;
  }

  async function closePane() {
    await host.close({ id: PANE_ID }).catch(() => undefined);
    isPaneOpen = false;
    rememberOpen(false);
    redraw();
  }

  function rememberOpen(isOpen) {
    if (!isRich) return;
    void host?.storeSet(STORE_OPEN_KEY, isOpen).catch(() => undefined);
  }

  /** The footer button and the band button: open the docked pane, or hide it. */
  async function togglePane() {
    if (!host) return;
    if (isPaneOpen) {
      await closePane();
      return;
    }
    isFullscreen = true;
    const ok = await openPane();
    if (!ok) host.toast("Claude couldn't place the Mental panel — widen the window and try again");
  }

  /** Read once per draw: the surface tells us whether Svg cards are available. */
  function noteSurface(surface) {
    if (!isRich && RICH_SURFACES.includes(surface)) {
      isRich = true;
      isFullscreen = true;
      breath?.cancel();
      breath = null;
    }
  }

  async function fill(text) {
    try {
      const r = await host.fill({ text, mode: "replace" });
      if (r && r.isFilled === false) {
        host.toast(`Type: ${text}`);
        return;
      }
      if (!isFullscreen && isPaneOpen) await closePane();
      host.toast("Press Enter to send — the agent records it in Mental");
    } catch {
      host.toast(`Type: ${text}`);
    }
  }

  on("session.start", async ($, e, next) => {
    host = {
      run: (argv, init) => $.process.run(argv, init),
      after: (ms, fn) => $.clock.after(ms, fn),
      every: (ms, fn) => $.clock.every(ms, fn),
      invalidate: () => $.ui.invalidate("ui.render"),
      open: (args) => $.ui.open(args),
      close: (args) => $.ui.close(args),
      fill: (args) => $.prompt.fill(args),
      toast: (text) => $.ui.toast(text),
      storeSet: (key, value) => $.store.set(key, value),
    };
    cwd = e.cwd || "";
    root = typeof $.plugin.root === "string" ? $.plugin.root : "";
    s = newSession(nowOf());
    try {
      const saved = await $.store.get(STORE_TAB_KEY);
      if (typeof saved === "string" && TABS.some((t) => t.id === saved)) tab = saved;
    } catch {
      /* no store */
    }
    try {
      await $.command.register(COMMAND_SPEC);
    } catch {
      /* a built-in or another plugin holds /mental; the band still works */
    }
    poll?.cancel();
    poll = $.clock.every(POLL_MS, () => void refresh());
    void refresh();
    try {
      const got = await $.session.surfaces();
      if (Array.isArray(got)) for (const surface of got) noteSurface(surface);
    } catch {
      /* older build */
    }
    if (isRich) {
      try {
        if ((await $.store.get(STORE_OPEN_KEY)) === true) {
          $.clock.after(REOPEN_MS, () => void openPane().catch(() => undefined));
        }
      } catch {
        /* no store */
      }
    }
    return next(e);
  });

  on("ui.render", { component: "SessionMode" }, async ($, e, next) => {
    if (!host || !RICH_SURFACES.includes(e.surface)) return next(e);
    noteSurface(e.surface);
    const { Box, Text, Button, Svg } = await $.ui.resolve(e);
    return footerDesktop(
      { Box, Text, Button, Svg },
      {
        vm,
        s,
        now: nowOf(),
        isOpen: isPaneOpen,
        bandSeen,
        modes: Array.isArray(e.props.modes) ? e.props.modes : [],
        onToggle: () => void togglePane(),
      },
    );
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (!host || !BAND_SURFACES.includes(e.surface) || e.props.hasSurvey) return next(e);
    noteSurface(e.surface);
    if (e.props.isWorking !== s.working) setWorking(!!e.props.isWorking);
    if (isRich) {
      bandSeen = true;
      const { Box, Text, Button, Svg } = await $.ui.resolve(e);
      return bandDesktop(
        { Box, Text, Button, Svg },
        {
          vm,
          s,
          now: nowOf(),
          columns: e.props.bodyColumns,
          maxRows: Math.min(2, e.props.maxRows || 2),
          onNeeds: () => {
            if (!isPaneOpen) void togglePane();
          },
        },
      );
    }
    const { Box, Text, Button } = await $.ui.resolve(e);
    return bandView(
      { Box, Text, Button },
      {
        vm,
        s,
        now: nowOf(),
        columns: e.props.bodyColumns,
        maxRows: Math.min(2, e.props.maxRows || 2),
        frame,
      },
    );
  });

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    if (!RICH_SURFACES.includes(e.surface)) return next(e);
    const model = toolCardOf({ input: e.props?.input, output: e.props?.output });
    if (!model) return next(e);
    try {
      const { Box, Svg } = await $.ui.resolve(e);
      if (!Svg) return next(e);
      return toolRowDesktop({ Box, Svg }, { model, theme: "auto" }) || next(e);
    } catch {
      return next(e);
    }
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || !host) return next(e);
    noteSurface(e.surface);
    if (isRich) {
      const { Box, Text, Button, Svg } = await $.ui.resolve(e);
      return paneDesktop(
        { Box, Text, Button, Svg },
        {
          vm,
          s,
          now: nowOf(),
          columns: e.props.bodyColumns,
          updatedAt,
          cwd,
          log: s.log,
          error,
          dash,
          onPark: () => void fill(PARK_PROMPT),
          onHandoff: () => void fill(HANDOFF_PROMPT),
          onRefresh: () => void refresh(),
          onTrackStart: () => void fill(TRACK_START_PROMPT),
          onTrackStop: () => void fill(TRACK_STOP_PROMPT),
          onDashboard: () => void onDashboard(),
        },
      );
    }
    const { Box, Text, Button } = await $.ui.resolve(e);
    return paneView(
      { Box, Text, Button },
      {
        vm,
        s,
        now: nowOf(),
        columns: e.props.bodyColumns,
        rows: e.props.scroll?.bodyRows,
        tab,
        updatedAt,
        error,
        cwd,
        onTab: (id) => {
          tab = id;
          void host.storeSet(STORE_TAB_KEY, id).catch(() => undefined);
          redraw();
        },
        onPark: () => void fill(PARK_PROMPT),
        onHandoff: () => void fill(HANDOFF_PROMPT),
        onRefresh: () => void refresh(),
      },
    );
  });

  on("command.run", { command: "mental" }, async ($, e, next) => {
    if (!host) return next(e);
    /** @type {string[]} */
    let surfaces = [];
    try {
      const got = await $.session.surfaces();
      if (Array.isArray(got)) surfaces = got;
    } catch {
      /* older build: treat as terminal */
    }
    // The Desktop app always docks a pane beside the transcript; `presentation`
    // describes a terminal there, so its width is not the app's.
    const inDesktop = surfaces.includes("desktop");
    for (const surface of surfaces) noteSurface(surface);
    isFullscreen = inDesktop || !!e.presentation?.isFullscreen;
    const columns = inDesktop ? 0 : Number(e.presentation?.columns) || 0;
    if (isPaneOpen) {
      await closePane();
      return isFullscreen && !inDesktop ? { text: "Mental panel hidden" } : {};
    }
    if (isFullscreen && columns && columns < DOCK_MIN_COLUMNS) {
      return { text: `Widen the terminal to ${DOCK_MIN_COLUMNS}+ columns to dock the Mental panel` };
    }
    const ok = await openPane();
    if (!ok) {
      return {
        text: inDesktop
          ? "Claude couldn't place the Mental panel — widen the window and try /mental again"
          : `Widen the terminal to ${DOCK_MIN_COLUMNS}+ columns to dock the Mental panel`,
      };
    }
    return isFullscreen && !inDesktop ? { text: "Mental panel shown" } : {};
  });

  on("ui.close", { id: PANE_ID }, async ($, e, next) => {
    const r = await next(e);
    if (!r || r.deny === undefined) {
      isPaneOpen = false;
      rememberOpen(false);
      redraw();
    }
    return r;
  });

  on("command.run", { command: ["clear", "resume"] }, async ($, e, next) => {
    const r = await next(e);
    resetSession();
    void refresh();
    return r;
  });

  on("turn.start", ($, e, next) => {
    setWorking(true);
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    noteTurnComplete(s);
    setWorking(false);
    refreshSoon();
    return r;
  });

  on("session.measure", ($, e, next) => {
    noteContext(s, e.context);
    redraw();
    return next(e);
  });

  on("session.compact", async ($, e, next) => {
    s.compacting = true;
    redraw();
    try {
      return await next(e);
    } finally {
      s.compacting = false;
      redraw();
    }
  });

  on("tool.call", async ($, e, next) => {
    const r = await next(e);
    try {
      /** @type {any} */
      const call = e;
      if (EDIT_TOOLS.has(call.tool) && !r?.deny && !r?.isError) {
        noteEdit(s, String(call.file_path || call.notebook_path || ""));
        redraw();
      }
      const command = mentalCommandOf({ tool: call.tool, command: call.command });
      if (command && isWriteCommand(command) && !r?.deny) {
        const receipt = receiptOf(command, r, nowOf());
        if (receipt) {
          noteReceipt(s, receipt);
          if (command === "park" || command === "handoff" || command === "journal") {
            s.edits = 0;
            s.files = new Map();
          }
          receiptTimer?.cancel();
          receiptTimer = $.clock.after(RECEIPT_MS + 50, () => {
            receiptTimer = null;
            redraw();
          });
        }
        refreshSoon(1500);
        redraw();
      }
    } catch {
      /* never break a tool call over the panel */
    }
    return r;
  });

  on("session.end", ($, e, next) => {
    for (const t of [debounce, poll, breath, receiptTimer]) t?.cancel();
    debounce = poll = breath = receiptTimer = null;
    return next(e);
  });
};
