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
  Svg: (props) => ({ type: "Svg", props }),
};

// Mirrors BoxProps / TextProps / ButtonProps / SvgProps in the Mods types: Text and Svg take no `key`.
const ALLOWED = {
  Box: new Set(["key", "flexDirection", "justifyContent", "alignItems", "width", "gap", "flexGrow", "flexShrink", "paddingX", "paddingY", "backgroundColor", "children"]),
  Text: new Set(["color", "bold", "italic", "dimColor", "wrap", "children"]),
  Button: new Set(["key", "label", "hotkey", "plain", "dimColor", "onPress"]),
  Svg: new Set(["source", "alt", "width", "height", "isInteractive"]),
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
      if (k === "isInteractive") assert.equal(v, true, "Svg isInteractive must be `true` or absent");
    }
    if (node.type === "Svg") {
      assert.ok(node.props.alt, "Svg needs alt");
      assert.match(node.props.source, /^<svg[\s\S]*<\/svg>$/);
      assert.ok(node.props.source.length <= 131072, "Svg source within the 131072-char cap");
      assert.doesNotMatch(node.props.source, /<script|\son[a-z]+=/i, "no script or handlers");
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
  if (node.type === "Svg") return node.props.alt;
  if (node.type === "Button") return node.props.label;
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
function fakeEngine({ hb = heartbeat(), fail = false, surfaces, store = {}, dashId = null, submitFails = false } = {}) {
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
        if (String(argv[1]).endsWith("dash.mjs")) {
          if (argv[2] === "probe") {
            const serving = dashId != null;
            return { exitCode: 0, stdout: JSON.stringify({ serving, id: dashId, url: "http://localhost:3847/" }), stderr: "" };
          }
          return { exitCode: 0, stdout: "{}", stderr: "" };
        }
        if (argv.includes("list")) {
          const items = [
            { path: "decisions/a.md", type: "Decision", title: "Use SQLite", description: "why", status: "accepted", tags: [] },
            { path: "decisions/b.md", type: "Decision", title: "Skip cache", description: "", status: "open", tags: [] },
          ];
          return { exitCode: 0, stdout: JSON.stringify({ ok: true, data: { items, total: 2 } }), stderr: "" };
        }
        if (argv.includes("show")) {
          const data = { path: argv[argv.indexOf("show") + 1], frontmatter: { type: "Decision", title: "Use SQLite", status: "accepted" }, body: "# Use SQLite\n\n- fast\n- local\n", backlinks: [] };
          return { exitCode: 0, stdout: JSON.stringify({ ok: true, data }), stderr: "" };
        }
        return { exitCode: 0, stdout: JSON.stringify(hb), stderr: "" };
      },
    },
    store: {
      get: async (k) => (k in store ? store[k] : "decisions"),
      set: async (k, v) => calls.push(["store.set", k, v]),
    },
    command: { register: async (spec) => calls.push(["register", spec]) },
    ui: {
      invalidate: () => calls.push(["invalidate"]),
      resolve: async () => el,
      open: async (args) => calls.push(["open", args]),
      close: async (args) => calls.push(["close", args]),
      toast: (text) => calls.push(["toast", text]),
    },
    prompt: {
      fill: async (args) => (calls.push(["fill", args]), { isFilled: true }),
      submit: async (args) => {
        if (submitFails) throw new Error("not idle");
        calls.push(["submit", args]);
      },
    },
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

