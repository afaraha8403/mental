import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ageOf,
  barOf,
  clip,
  clockOf,
  dialOf,
  fitSegments,
  handoffMsOf,
  relPathOf,
  sparklineOf,
  wrapLines,
} from "../claude-mod/lib/format.mjs";
import {
  bandStateOf,
  isWriteCommand,
  mentalCommandOf,
  newSession,
  noteContext,
  noteEdit,
  noteTurnComplete,
  receiptOf,
  receiptTitleOf,
  topFiles,
  viewModelOf,
  RECEIPT_MS,
} from "../claude-mod/lib/model.mjs";
import { bandView, paneView, TABS } from "../claude-mod/lib/views.mjs";
import { heartbeatArgvs, heartbeatOf, register } from "../claude-mod/mental-mod.mjs";

// Fake element constructors: plain `{ type, props }` trees, like `$.ui.resolve(e)`.
const el = {
  Box: (props) => ({ type: "Box", props }),
  Text: (props) => ({ type: "Text", props }),
  Button: (props) => ({ type: "Button", props }),
};

const ALLOWED = {
  Box: new Set(["flexDirection", "justifyContent", "width", "gap", "flexGrow", "children"]),
  Text: new Set(["color", "bold", "italic", "wrap", "children"]),
  Button: new Set(["key", "label", "hotkey", "plain", "dimColor", "onPress"]),
};

/** Walk a tree, asserting every prop is allowlisted and typed as the Mods API wants. */
function walk(node, visit) {
  if (node == null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node);
  walk(node.props.children, visit);
}

function assertValidTree(tree) {
  const keys = new Set();
  walk(tree, (node) => {
    assert.ok(ALLOWED[node.type], `unknown element ${node.type}`);
    for (const [k, v] of Object.entries(node.props)) {
      assert.ok(ALLOWED[node.type].has(k), `${node.type} has unknown prop ${k}`);
      if (k === "plain") assert.equal(v, true, "Button plain must be `true` or absent");
      if (k === "wrap") assert.equal(v, "truncate-end");
      if (k === "hotkey") assert.match(v, /^[a-z0-9]$/);
    }
    if (node.type === "Button") {
      assert.equal(typeof node.props.key, "string");
      assert.ok(!keys.has(node.props.key), `duplicate Button key ${node.props.key}`);
      keys.add(node.props.key);
      assert.equal(typeof node.props.onPress, "function");
    }
  });
  return keys;
}

function textOf(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node.type === "Box" && node.props.flexDirection === "column") {
    return [node.props.children].flat(Infinity).map(textOf).filter(Boolean).join("\n");
  }
  return textOf(node.props.children);
}

const NOW = new Date(2026, 4, 12, 15, 0).getTime();

function heartbeat(overrides = {}) {
  return {
    ok: true,
    data: {
      id: "mental",
      git: { branch: "feat/panel", dirty: true, porcelain: " M a.mjs\n?? b.mjs\n", recent: ["abc1234 Add panel", "def5678 Fix band"] },
      handoff: {
        resume: "Wire the band into session.start",
        outcome: "Views drafted",
        when: { date: "2026-05-12", time: "14:20" },
        via: "claude-code",
      },
      attention: [{ title: "Verify docked pane at 110 cols", kind: "verify", status: "open" }],
      attentionCount: 1,
      openDecisions: [{ title: "Band height: 2 rows" }],
      openDecisionCount: 1,
      needsEyes: [],
      needsEyesCount: 0,
      guardrails: [{ title: "Never write from the panel" }],
      guardrailCount: 1,
      hopsToday: 3,
      delta: { writes: 2, attention: 1, decisions: 0, parks: 0 },
      track: { enabled: false },
      ...overrides,
    },
  };
}

