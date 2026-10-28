/**
 * Mental for Claude Code — the in-session panel (Claude Code mods, 2.1.287+).
 *
 * Draws a two-row band above the prompt (resume point, live session pulse,
 * residue counts, context dial, receipts when Mental writes) and a `/mental`
 * pane with Now / Residue / Decisions / Session / Time tabs. On Claude Desktop
 * (and other surfaces that draw `Svg`) the pane is a column of rich cards and a
 * persistent Mental button sits in the prompt footer, and cards can be opened
 * to read journals, decisions and notes (read-only `mental list` / `mental show`).
 * It reads the thread through `mental heartbeat --json --passive` and never
 * writes itself: Park and Hand off send a prompt (Desktop) or fill it (terminal)
 * so the agent records them through the skill. Hide only silences the footer.
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
import { bandDesktop, footerDesktop, needsOf, paneDesktop, toolRowDesktop, visibleNeedsOf } from "./lib/desktop.mjs";
import { toolCardOf } from "./lib/toolcard.mjs";

const PANE_ID = "mental";
const PANE_TITLE = "Mental";
const DOCK_MIN_COLUMNS = 110;
// Sites where the AbovePrompt band draws (the engine raises it on the terminal;
// a Desktop build that raises it too gets the rich band).
const BAND_SURFACES = ["terminal", "desktop"];
// Surfaces that draw `Svg`, so they get the rich cards instead of text rows.
// `mobile` is left alone: the host draws its own.
const RICH_SURFACES = ["desktop", "vscode"];
const DEBOUNCE_MS = 15_000;
const POLL_MS = 60_000;
const FRAME_MS = 600;
// While the pane is open: redraw this often (clocks, "ago"), re-read Mental this often.
const LIVE_MS = 5_000;
const REFRESH_MS = 20_000;
// Cards animate in for this long after the pane opens, then hold still between redraws.
const INTRO_MS = 1_600;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const STORE_TAB_KEY = "tab";
const STORE_OPEN_KEY = "open";
const STORE_DISMISSED_KEY = "dismissed";
const REOPEN_MS = 800;
const NEEDS_FLASH_MS = 7000;
const PARK_PROMPT = "Park this session in Mental";
const HANDOFF_PROMPT = "Hand off this session in Mental";
const TRACK_START_PROMPT = "Start the Mental time clock for this work";
const TRACK_STOP_PROMPT = "Stop the Mental time clock";
const NEEDS_PROMPT =
  "In Mental, list everything that needs me right now (open threads, concerns, decisions). Walk me through them one at a time and help me settle each.";
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

/**
 * Launchers for a Mental command. The plugin ships the CLI (no dependencies),
 * so with a plugin root only that runs; without one, the global install.
 * @param {string} root
 * @param {string[]} tail
 */
export function cliArgvs(root, tail) {
  if (root) return [["node", `${String(root).replace(/[\\/]+$/, "")}/bin/cli.mjs`, ...tail]];
  return [["mental", ...tail], ["mental.cmd", ...tail]];
}