test("Claude Desktop: footer opener, rich card pane, silent /mental, remembered open", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  assert.ok(!eng.timers.some((t) => t.ms === 800), "no reopen when the pane was not left open");

  const footer = await eng.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: ["Auto-accept"] } }, "PASSED");
  assert.notEqual(footer, "PASSED", "footer opener replaces the mode row on Desktop");
  const keys = assertValidTree(footer);
  assert.ok(keys.has("mental-toggle"));
  assert.match(textOf(footer), /Mental/);
  assert.match(textOf(footer), /Auto-accept/, "keeps the host's own mode labels");
  const termFooter = await eng.fire("ui.render", { component: "SessionMode", surface: "terminal", props: { modes: [] } }, "PASSED");
  assert.equal(termFooter, "PASSED", "terminal footer untouched");

  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  const bandKeys = assertValidTree(band);
  assert.ok(!bandKeys.has("mental-toggle"), "the footer is the one opener; the band has no toggle");
  assert.ok(bandKeys.has("band-needs"), "'N needs you' is a button");
  assert.match(textOf(band), /Verify docked pane at 110 cols/, "band names what needs you");
  let bandButtons = 0;
  walk(band, (n) => n.type === "Button" && bandButtons++);
  assert.equal(bandButtons, 2, "needs button plus a footer-only Hide");
  assert.ok(bandKeys.has("band-dismiss"));
  const slim = await eng.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: [] } });
  assert.doesNotMatch(textOf(slim), /need/, "with the band showing, the footer is just the opener");
  const mobile = await eng.fire("ui.render", { component: "AbovePrompt", surface: "mobile", props: { hasSurvey: false, maxRows: 4, bodyColumns: 60 } }, "PASSED");
  assert.equal(mobile, "PASSED");

  // Pressing the footer button opens the docked pane and remembers it.
  let press;
  walk(footer, (n) => {
    if (n.type === "Button" && n.props.key === "mental-toggle") press = n.props.onPress;
  });
  assert.ok(press);
  press();
  await eng.flush();
  const open = eng.calls.find((c) => c[0] === "open");
  assert.equal(open[1].id, "mental");
  assert.equal(open[1].rows, undefined, "docked, not a dialog");
  assert.ok(eng.calls.some((c) => c[0] === "store.set" && c[1] === "open" && c[2] === true));

  await eng.fire("tool.call", { tool: "Edit", file_path: "/repo/a.mjs" }, { text: "ok" });
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48, scroll: { bodyRows: 40 } } });
  const paneKeys = assertValidTree(pane);
  assert.ok(paneKeys.has("park-btn") && paneKeys.has("handoff-btn") && paneKeys.has("refresh-btn"));
  assert.match(textOf(pane), /save my place/, "each button says what it does");
  assert.ok(paneKeys.has("needs-ask-btn"), "needs card comes with an ask button");
  const svgs = [];
  walk(pane, (n) => n.type === "Svg" && svgs.push(n));
  assert.ok(svgs.length >= 4, "hero, session, needs, files cards");
  assert.match(textOf(pane), /Wire the band/, "resume point in the hero");
  assert.match(svgs.map((x) => x.props.source).join(""), /a\.mjs/, "touched file shows up");
  assert.ok(paneKeys.has("dashboard"), "dashboard button lives in the pane");
  assert.ok(!paneKeys.has("track-start"), "no clock buttons when tracking is off");
  assert.match(svgs.map((x) => x.props.source).join(""), /Not running/, "dashboard probe reads stopped");
  for (const x of svgs) {
    assert.equal(x.props.isInteractive, undefined, "image mode keeps the logo");
    assert.equal(typeof x.props.width, "number");
    assert.equal(x.props.height, undefined, "height left to the slot so cards keep their ratio");
  }

  // Park sends a real message; if the host refuses, it falls back to filling the prompt.
  let park;
  walk(pane, (n) => {
    if (n.type === "Button" && n.props.key === "park-btn") park = n.props.onPress;
  });
  park();
  await eng.flush();
  const sent = eng.calls.find((c) => c[0] === "submit");
  assert.equal(sent[1].asUser, true);
  assert.match(sent[1].text, /Park this session/);
  assert.ok(eng.calls.some((c) => c[0] === "toast" && /park/i.test(c[1])));

  // Start dashboard: launches the helper detached, then re-probes.
  let startDash;
  walk(pane, (n) => {
    if (n.type === "Button" && n.props.key === "dashboard") startDash = n.props.onPress;
  });
  startDash();
  await eng.flush();
  await eng.flush();
  const started = eng.calls.find((c) => c[0] === "run" && c[1][2] === "start");
  assert.deepEqual(started[1], ["node", "/plugins/mental/claude-mod/dash.mjs", "start"]);
  assert.equal(started[2].cwd, "/repo");
  assert.ok(eng.timers.some((t) => t.once && t.ms === 2500), "re-probes while it starts");
  const starting = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  let label = "";
  walk(starting, (n) => {
    if (n.type === "Button" && n.props.key === "dashboard") label = n.props.label;
  });
  assert.match(label, /Starting/);

  // /mental on Desktop toggles silently (no chat text).
  const hidden = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  assert.deepEqual(hidden, {});
  assert.ok(eng.calls.some((c) => c[0] === "store.set" && c[1] === "open" && c[2] === false));
  const shown = await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  assert.deepEqual(shown, {});
  assert.doesNotMatch(JSON.stringify(eng.calls), /Widen the terminal/);
});