test("format helpers", () => {
  assert.equal(clip("hello world", 6), "hello…");
  assert.equal(clip("  a \n b ", 10), "a b");
  assert.equal(ageOf(5_000), "now");
  assert.equal(ageOf(90_000), "1m");
  assert.equal(ageOf(3 * 3600_000), "3h");
  assert.equal(ageOf(72 * 3600_000), "3d");
  assert.equal(clockOf(75 * 60_000), "1:15");
  assert.equal(dialOf(0), "○");
  assert.equal(dialOf(60), "◑");
  assert.equal(dialOf(100), "●");
  assert.equal(barOf(50, 10), "━━━━━┄┄┄┄┄");
  assert.equal(sparklineOf([0, 4, 8], 8), "▁▅█");
  assert.equal(sparklineOf([0, 0], 8), "▁▁");
  assert.equal(relPathOf("C:\\repo\\src\\a.mjs", "C:\\repo"), "src/a.mjs");
  assert.equal(relPathOf("/elsewhere/a.mjs", "/repo"), "/elsewhere/a.mjs");
  assert.equal(handoffMsOf({ when: { date: "2026-05-12", time: "14:20" } }), new Date(2026, 4, 12, 14, 20).getTime());
  assert.equal(handoffMsOf({ when: {} }), null);
  const lines = wrapLines("one two three four five six", 9, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(lines.every((l) => l.length <= 9));
});

test("fitSegments drops lowest priority first and keeps order", () => {
  const segs = [
    { text: "aaaa", priority: 3 },
    { text: "bbbb", priority: 1 },
    { text: "cccc", priority: 9 },
  ];
  assert.deepEqual(
    fitSegments(segs, 10).map((s) => s.text),
    ["aaaa", "cccc"],
  );
  assert.deepEqual(
    fitSegments(segs, 4).map((s) => s.text),
    ["cccc"],
  );
  assert.equal(fitSegments(segs, 100).length, 3);
});

test("mentalCommandOf reads MCP, Bash, npx and node cli calls", () => {
  assert.equal(mentalCommandOf({ tool: "mcp__mental__park" }), "park");
  assert.equal(mentalCommandOf({ tool: "mcp__plugin_mental_mental__decide" }), "decide");
  assert.equal(mentalCommandOf({ tool: "mcp__github__park" }), null);
  assert.equal(mentalCommandOf({ tool: "Bash", command: "mental handoff --json --title x" }), "handoff");
  assert.equal(mentalCommandOf({ tool: "Bash", command: "cd x && npx -y @balacode/mental note --json" }), "note");
  assert.equal(mentalCommandOf({ tool: "PowerShell", command: "node bin/cli.mjs heartbeat --json" }), "heartbeat");
  assert.equal(mentalCommandOf({ tool: "Bash", command: "echo mentality" }), null);
  assert.equal(mentalCommandOf({ tool: "Edit", command: "mental park" }), null);
  assert.ok(isWriteCommand("park"));
  assert.ok(!isWriteCommand("heartbeat"));
  assert.ok(!isWriteCommand(null));
});

test("receipts come from successful writes only", () => {
  const text = JSON.stringify({ ok: true, data: { decision: { title: "Use mods, not MCP" } } });
  assert.equal(receiptTitleOf(text), "Use mods, not MCP");
  assert.equal(receiptTitleOf("not json"), "");
  const r = receiptOf("decide", { text }, NOW);
  assert.equal(r.label, "Decision");
  assert.equal(r.title, "Use mods, not MCP");
  assert.equal(r.at, NOW);
  assert.equal(receiptOf("decide", { text, isError: true }, NOW), null);
  assert.equal(receiptOf("decide", { text: '{"ok": false}' }, NOW), null);
  assert.equal(receiptOf("heartbeat", { text }, NOW), null);
});

test("viewModelOf maps heartbeat and handles unlinked folders", () => {
  assert.deepEqual(viewModelOf({ ok: true, data: { id: null } }, NOW), { linked: false });
  assert.deepEqual(viewModelOf(null, NOW), { linked: false });
  const vm = viewModelOf(heartbeat(), NOW);
  assert.equal(vm.linked, true);
  assert.equal(vm.branch, "feat/panel");
  assert.equal(vm.changed, 2);
  assert.equal(vm.resume, "Wire the band into session.start");
  assert.equal(vm.handoffAge, 40 * 60_000);
  assert.equal(vm.attentionCount, 1);
  assert.equal(vm.decisionCount, 1);
  assert.equal(vm.track, null);
  const tracked = viewModelOf(
    heartbeat({
      track: {
        enabled: true,
        runningCount: 1,
        staleCount: 0,
        focusedId: "t1",
        running: [{ id: "t1", started: new Date(NOW - 30 * 60_000).toISOString(), stale: false }],
      },
    }),
    NOW,
  );
  assert.equal(tracked.track.startedAt, NOW - 30 * 60_000);
});

test("session stats and band state priority", () => {
  const s = newSession(NOW);
  const vm = viewModelOf(heartbeat(), NOW);
  assert.equal(bandStateOf(null, s, NOW), "loading");
  assert.equal(bandStateOf({ linked: false }, s, NOW), "absent");
  assert.equal(bandStateOf(vm, s, NOW), "calm");
  assert.equal(bandStateOf({ ...vm, handoffAge: 60_000 }, s, NOW), "fresh");
  s.working = true;
  assert.equal(bandStateOf(vm, s, NOW), "working");
  noteContext(s, { tokens: 160_000, window: 200_000 });
  assert.equal(s.context.percent, 80);
  assert.equal(bandStateOf(vm, s, NOW), "pressure");
  s.receipt = { kind: "park", label: "Parked", tone: "violet", glyph: "◆", title: "", at: NOW };
  assert.equal(bandStateOf(vm, s, NOW), "receipt");
  assert.notEqual(bandStateOf(vm, s, NOW + RECEIPT_MS + 1), "receipt");
  s.compacting = true;
  assert.equal(bandStateOf(vm, s, NOW), "compacting");

  const t = newSession(NOW);
  noteEdit(t, "a.mjs");
  noteEdit(t, "a.mjs");
  noteEdit(t, "b.mjs");
  noteEdit(t, "");
  noteTurnComplete(t);
  assert.equal(t.edits, 3);
  assert.deepEqual(t.perTurn, [3]);
  assert.equal(t.editsThisTurn, 0);
  assert.deepEqual(topFiles(t, 1), [{ path: "a.mjs", count: 2 }]);
});

test("bandView: valid props, fits width, covers every state", () => {
  const vm = viewModelOf(heartbeat(), NOW);
  const cases = [
    [null, newSession(NOW)],
    [{ linked: false }, newSession(NOW)],
    [vm, newSession(NOW)],
    [{ ...vm, handoffAge: 1000 }, newSession(NOW)],
    [vm, { ...newSession(NOW), working: true, perTurn: [1, 3, 0], turns: 3 }],
    [vm, { ...newSession(NOW), edits: 40 }],
    [vm, { ...newSession(NOW), compacting: true }],
    [vm, { ...newSession(NOW), receipt: { kind: "note", label: "Note", tone: "green", glyph: "○", title: "x", at: NOW } }],
  ];
  for (const [v, s] of cases) {
    for (const columns of [24, 80, 200]) {
      const tree = bandView(el, { vm: v, s, now: NOW, columns, maxRows: 2, frame: 1 });
      assertValidTree(tree);
      const rows = textOf(tree).split("\n").filter(Boolean);
      assert.ok(rows.length >= 1 && rows.length <= 2);
      if (columns >= 80) for (const row of rows) assert.ok(row.length <= columns, `row too wide: ${row}`);
    }
  }
  const calm = textOf(bandView(el, { vm, s: newSession(NOW), now: NOW, columns: 120 }));
  assert.match(calm, /◆ mental/);
  assert.match(calm, /Wire the band into session\.start/);
  assert.match(calm, /\/mental/);
  const one = bandView(el, { vm, s: newSession(NOW), now: NOW, columns: 120, maxRows: 1 });
  assert.equal(textOf(one).split("\n").filter(Boolean).length, 1);
});

test("paneView: every tab draws valid props with keyed buttons", () => {
  const vm = viewModelOf(
    heartbeat({
      needsEyes: [{ title: "Check the docked width" }],
      needsEyesCount: 1,
      track: { enabled: true, runningCount: 1, focusedId: "t", running: [{ id: "t", started: new Date(NOW - 3600_000).toISOString() }], unclocked: true },
    }),
    NOW,
  );
  const s = newSession(NOW - 30 * 60_000);
  noteEdit(s, "C:/repo/claude-mod/a.mjs");
  noteTurnComplete(s);
  noteContext(s, { percent: 42 });
  let tabbed = null;
  for (const t of TABS) {
    const tree = paneView(el, {
      vm,
      s,
      now: NOW,
      columns: 100,
      rows: 20,
      tab: t.id,
      updatedAt: NOW - 5000,
      cwd: "C:/repo",
      onTab: (id) => (tabbed = id),
      onPark() {},
      onHandoff() {},
      onRefresh() {},
    });
    const keys = assertValidTree(tree);
    for (const k of ["park", "handoff", "refresh", ...TABS.map((x) => `tab-${x.id}`)]) assert.ok(keys.has(k), k);
    assert.ok(textOf(tree).split("\n").filter(Boolean).length <= 20 + 2);
  }
  const now = textOf(paneView(el, { vm, s, now: NOW, columns: 100, rows: 30, tab: "now", updatedAt: NOW, onTab() {}, onPark() {}, onHandoff() {}, onRefresh() {} }));
  assert.match(now, /RESUME/);
  assert.match(now, /NEEDS EYES/);
  assert.match(now, /feat\/panel/);
  const session = textOf(paneView(el, { vm, s, now: NOW, columns: 100, rows: 30, tab: "session", updatedAt: NOW, cwd: "C:/repo", onTab() {}, onPark() {}, onHandoff() {}, onRefresh() {} }));
  assert.match(session, /claude-mod\/a\.mjs/);
  const time = textOf(paneView(el, { vm, s, now: NOW, columns: 100, rows: 30, tab: "time", updatedAt: NOW, onTab() {}, onPark() {}, onHandoff() {}, onRefresh() {} }));
  assert.match(time, /1:00/);

  const tree = paneView(el, { vm, s, now: NOW, columns: 100, rows: 20, tab: "now", updatedAt: NOW, onTab: (id) => (tabbed = id), onPark() {}, onHandoff() {}, onRefresh() {} });
  let pressed = false;
  walk(tree, (n) => {
    if (!pressed && n.type === "Button" && n.props.key === "tab-decisions") {
      n.props.onPress();
      pressed = true;
    }
  });
  assert.equal(tabbed, "decisions");

  for (const v of [null, { linked: false }]) {
    assertValidTree(paneView(el, { vm: v, s, now: NOW, columns: 60, rows: 10, tab: "now", updatedAt: null, onTab() {}, onPark() {}, onHandoff() {}, onRefresh() {} }));
  }
});

test("heartbeat argv and stdout parsing", () => {
  assert.deepEqual(heartbeatArgvs("/p/mental/")[0], ["node", "/p/mental/bin/cli.mjs", "heartbeat", "--json", "--passive"]);
  assert.equal(heartbeatArgvs("")[0][0], "mental");
  assert.deepEqual(heartbeatOf('warn: x\n{"ok":true,"data":{"id":"m"}}'), { ok: true, data: { id: "m" } });
  assert.equal(heartbeatOf("nope"), null);
  assert.equal(heartbeatOf("{broken"), null);
});

/** A fake engine: collects hooks, records `$` calls, runs timers by hand. */
function fakeEngine({ hb = heartbeat(), fail = false, surfaces } = {}) {
  const hooks = [];
  const calls = [];
  const timers = [];
  const on = (event, matcher, fn) => hooks.push({ event, matcher: fn ? matcher : null, fn: fn || matcher });
  register(on);
  const $ = {
    plugin: { root: "/plugins/mental" },
    ...(surfaces ? { session: { surfaces: async () => surfaces } } : {}),
    clock: {
      after: (ms, fn) => {
        const t = { ms, fn, once: true, cancelled: false, cancel: () => (t.cancelled = true) };
        timers.push(t);
        return t;
      },
      every: (ms, fn) => {
        const t = { ms, fn, once: false, cancelled: false, cancel: () => (t.cancelled = true) };
        timers.push(t);
        return t;
      },
    },
    process: {
      run: async (argv, init) => {
        calls.push(["run", argv, init]);
        if (fail) throw new Error("ENOENT");
        return { exitCode: 0, stdout: JSON.stringify(hb), stderr: "" };
      },
    },
    store: { get: async () => "decisions", set: async (k, v) => calls.push(["store.set", k, v]) },
    command: { register: async (spec) => calls.push(["register", spec]) },
    ui: {
      invalidate: () => calls.push(["invalidate"]),
      resolve: async () => el,
      open: async (args) => calls.push(["open", args]),
      close: async (args) => calls.push(["close", args]),
      toast: (text) => calls.push(["toast", text]),
    },
    prompt: { fill: async (args) => (calls.push(["fill", args]), { isFilled: true }) },
  };
  const matches = (h, event, e) => {
    if (h.event !== event) return false;
    if (!h.matcher) return true;
    return Object.entries(h.matcher).every(([k, v]) => {
      const actual = k === "component" ? e.component : k === "command" ? e.command : k === "id" ? e.id : e[k];
      return Array.isArray(v) ? v.includes(actual) : v === actual;
    });
  };
  async function fire(event, e, result = {}) {
    const chain = hooks.filter((h) => matches(h, event, e));
    const run = async (i, input) => (i < chain.length ? chain[i].fn($, input, (x) => run(i + 1, x)) : result);
    return run(0, e);
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { hooks, calls, timers, fire, flush };
}

test("register wires session.start, band, pane, receipts and cleanup", async () => {
  const eng = fakeEngine();
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const register = eng.calls.find((c) => c[0] === "register");
  assert.equal(register[1].name, "mental");
  const run = eng.calls.find((c) => c[0] === "run");
  assert.deepEqual(run[1], ["node", "/plugins/mental/bin/cli.mjs", "heartbeat", "--json", "--passive"]);
  assert.equal(run[2].cwd, "/repo");
  assert.ok(eng.timers.some((t) => !t.once && t.ms === 60_000), "polls every minute");

  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  assertValidTree(band);
  assert.match(textOf(band), /Wire the band/);

  const survey = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: true, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  assert.equal(survey, "PASSED");
  const other = await eng.fire("ui.render", { component: "Pane", requestId: "diff", surface: "terminal", props: {} }, "PASSED");
  assert.equal(other, "PASSED");

  const cmd = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  assert.deepEqual(cmd, {});
  const open = eng.calls.find((c) => c[0] === "open");
  assert.equal(open[1].id, "mental");
  assert.equal(open[1].focus, true);

  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "terminal", props: { bodyColumns: 100, scroll: { bodyRows: 16 } } });
  assertValidTree(pane);
  assert.match(textOf(pane), /OPEN · 1/, "stored tab (decisions) restored");

  const narrow = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: true, columns: 90 } });
  assert.ok(eng.calls.some((c) => c[0] === "close"), "second /mental closes the pane");
  assert.ok(narrow.text);

  const tooNarrow = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: true, columns: 90 } });
  assert.match(tooNarrow.text, /110\+ columns/);

  await eng.fire("tool.call", { tool: "Edit", file_path: "/repo/a.mjs" }, { text: "ok" });
  const receiptText = JSON.stringify({ ok: true, data: { handoff: { resume: "Test on 2.1.287" } } });
  await eng.fire("tool.call", { tool: "Bash", command: "mental handoff --json" }, { text: receiptText });
  const after = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  assert.match(textOf(after), /Handed off › Test on 2\.1\.287/);
  assert.ok(eng.timers.some((t) => t.once && t.ms === 1500), "refreshes soon after a write");

  await eng.fire("session.end", {});
  assert.ok(eng.timers.filter((t) => !t.once).every((t) => t.cancelled), "intervals cancelled at session end");
});