/** The first non-empty line of process output. */
function firstLineOf(text) {
  return (
    String(text || "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) || ""
  );
}

/** @param {string} root */
export function heartbeatArgvs(root) {
  return cliArgvs(root, ["heartbeat", "--json", "--passive"]);
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
 * What `dash.mjs probe` found: any running dashboard serves every project.
 * @param {{ exitCode: number, stdout: string } | null} r
 * @returns {{ state: "running" | "stopped", url: string }}
 */
export function dashProbeOf(r) {
  const got = r && r.exitCode === 0 ? heartbeatOf(r.stdout) : null;
  if (!got || got.serving !== true || typeof got.url !== "string") return { state: "stopped", url: "" };
  return { state: "running", url: got.url };
}

/**
 * The browser address of this project's Today view on a running dashboard.
 * Spelled with `localhost`, the only `http:` host a Desktop `Link` opens.
 * @param {string} url the dashboard root, e.g. `http://127.0.0.1:3847/`
 * @param {string | null} projectId
 */
export function dashHrefOf(url, projectId) {
  if (!url) return "";
  const base = url.replace(/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?=[:/])/, "http://localhost");
  return projectId ? `${base}#/today?p=${encodeURIComponent(projectId)}` : base;
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
  let flashUntil = 0;
  /** @type {string | null} */
  let projectId = null;
  /** @type {{ state: "running" | "starting" | "stopped" | "unknown", url: string, since: number }} */
  let dash = { state: "unknown", url: "", since: 0 };
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
  /** @type {{ cancel: () => void } | null} */
  let live = null;
  let openedAt = 0;
  let lastTryAt = 0;
  let lastSig = "";
  /** Needs the person hid from the footer and band (still shown in the panel). */
  let dismissed = new Set();
  /** @type {any[]} */
  let nav = [];
  /** @type {any} */
  let route = null;
  let routeSeq = 0;

  const nowOf = () => Date.now();

  function redraw() {
    try {
      host?.invalidate();
    } catch {
      /* the session may be gone */
    }
  }

  /** A press handler that never leaves a rejection behind: a failure becomes a toast. */
  function safely(task) {
    return () => {
      Promise.resolve()
        .then(task)
        .catch((err) => {
          try {
            host?.toast(`Mental: ${err instanceof Error ? err.message : String(err)}`);
          } catch {
            /* the session may be gone */
          }
        });
    };
  }

  async function runHeartbeat() {
    let lastError = "";
    for (const argv of heartbeatArgvs(root)) {
      try {
        const init = cwd ? { cwd, timeoutMs: HEARTBEAT_TIMEOUT_MS } : { timeoutMs: HEARTBEAT_TIMEOUT_MS };
        const r = await host.run(argv, init);
        const hb = heartbeatOf(r.stdout);
        if (hb?.ok === false) return { hb: null, error: String(hb.error?.message || hb.error?.code || "Mental reported an error") };
        if (hb) return { hb, error: "" };
        lastError = firstLineOf(r.stderr) || firstLineOf(r.stdout) || `mental exited with code ${r.exitCode}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return { hb: null, error: lastError || "Mental did not answer" };
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
      lastTryAt = nowOf();
      pruneDismissed();
      // Redraw only when something on screen changed, so a refresh never
      // repaints the pane under a scrolling finger.
      const sig = signatureOf();
      if (sig !== lastSig) {
        lastSig = sig;
        redraw();
      }
    }
    if (queued) {
      queued = false;
      void refresh();
    }
  }

  function signatureOf() {
    return JSON.stringify([
      vm,
      error,
      dash.state,
      Math.floor(nowOf() / 60_000),
      route ? [route.view, route.status] : null,
    ], (k, v) => (k === "handoffAge" ? undefined : v));
  }

  /** Forget hidden needs that are gone, so a concern that comes back shows again. */
  function pruneDismissed() {
    if (!dismissed.size || !vm?.linked) return;
    const listed = new Set(needsOf(vm).items.map((x) => x.key));
    const kept = [...dismissed].filter((k) => listed.has(k));
    if (kept.length === dismissed.size) return;
    dismissed = new Set(kept);
    void host?.storeSet(STORE_DISMISSED_KEY, kept).catch(() => undefined);
  }

  /** Hide what the footer and band show now. The panel and Mental keep everything. */
  function dismissNeeds() {
    if (!host || !vm?.linked) return;
    const keys = visibleNeedsOf(vm, dismissed).items.map((x) => x.key);
    if (!keys.length) return;
    dismissed = new Set([...dismissed, ...keys]);
    void host.storeSet(STORE_DISMISSED_KEY, [...dismissed]).catch(() => undefined);
    host.toast("Hidden from the footer — it's still in the Mental panel");
    redraw();
  }

  /** Run a read-only Mental command and return its JSON `data`, or null. */
  async function readMental(tail) {
    for (const argv of cliArgvs(root, tail)) {
      try {
        const init = cwd ? { cwd, timeoutMs: HEARTBEAT_TIMEOUT_MS } : { timeoutMs: HEARTBEAT_TIMEOUT_MS };
        const r = await host.run(argv, init);
        const got = heartbeatOf(r.stdout);
        if (got && got.ok !== false && got.data) return got.data;
        if (got) return null;
      } catch {
        /* try the next launcher */
      }
    }
    return null;
  }

  /** Show a list or an entry in the pane, remembering where we came from. */
  async function go(next) {
    if (!host) return;
    if (route) nav.push(route);
    const seq = ++routeSeq;
    route = { ...next, status: "loading" };
    redraw();
    const data = next.view === "list" ? await readMental(["list", "--json", "--type", next.type]) : await readMental(["show", next.path, "--json"]);
    if (seq !== routeSeq || !route) return;
    if (!data) route = { ...route, status: "error" };
    else if (next.view === "list") route = { ...route, status: "ok", items: Array.isArray(data.items) ? data.items : [], total: data.total ?? data.items?.length ?? 0 };
    else route = { ...route, status: "ok", doc: data };
    redraw();
  }

  function goBack() {
    routeSeq += 1;
    route = nav.pop() || null;
    redraw();
  }

  function clearRoute() {
    routeSeq += 1;
    route = null;
    nav = [];
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
    const next = dashProbeOf(await runDash(["probe"]));
    // While a launch is warming up, "stopped" just means "not yet".
    if (dash.state === "starting" && next.state === "stopped" && nowOf() - dash.since < DASH_STARTING_MS) return;
    dash = { ...next, since: nowOf() };
  }

  /**
   * Open a running dashboard (any project's: it serves them all), or start
   * one when none runs. Where a `Link` is drawn, it opens a running one itself.
   */
  async function onDashboard() {
    if (!host) return;
    if (!root) {
      host.toast("Run `mental dashboard` in a terminal to open it");
      return;
    }
    if (dash.state === "starting") return;
    await probeDash();
    if (dash.state === "running") {
      const href = dashHrefOf(dash.url, projectId);
      const r = await runDash(["open", href]);
      if (!r || r.exitCode !== 0) host.toast(`Open ${href} in your browser`);
      redraw();
      return;
    }
    const r = await runDash(["start"]);
    if (!r || r.exitCode !== 0) {
      host.toast("Couldn't start the dashboard — run `mental dashboard` in a terminal");
      return;
    }
    dash = { state: "starting", url: "", since: nowOf() };
    host.toast("Starting the Mental dashboard — it opens in your browser");
    redraw();
    const recheck = () =>
      host.after(DASH_RECHECK_MS, async () => {
        const before = dash.state;
        await probeDash();
        if (dash.state !== before) redraw();
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
    let opened;
    try {
      opened = await host.open(args);
    } catch {
      return false;
    }
    if (opened && typeof opened === "object" && opened.isPlaced === false) {
      await host.close({ id: PANE_ID }).catch(() => undefined);
      return false;
    }
    isPaneOpen = true;
    rememberOpen(true);
    startLive();
    void refresh();
    redraw();
    return true;
  }

  /** While the pane is open, keep it breathing: redraw often, re-read Mental on a steady beat. */
  function startLive() {
    openedAt = nowOf();
    if (!isRich || live || !host) return;
    live = host.every(LIVE_MS, () => {
      if (!isPaneOpen) return;
      if (!inFlight && nowOf() - Math.max(lastTryAt, openedAt) >= REFRESH_MS) void refresh();
    });
  }

  function stopLive() {
    live?.cancel();
    live = null;
  }

  async function closePane() {
    await host.close({ id: PANE_ID }).catch(() => undefined);
    isPaneOpen = false;
    stopLive();
    clearRoute();
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

  /** A fresh conversation after `/clear`, `/resume` or `/branch`: same timers, new stats. */
  function restartSession() {
    resetSession();
    clearRoute();
    if (host && !poll) poll = host.every(POLL_MS, () => void refresh());
    void refresh();
  }

  /** The session is really over: stop every timer. */
  function teardown() {
    for (const t of [debounce, poll, breath, receiptTimer, live]) t?.cancel();
    debounce = poll = breath = receiptTimer = live = null;
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

  /**
   * Send a request to Claude as the person's own words, so the agent runs it
   * now. Falls back to filling the prompt box when the host won't submit.
   */
  async function send(text, toast) {
    try {
      await host.submit({ text, asUser: true });
      host.toast(toast);
    } catch {
      await fill(text);
    }
  }

  /** The band's "needs you": always bring the pane up, and light the card. */
  async function showNeeds() {
    if (!host) return;
    flashUntil = nowOf() + NEEDS_FLASH_MS;
    clearRoute();
    if (!isPaneOpen) {
      isFullscreen = true;
      await openPane();
    }
    const { items, total } = needsOf(vm);
    if (items.length) {
      const shown = items.slice(0, 2);
      host.toast(`Needs you: ${shown.map((x) => `${x.label} — ${x.title}`).join(" · ")}${total > shown.length ? ` · +${total - shown.length} more` : ""}`);
    }
    redraw();
    host.after(NEEDS_FLASH_MS, () => redraw());
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
      submit: (args) => $.prompt.submit(args),
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
    poll = host.every(POLL_MS, () => void refresh());
    void refresh();
    try {
      const got = await $.session.surfaces();
      if (Array.isArray(got)) for (const surface of got) noteSurface(surface);
    } catch {
      /* older build */
    }
    if (isRich) {
      try {
        const saved = await $.store.get(STORE_DISMISSED_KEY);
        if (Array.isArray(saved)) dismissed = new Set(saved.filter((k) => typeof k === "string"));
      } catch {
        /* no store */
      }
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
        dismissed,
        onDismiss: () => dismissNeeds(),
        modes: Array.isArray(e.props.modes) ? e.props.modes : [],
        onToggle: safely(togglePane),
      },
    );
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (!host || !BAND_SURFACES.includes(e.surface) || e.props.hasSurvey) return next(e);
    noteSurface(e.surface);
    // Coerce first: an absent prop (`undefined`) must not differ from `false`,
    // or every render invalidates and the next render repeats it.
    const working = !!e.props.isWorking;
    if (working !== s.working) setWorking(working);
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
          onNeeds: safely(showNeeds),
          dismissed,
          onDismiss: () => dismissNeeds(),
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
    /** @type {any} */
    const props = e.props;
    // `output` is the stored result; newer builds may name it `result`.
    const model = toolCardOf({ tool: props?.tool, input: props?.input, output: props?.result ?? props?.output });
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
      const { Box, Text, Button, Svg, Link } = await $.ui.resolve(e);
      return paneDesktop(
        { Box, Text, Button, Svg, Link },
        {
          vm,
          s,
          now: nowOf(),
          columns: e.props.bodyColumns,
          updatedAt,
          nextAt: Math.max(lastTryAt, openedAt) + REFRESH_MS,
          intro: nowOf() - openedAt < INTRO_MS && !route,
          cwd,
          log: s.log,
          error,
          dash: { ...dash, href: dash.state === "running" ? dashHrefOf(dash.url, projectId) : "" },
          flash: nowOf() < flashUntil,
          route,
          onOpen: (path) => safely(() => go({ view: "item", path, crumb: "Mental" }))(),
          onOpenItem: (path, title) => safely(() => go({ view: "item", path, title, crumb: route?.view === "list" ? `Mental › ${route.type}` : "Mental" }))(),
          onBrowse: (type) => safely(() => go({ view: "list", type }))(),
          onBack: () => goBack(),
          onPark: safely(() => send(PARK_PROMPT, "Asking Claude to park this session…")),
          onHandoff: safely(() => send(HANDOFF_PROMPT, "Asking Claude to write the hand-off…")),
          onAskNeeds: safely(() => send(NEEDS_PROMPT, "Asking Claude what needs you…")),
          onRefresh: () => {
            host.toast("Refreshing…");
            void refresh();
          },
          onTrackStart: safely(() => send(TRACK_START_PROMPT, "Asking Claude to start the clock…")),
          onTrackStop: safely(() => send(TRACK_STOP_PROMPT, "Asking Claude to stop the clock…")),
          onDashboard: safely(onDashboard),
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
        onPark: safely(() => fill(PARK_PROMPT)),
        onHandoff: safely(() => fill(HANDOFF_PROMPT)),
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
  }).catch(($, e, next) => (next.called ? undefined : { text: "The Mental panel hit an error — try /mental again" }));

  on("ui.close", { id: PANE_ID }, async ($, e, next) => {
    const r = await next(e);
    if (!r || r.deny === undefined) {
      isPaneOpen = false;
      stopLive();
      rememberOpen(false);
      redraw();
    }
    return r;
  }).catch(($, e, next) => next(e));

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
  }).catch(($, e, next) => next(e));

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
  }).catch(($, e, next) => next(e));

  // `/clear`, `/resume` and `/branch` end the conversation, not the session:
  // `session.start` does not fire again, so the timers must survive them.
  on("session.end", ($, e, next) => {
    if (e.reason === "clear" || e.reason === "resume") restartSession();
    else teardown();
    return next(e);
  });
};