test("Claude Desktop: reopens the pane when it was left open", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"], store: { open: true } });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const reopen = eng.timers.find((t) => t.once && t.ms === 800);
  assert.ok(reopen, "schedules a reopen");
  reopen.fn();
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "open"));
});

test("Claude Desktop: clock buttons and an already-serving dashboard", async () => {
  const tracked = heartbeat({
    track: { enabled: true, runningCount: 1, focusedId: "t", running: [{ id: "t", started: new Date(Date.now() - 3600_000).toISOString() }] },
  });
  const eng = fakeEngine({ surfaces: ["desktop"], hb: tracked, dashId: "mental" });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  await eng.flush();
  await eng.flush();
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  const keys = assertValidTree(pane);
  assert.ok(keys.has("track-stop-btn") && !keys.has("track-start-btn"), "running clock offers stop");
  const sources = [];
  walk(pane, (n) => n.type === "Svg" && sources.push(n.props.source));
  assert.match(sources.join(""), /Clock running/);
  assert.match(sources.join(""), /Serving/);
  const presses = {};
  walk(pane, (n) => n.type === "Button" && (presses[n.props.key] = n.props));
  assert.match(presses.dashboard.label, /Open dashboard/);
  presses.dashboard.onPress();
  await eng.flush();
  await eng.flush();
  const opened = eng.calls.find((c) => c[0] === "run" && c[1][2] === "open");
  assert.deepEqual(opened[1].slice(1), ["/plugins/mental/claude-mod/dash.mjs", "open", "http://localhost:3847/"]);
  assert.ok(!eng.calls.some((c) => c[0] === "run" && c[1][2] === "start"), "never starts a second server");
  presses["track-stop-btn"].onPress();
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "submit" && /Stop the Mental time clock/.test(c[1].text)));

  const eng2 = fakeEngine({ surfaces: ["desktop"], hb: tracked, submitFails: true });
  await eng2.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng2.flush();
  await eng2.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  await eng2.flush();
  await eng2.flush();
  const pane2 = await eng2.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  let stop2;
  walk(pane2, (n) => n.type === "Button" && n.props.key === "track-stop-btn" && (stop2 = n.props.onPress));
  stop2();
  await eng2.flush();
  await eng2.flush();
  assert.ok(eng2.calls.some((c) => c[0] === "fill" && /Stop the Mental time clock/.test(c[1].text)), "falls back to filling the prompt");
});

test("Claude Desktop: 'needs you' opens the pane and lights the needs card", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  let needs;
  walk(band, (n) => n.type === "Button" && n.props.key === "band-needs" && (needs = n.props.onPress));
  needs();
  await eng.flush();
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "open"), "opens the pane when closed");
  assert.ok(eng.calls.some((c) => c[0] === "toast" && /Needs you/.test(c[1])), "toast names the items");
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  const sources = [];
  walk(pane, (n) => n.type === "Svg" && sources.push(n.props.source));
  assert.match(sources.join(""), /<animate attributeName="stroke-opacity"/, "needs card pulses");
  assert.match(sources[1], /needs you/i, "needs card sits right under the hero");
  // Already open: pressing again flashes without closing.
  needs();
  await eng.flush();
  assert.ok(!eng.calls.some((c) => c[0] === "close"));
});