test("Claude Desktop: band draws and /mental docks a side pane", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  assert.notEqual(band, "PASSED", "band renders on the desktop surface");
  assertValidTree(band);
  const mobile = await eng.fire("ui.render", { component: "AbovePrompt", surface: "mobile", props: { hasSurvey: false, maxRows: 4, bodyColumns: 60 } }, "PASSED");
  assert.equal(mobile, "PASSED");

  // Desktop sends a terminal-shaped presentation; the mod must still dock.
  const cmd = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  assert.equal(cmd.text, "Mental panel shown");
  const open = eng.calls.find((c) => c[0] === "open");
  assert.equal(open[1].id, "mental");
  assert.equal(open[1].rows, undefined, "docked, not a dialog");
  assert.equal(open[1].closeOnEscape, undefined);

  await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48, scroll: { bodyRows: 40 } } });
  await eng.fire("tool.call", { tool: "Edit", file_path: "/repo/a.mjs" }, { text: "ok" });
  const hidden = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  assert.equal(hidden.text, "Mental panel hidden");
  assert.doesNotMatch(JSON.stringify(eng.calls), /Widen the terminal/);
});

test("register degrades when heartbeat cannot run", async () => {
  const eng = fakeEngine({ fail: true });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  assert.equal(eng.calls.filter((c) => c[0] === "run").length, 3, "tries node cli, mental, mental.cmd");
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  assert.match(textOf(band), /not linked here/);
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "terminal", props: { bodyColumns: 100, scroll: { bodyRows: 16 } } });
  assert.match(textOf(pane), /heartbeat failed/);
});