test("Claude Desktop: open pane ticks live, shows the refresh dial, stops on close", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const footer = await eng.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: [] } }, "PASSED");
  let press;
  walk(footer, (n) => n.type === "Button" && n.props.key === "mental-toggle" && (press = n.props.onPress));
  press();
  await eng.flush();
  const live = eng.timers.find((t) => !t.once && t.ms === 5000);
  assert.ok(live && !live.cancelled, "5s live tick starts with the pane");
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  const src = [];
  walk(pane, (n) => n.type === "Svg" && src.push(n.props.source));
  assert.match(src.join(""), /<animate/, "cards animate");
  assert.match(src[0], /live/i, "hero foot shows the live state");
  const before = eng.calls.filter((c) => c[0] === "invalidate").length;
  live.fn();
  await eng.flush();
  assert.equal(eng.calls.filter((c) => c[0] === "invalidate").length, before, "an idle tick never repaints (no scroll fight)");
  const close = eng.calls.length;
  await eng.fire("ui.close", { id: "mental" }, {});
  assert.ok(live.cancelled, "tick stops when the pane closes");
  assert.ok(eng.calls.length >= close);
});

test("Claude Desktop: browse Decisions, open an item, go Back", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const paneOf = () => eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  const press = (tree, key) => {
    let fn;
    walk(tree, (n) => n.type === "Button" && n.props.key === key && (fn = n.props.onPress));
    assert.ok(fn, `button ${key}`);
    fn();
  };
  const footer = await eng.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: [] } }, "PASSED");
  press(footer, "mental-toggle");
  await eng.flush();
  press(await paneOf(), "browse-decision");
  await eng.flush();
  let tree = assertValidTreeKeys(await paneOf());
  assert.ok(tree.keys.has("back") && tree.keys.has("open-0-btn"), "list shows Back and rows");
  assert.match(textOf(tree.node), /Use SQLite/);
  press(tree.node, "open-0-btn");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.match(textOf(tree.node), /fast/, "item body is readable");
  press(tree.node, "back");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.ok(tree.keys.has("open-0-btn"), "Back returns to the list");
  press(tree.node, "back");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.ok(tree.keys.has("browse-decision") && !tree.keys.has("back"), "Back from the list returns to the panel");
});

function assertValidTreeKeys(node) {
  return { node, keys: assertValidTree(node) };
}

test("Claude Desktop: Hide drops the concern from the footer only, and it is remembered", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const band = () => eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  let fn;
  walk(await band(), (n) => n.type === "Button" && n.props.key === "band-dismiss" && (fn = n.props.onPress));
  assert.ok(fn, "Hide button on the band");
  fn();
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "store.set" && c[1] === "dismissed" && c[2].length >= 1), "remembered");
  const after = assertValidTree(await band());
  assert.ok(!after.has("band-dismiss"), "nothing left to hide");
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  assert.match(textOf(pane), /Verify docked pane/, "the panel still lists it");
});

test("markdownLines turns notes into readable lines", async () => {
  const { markdownLines } = await import("../claude-mod/lib/desktop.mjs");
  const lines = markdownLines("# Title\n\n- **bold** item\n\n\n\nSee [link](http://x) and `code`.");
  assert.equal(lines[0].bold, true);
  assert.ok(lines.some((l) => l.text.startsWith("•") && !l.text.includes("**")));
  assert.ok(lines.some((l) => l.text === "See link and code."));
  assert.ok(lines.filter((l) => l.text === "").length <= 2, "blank runs collapse");
});

test("dashStateOf tells this project's dashboard from another's", async () => {
  const { dashStateOf } = await import("../claude-mod/mental-mod.mjs");
  const ok = (body) => ({ exitCode: 0, stdout: JSON.stringify(body) });
  assert.equal(dashStateOf(null, "a"), "stopped");
  assert.equal(dashStateOf({ exitCode: 1, stdout: "" }, "a"), "stopped");
  assert.equal(dashStateOf(ok({ serving: false }), "a"), "stopped");
  assert.equal(dashStateOf(ok({ serving: true, id: "a" }), "a"), "running");
  assert.equal(dashStateOf(ok({ serving: true, id: "b" }), "a"), "other");
});

test("desktop cards escape text and stay under the Svg cap", async () => {
  const { esc, heroSvg, sessionSvg, filesSvg, activitySvg, guardrailsSvg, needsSvg, trackSvg, dashSvg, SVG_MAX } = await import("../claude-mod/lib/desktop.mjs");
  const { noteReceipt, newSession } = await import("../claude-mod/lib/model.mjs");
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  const s = newSession(0);
  for (let i = 0; i < 12; i++) noteReceipt(s, { glyph: "◆", label: "Parked", title: `t${i}`, at: i });
  assert.equal(s.log.length, 8, "activity log keeps the last 8");
  for (let i = 0; i < 400; i++) s.files.set(`/repo/src/${"x".repeat(60)}${i}.mjs`, 1);
  const vm = { linked: true, resume: "<script>alert(1)</script>".repeat(40), attention: [], decisions: [], needsEyes: [], guardrails: [] };
  const width = 420;
  const cards = [
    heroSvg({ vm, s, now: 10, width }),
    sessionSvg({ s, now: 10, width }),
    filesSvg({ s, cwd: "/repo", width }),
    activitySvg({ log: s.log, now: 10, width }),
    guardrailsSvg({ vm, width }),
    needsSvg({ vm, now: 10, width }),
    trackSvg({ vm: { ...vm, track: { runningCount: 3, staleCount: 1, unclocked: false, startedAt: 0, stale: false } }, now: 7_200_000, width }),
    dashSvg({ width, dash: { state: "running", url: "http://localhost:3847/<x>" } }),
    dashSvg({ width, dash: { state: "other" } }),
  ].filter(Boolean);
  assert.ok(cards.some((c) => /3 clocks running/.test(c.source)), "track card renders");
  assert.ok(cards.some((c) => /&lt;x&gt;/.test(c.source)), "dashboard url escaped");
  for (const c of cards) {
    assert.ok(c.source.length <= SVG_MAX);
    assert.doesNotMatch(c.source, /<script/);
  }
});

test("toolCardOf reads mental shell calls and themes the chat row", async () => {
  const { toolCardOf } = await import("../claude-mod/lib/toolcard.mjs");
  const { toolRowDesktop, themed } = await import("../claude-mod/lib/desktop.mjs");
  assert.equal(toolCardOf({ input: { command: "ls -la" }, output: "x" }), null);
  assert.equal(toolCardOf({ input: null, output: null }), null);
  const park = toolCardOf({ input: { command: 'mental park --title "Ship <it>"' }, output: "ok" });
  assert.equal(park?.state, "done");
  assert.ok(park?.title);
  assert.equal(toolCardOf({ input: { command: 'mental park --title "x"' }, output: "" })?.state, "running");
  assert.equal(toolCardOf({ input: '{"command":"mental heartbeat --json"}', output: "" })?.kind.length > 0, true);
  const el = (type) => (props) => ({ type, props });
  const row = toolRowDesktop({ Svg: el("Svg"), Box: el("Box") }, { model: { ...park, title: "<b>&" }, theme: "auto" });
  const svg = row.props.children[0].props;
  assert.match(svg.source, /prefers-color-scheme:light/);
  assert.doesNotMatch(svg.source, /<b>/);
  assert.ok(svg.source.length <= 131072);
  assert.ok(typeof themed === "function");
  const eng = fakeEngine({});
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const hit = await eng.fire("ui.render", { component: "ToolUse", surface: "desktop", props: { input: { command: 'mental park --title "x"' }, output: "ok" } });
  assert.ok(hit && hit !== undefined, "mental call gets a card");
  const miss = await eng.fire("ui.render", { component: "ToolUse", surface: "terminal", props: { input: { command: 'mental park --title "x"' }, output: "ok" } });
  assert.ok(!miss || !JSON.stringify(miss).includes("prefers-color-scheme"), "terminal untouched");
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
