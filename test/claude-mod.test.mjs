import assert from "node:assert/strict";
import { test } from "node:test";

import { ageOf, clip, clockOf, handoffMsOf, wrapLines } from "../claude-mod/lib/format.mjs";
import {
  bandModelOf,
  bandStateOf,
  isWriteCommand,
  markdownLines,
  needsOf,
  paneModelOf,
  mentalCommandOf,
  newSession,
  noteContext,
  noteEdit,
  noteReceipt,
  noteTurnComplete,
  receiptOf,
  receiptTitleOf,
  viewModelOf,
  visibleNeedsOf,
  RECEIPT_MS,
} from "../claude-mod/lib/model.mjs";
import { renderBand, renderPane, renderRoute } from "../claude-mod/lib/views.mjs";
import { heartbeatArgvs, heartbeatOf, register, versionAtLeast } from "../claude-mod/mental-mod.mjs";

// Fake element constructors: plain `{ type, props }` trees, like `$.ui.resolve(e)`.
const el = {
  Box: (props) => ({ type: "Box", props }),
  Text: (props) => ({ type: "Text", props }),
  Button: (props) => ({ type: "Button", props }),
  Svg: (props) => ({ type: "Svg", props }),
  Link: (props) => ({ type: "Link", props }),
  Markdown: (props) => ({ type: "Markdown", props }),
};

// Mirrors BoxProps / TextProps / ButtonProps / SvgProps in the Mods types: Text and Svg take no `key`.
const ALLOWED = {
  Box: new Set(["key", "flexDirection", "justifyContent", "alignItems", "width", "gap", "flexGrow", "flexShrink", "paddingX", "paddingY", "backgroundColor", "borderStyle", "borderColor", "borderDimColor", "hover", "children"]),
  Text: new Set(["color", "bold", "italic", "dimColor", "wrap", "size", "weight", "children"]),
  Button: new Set(["key", "label", "hotkey", "plain", "dimColor", "variant", "hover", "onPress"]),
  Client: new Set(["key", "module", "props", "width", "height", "flexGrow"]),
  Svg: new Set(["source", "alt", "width", "height", "isInteractive"]),
  Link: new Set(["href", "label"]),
  Markdown: new Set(["key", "text", "dimColor"]),
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
      if (k === "variant") assert.ok(["primary", "secondary"].includes(v), "Button variant is primary or secondary");
      if (k === "size") assert.ok(["caption", "footnote", "body", "heading", "title"].includes(v));
      if (k === "weight") assert.ok(["regular", "medium", "semibold", "bold"].includes(v));
      if (k === "color") assert.doesNotMatch(String(v), /^#/, "no fixed hex: the host's theme decides");
      assert.notEqual(v, undefined, `${node.type} prop ${k} is undefined`);
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
  if (node.type === "Button" || node.type === "Link") return node.props.label;
  if (node.type === "Markdown") return node.props.text;
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
      gitRoot: "C:\\work\\repo",
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
  assert.equal(handoffMsOf({ when: { date: "2026-05-12", time: "14:20" } }), new Date(2026, 4, 12, 14, 20).getTime());
  assert.equal(handoffMsOf({ when: {} }), null);
  const lines = wrapLines("one two three four five six", 9, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(lines.every((l) => l.length <= 9));
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
  assert.equal(mentalCommandOf({ tool: "Bash", command: "git status; mental decide --json" }), "decide");
  assert.equal(mentalCommandOf({ tool: "Bash", command: "MENTAL_X=1 mental attention --json" }), "attention");
  assert.equal(mentalCommandOf({ tool: "Bash", command: "mental heartbeat --json | jq .data" }), "heartbeat");
  assert.equal(mentalCommandOf({ tool: "PowerShell", command: "& mental.cmd park --json" }), "park");
  // Text that merely mentions a command is not a call.
  assert.equal(mentalCommandOf({ tool: "Bash", command: 'git commit -m "Run mental park before mental handoff"' }), null);
  assert.equal(mentalCommandOf({ tool: "Bash", command: "echo 'then mental decide' && ls" }), null);
  assert.equal(mentalCommandOf({ tool: "Bash", command: "git commit -m \"$(cat <<'EOF'\nfix: mental park receipts\n\nmental handoff too\nEOF\n)\"" }), null);
  assert.equal(mentalCommandOf({ tool: "Bash", command: "grep -rn mental park src/" }), null);
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
  assert.equal(receiptOf("decide", { result: { stdout: text, stderr: "" } }, NOW)?.title, "Use mods, not MCP", "reads `result` when `text` is absent");
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
  assert.equal(viewModelOf(heartbeat({ laterCount: 4 }), NOW).laterCount, 4);
  assert.ok(!("hopsToday" in vm), "no stat dump fields");
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
  assert.equal(t.files.size, 2);
  assert.equal(t.turns, 1);
  for (let i = 0; i < 12; i++) noteReceipt(t, { glyph: "◆", label: "Parked", title: `t${i}`, at: i });
  assert.equal(t.log.length, 8, "activity log keeps the last 8");
});

test("renderBand: one tree for terminal and Desktop, every state", () => {
  const vm = viewModelOf(heartbeat(), NOW);
  const cases = [
    [null, newSession(NOW)],
    [{ linked: false }, newSession(NOW)],
    [vm, newSession(NOW)],
    [{ ...vm, handoffAge: 1000 }, newSession(NOW)],
    [vm, { ...newSession(NOW), working: true, turns: 3 }],
    [vm, { ...newSession(NOW), edits: 40 }],
    [vm, { ...newSession(NOW), compacting: true }],
    [vm, { ...newSession(NOW), receipt: { kind: "note", label: "Note", tone: "green", glyph: "○", title: "x", at: NOW } }],
  ];
  for (const look of [{ rich: false }, { rich: true, typography: true }]) {
    for (const [v, s] of cases) {
      for (const columns of [24, 80, 200]) {
        const tree = renderBand(el, bandModelOf({ vm: v, s, now: NOW }), {}, { ...look, columns, maxRows: 2, frame: 1 });
        assertValidTree(tree);
        const rows = textOf(tree).split("\n").filter(Boolean);
        assert.ok(rows.length >= 1 && rows.length <= 2);
        if (columns >= 80) for (const row of rows) assert.ok(row.length <= columns, `row too wide: ${row}`);
      }
    }
  }
  const calm = textOf(renderBand(el, bandModelOf({ vm, s: newSession(NOW), now: NOW }), {}, { columns: 120 }));
  assert.match(calm, /Mental/);
  assert.match(calm, /Wire the band into session\.start/);
  assert.match(calm, /2 need you/, "the band counts what needs you");
  const one = renderBand(el, bandModelOf({ vm, s: newSession(NOW), now: NOW }), {}, { columns: 120, maxRows: 1 });
  assert.equal(textOf(one).split("\n").filter(Boolean).length, 1);
  let svgs = 0;
  walk(renderBand(el, bandModelOf({ vm, s: newSession(NOW), now: NOW }), {}, { columns: 120 }), (n) => n.type === "Svg" && svgs++);
  assert.equal(svgs, 0, "the terminal band draws no Svg");
});
test("renderPane: one tree for every surface, resume and needs above the fold", () => {
  const vm = viewModelOf(
    heartbeat({
      attention: [
        { title: "Check the docked width", kind: "verify", status: "open", path: "attention/w.md" },
        { title: "Verify docked pane at 110 cols", kind: "thread", status: "open", path: "attention/p.md" },
      ],
      attentionCount: 2,
      track: { enabled: true, runningCount: 1, focusedId: "t", running: [{ id: "t", started: new Date(NOW - 3600_000).toISOString() }], unclocked: true },
    }),
    NOW,
  );
  const s = newSession(NOW - 30 * 60_000);
  noteEdit(s, "C:/repo/claude-mod/a.mjs");
  noteTurnComplete(s);
  noteContext(s, { percent: 42 });
  const pressed = [];
  const on = {
    onPark: () => pressed.push("park"),
    onHandoff: () => pressed.push("handoff"),
    onAskNeeds: () => pressed.push("ask"),
    onOpenItem: (path) => pressed.push(`open:${path}`),
    onBrowse: (type) => pressed.push(`browse:${type}`),
    onRefresh: () => pressed.push("refresh"),
    onTrackStart: () => pressed.push("start"),
    onTrackStop: () => pressed.push("stop"),
  };
  const brief = { ok: true, data: { hops: [
    { date: "2026-05-10", time: "09:00", via: "cursor", title: "Tags landed" },
    { date: "2026-05-11", time: "11:30", via: "copilot", title: "Graph restored" },
    { date: "2026-05-12", time: "14:20", via: "claude-code", title: "Views drafted" },
  ] } };
  const model = paneModelOf({ vm, s, now: NOW, updatedAt: NOW - 5000, brief });
  const every = ["park", "handoff", "refresh", "need-0", "need-1", "needs-ask", "browse-journal", "browse-decision", "track-stop"];
  const typedIn = (tree) => {
    let typed = 0;
    walk(tree, (n) => ("size" in n.props || "weight" in n.props || "variant" in n.props) && typed++);
    return typed;
  };

  // Terminal: one native column, sections in reading order.
  const term = renderPane(el, model, on, { rich: false, typography: false, columns: 100 });
  const termKeys = assertValidTree(term);
  for (const k of every) assert.ok(termKeys.has(k), k);
  const text = textOf(term);
  const order = ["PICK UP HERE", "Wire the band", "Park", "NEED YOU", "Needs eyes: Check the docked width", "THIS SESSION", "TIME", "READ IN MENTAL"].map((x) => text.indexOf(x));
  assert.ok(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), `sections in order: ${order}`);
  assert.match(text, /Clock running · 1:00/);
  assert.match(text, /1 turn · 1 file edited · context 42%/);
  assert.doesNotMatch(text, /more\b.*\+|\+\d+ more/, "the pane scrolls; nothing is cut to +N more");
  walk(term, (n) => assert.notEqual(n.type, "Svg", "no drawings in the terminal"));
  assert.equal(typedIn(term), 0, "size/weight/variant only where the host draws them");

  // Desktop console: the hero and the pulse are drawings; every control is native, under them.
  const rich = renderPane(el, model, on, { rich: true, typography: true, columns: 60, now: NOW });
  const richKeys = assertValidTree(rich);
  for (const k of every) assert.ok(richKeys.has(k), k);
  const svgs = [];
  walk(rich, (n) => n.type === "Svg" && svgs.push(n));
  assert.ok(svgs.length >= 2, "hero and pulse lead");
  const heads = svgs.slice(2).map((x) => x.props.alt);
  assert.deepEqual(heads, ["Needs you · 3", "Time · running", "Read in Mental"], "every native section opens with a drawn header");
  assert.match(svgs[0].props.alt, /Pick up here: Wire the band/);
  assert.match(svgs[0].props.alt, /3 hops across Cursor, Copilot, Claude/, "the thread names each agent");
  assert.match(svgs[1].props.alt, /Needs you: 3 \(1 to check/, "attention and the open decision, by kind");
  assert.match(svgs[1].props.alt, /Context: 42%/);
  assert.ok(svgs.every((x) => x.props.isInteractive === undefined), "image mode: an iframe would drop the logo");
  const richText = textOf(rich);
  const richOrder = ["Park", "Needs you · 3", "Check the docked width", "Clock running · 1:00", "Read in Mental"].map((x) => richText.indexOf(x));
  assert.ok(richOrder.every((i, n) => i >= 0 && (n === 0 || i > richOrder[n - 1])), `console order: ${richOrder}`);
  assert.ok(typedIn(rich) > 0);
  const tree = renderPane(el, model, on, { columns: 100 });
  for (const key of ["need-0", "needs-ask", "browse-decision", "park", "track-stop"]) {
    walk(tree, (n) => n.type === "Button" && n.props.key === key && n.props.onPress());
  }
  assert.deepEqual(pressed, ["open:attention/w.md", "ask", "browse:Decision", "park", "stop"]);

  const typed = renderPane(el, model, on, { typography: true });
  let primary = "";
  walk(typed, (n) => n.type === "Button" && n.props.variant === "primary" && (primary = n.props.key));
  assert.equal(primary, "park", "Park is the primary action at rest");
  const full = newSession(NOW);
  noteContext(full, { percent: 90 });
  let urgent = "";
  walk(renderPane(el, paneModelOf({ vm, s: full, now: NOW }), on, { typography: true }), (n) => n.type === "Button" && n.props.variant === "primary" && (urgent = n.props.key));
  assert.equal(urgent, "handoff", "near the context limit, Hand off leads");

  for (const v of [null, { linked: false }]) {
    const t = renderPane(el, paneModelOf({ vm: v, s, now: NOW, error: "mental: not found" }), on, { columns: 60 });
    assertValidTree(t);
    assert.match(textOf(t), /mental: not found/, "the real error, in full");
  }
});

test("renderRoute: Markdown where the host has it, plain lines before 2.1.299", () => {
  const route = { view: "item", path: "decisions/2026-05-01-a.md", status: "ok", doc: { frontmatter: { type: "Decision", title: "Use SQLite", status: "accepted" }, body: "# Why\r\n\n- fast\u0007\n", backlinks: ["x"] } };
  const on = { onBack() {}, onOpenItem() {} };
  const rich = renderRoute(el, route, on, { typography: true });
  assertValidTree(rich);
  let md;
  walk(rich, (n) => n.type === "Markdown" && (md = n.props.text));
  assert.equal(md, "# Why\n\n- fast\n", "control characters other than tab and newline are dropped");
  const plain = renderRoute(el, route, on, {});
  assertValidTree(plain);
  let any = false;
  walk(plain, (n) => n.type === "Markdown" && (any = true));
  assert.ok(!any);
  assert.match(textOf(plain), /• fast/);
  assert.match(textOf(plain), /Decision · accepted · 2026-05-01/);
  const list = renderRoute(el, { view: "list", type: "Attention", status: "ok", total: 1, items: [{ path: "a.md", title: "One", status: "open" }] }, on, {});
  assert.ok(assertValidTree(list).has("open-0"));
  assert.match(textOf(list), /Threads/);
});

test("versionAtLeast gates the typography props", () => {
  assert.ok(versionAtLeast("2.1.312", "2.1.299"));
  assert.ok(versionAtLeast("2.1.299", "2.1.299"));
  assert.ok(versionAtLeast("2.2.0", "2.1.299"));
  assert.ok(!versionAtLeast("2.1.298", "2.1.299"));
  assert.ok(!versionAtLeast("2.1.290-dev.20260920.t1.sha1", "2.1.299"));
  assert.ok(!versionAtLeast("", "2.1.299"));
});
test("heartbeat argv and stdout parsing", () => {
  assert.deepEqual(heartbeatArgvs("/p/mental/")[0], ["node", "/p/mental/bin/cli.mjs", "heartbeat", "--json", "--passive"]);
  assert.equal(heartbeatArgvs("")[0][0], "mental");
  assert.deepEqual(heartbeatOf('warn: x\n{"ok":true,"data":{"id":"m"}}'), { ok: true, data: { id: "m" } });
  assert.equal(heartbeatOf("nope"), null);
  assert.equal(heartbeatOf("{broken"), null);
});

/** A fake engine: collects hooks, records `$` calls, runs timers by hand. */
function fakeEngine({ hb = heartbeat(), fail = false, surfaces, version, store = {}, dashId = null, submitFails = false, openFails = false, client = false } = {}) {
  const hooks = [];
  const calls = [];
  const timers = [];
  const on = (event, matcher, fn) => {
    const hook = { event, matcher: fn ? matcher : null, fn: fn || matcher, onError: null };
    hooks.push(hook);
    return { catch: (handler) => void (hook.onError = handler) };
  };
  register(on);
  const $ = {
    plugin: { root: "/plugins/mental" },
    ...(surfaces ? { session: { surfaces: async () => surfaces, ...(version ? { version: async () => ({ version }) } : {}) } } : {}),
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
            return { exitCode: 0, stdout: JSON.stringify({ serving, url: serving ? "http://127.0.0.1:3847/" : null }), stderr: "" };
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
      resolve: async () => (client ? { ...el, Client: (props) => ({ type: "Client", props }) } : el),
      open: async (args) => {
        if (openFails) throw new Error("no room");
        calls.push(["open", args]);
      },
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
  const catchesOf = (event) => hooks.filter((h) => h.event === event).map((h) => h.onError);
  return { hooks, calls, timers, fire, flush, catchesOf };
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
  assert.match(textOf(pane), /PICK UP HERE/);
  assert.match(textOf(pane), /Open decision: Band height: 2 rows/, "decisions are in Needs you");

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

  await eng.fire("session.end", { reason: "prompt_input_exit" });
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
  assert.match(textOf(band), /Wire the band into session\.start/, "the strip carries the resume line");
  assert.match(textOf(band), /2 need you ›/);
  let bandButtons = 0;
  walk(band, (n) => n.type === "Button" && bandButtons++);
  assert.equal(bandButtons, 1, "one quiet line: the strip and the needs link, nothing else");
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
  assert.ok(paneKeys.has("park") && paneKeys.has("handoff") && paneKeys.has("refresh"));
  assert.match(textOf(pane), /Save your place, or brief the next chat/, "the actions say what they do");
  assert.ok(paneKeys.has("needs-ask"), "needs come with an ask button");
  assert.ok(paneKeys.has("needs-hide"), "Hide lives with the needs it hides");
  const svgs = [];
  walk(pane, (n) => n.type === "Svg" && svgs.push(n));
  assert.ok(svgs.slice(2).every((x) => x.props.height === 22), "past the hero and pulse, drawings are only section headers");
  assert.ok(svgs.some((x) => x.props.alt === "Dashboard"), "the dashboard has its own section");
  assert.ok(svgs.every((x) => x.props.isInteractive === undefined), "image mode keeps the logo");
  assert.match(svgs[0].props.alt, /^repo — /, "the project's folder name, never its id");
  assert.match(svgs[0].props.alt, /Wire the band/, "resume point first");
  assert.match(svgs[1].props.alt, /1 file edited/, "this session in the pulse");
  const briefRun = eng.calls.find((c) => c[0] === "run" && c[1].includes("brief"));
  assert.deepEqual(briefRun?.[1], ["node", "/plugins/mental/bin/cli.mjs", "brief", "--json", "--hops", "8"], "the open pane reads the thread");
  assert.ok(paneKeys.has("dashboard"), "dashboard button lives in the pane");
  assert.match(textOf(pane), /Not running.*▶ Start/, "dashboard probe reads stopped");
  assert.ok(!paneKeys.has("track-start"), "no clock buttons when tracking is off");

  // Park sends a real message; if the host refuses, it falls back to filling the prompt.
  let park;
  walk(pane, (n) => {
    if (n.type === "Button" && n.props.key === "park") park = n.props.onPress;
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
  assert.match(textOf(starting), /Starting — it opens in your browser/);
  assert.ok(!assertValidTree(starting).has("dashboard"), "no second start while it warms up");

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
  assert.ok(keys.has("track-stop") && !keys.has("track-start"), "running clock offers stop");
  assert.match(textOf(pane), /Clock running/);
  const presses = {};
  walk(pane, (n) => n.type === "Button" && (presses[n.props.key] = n.props));
  let link;
  walk(pane, (n) => n.type === "Link" && (link = n.props));
  assert.equal(link?.href, "http://localhost:3847/#/today?p=mental", "a running dashboard opens through a native Link");
  assert.match(link.label, /Open ↗/);
  assert.ok(presses["dashboard-stop"], "a running dashboard can be stopped from the pane");
  assert.ok(!presses.dashboard, "no process round trip to open it");
  assert.ok(!eng.calls.some((c) => c[0] === "run" && c[1][2] === "start"), "never starts a second server");
  presses["track-stop"].onPress();
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
  walk(pane2, (n) => n.type === "Button" && n.props.key === "track-stop" && (stop2 = n.props.onPress));
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
  assert.ok(!eng.calls.some((c) => c[0] === "toast" && /need/i.test(c[1])), "the pane lists them; no toast repeats the list");
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  const keys = assertValidTree(pane);
  assert.ok(keys.has("need-0") && keys.has("need-1"), "one button per item");
  assert.match(textOf(pane), /● check\s*Verify docked pane/, "each row is tagged by kind");
  // Already open: pressing again keeps it open.
  needs();
  await eng.flush();
  assert.ok(!eng.calls.some((c) => c[0] === "close"));
});

test("Claude Desktop: open pane re-reads Mental on a beat, never repaints idle, stops on close", async () => {
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
  walk(pane, (n) => n.type === "Svg" && [...n.props.source.matchAll(/dur="([d.]+)s"/g)].forEach((d) => assert.ok(Number(d[1]) >= 1.8, "motion is slow and ambient, inside the drawing")));
  assert.match(textOf(pane), /Updated just now/);
  const before = eng.calls.filter((c) => c[0] === "invalidate").length;
  live.fn();
  await eng.flush();
  assert.equal(eng.calls.filter((c) => c[0] === "invalidate").length, before, "an idle tick never repaints (no scroll fight)");
  const close = eng.calls.length;
  await eng.fire("ui.close", { id: "mental" }, {});
  assert.ok(live.cancelled, "tick stops when the pane closes");
  assert.ok(eng.calls.length >= close);
});

test("Claude Desktop: a band render without isWorking never repaints (no scroll snap-back loop)", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const before = eng.calls.filter((c) => c[0] === "invalidate").length;
  for (let i = 0; i < 3; i++) {
    await eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { bodyColumns: 48 } }, "PASSED");
  }
  assert.equal(eng.calls.filter((c) => c[0] === "invalidate").length, before, "an absent isWorking equals false and must not invalidate");
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
  assert.ok(tree.keys.has("back") && tree.keys.has("open-0"), "list shows Back and rows");
  assert.match(textOf(tree.node), /Use SQLite/);
  press(tree.node, "open-0");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.match(textOf(tree.node), /fast/, "item body is readable");
  press(tree.node, "back");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.ok(tree.keys.has("open-0"), "Back returns to the list");
  press(tree.node, "back");
  await eng.flush();
  tree = assertValidTreeKeys(await paneOf());
  assert.ok(tree.keys.has("browse-decision") && !tree.keys.has("back"), "Back from the list returns to the panel");
});

function assertValidTreeKeys(node) {
  return { node, keys: assertValidTree(node) };
}

test("Claude Desktop: Hide from band drops what needs you from the band only, and it is remembered", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const band = () => eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } }, "PASSED");
  const pane = () => eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  assert.ok(assertValidTree(await band()).has("band-needs"));
  let fn;
  walk(await pane(), (n) => n.type === "Button" && n.props.key === "needs-hide" && (fn = n.props.onPress));
  assert.ok(fn, "Hide sits with the needs in the pane");
  fn();
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "store.set" && c[1] === "dismissed" && c[2].length >= 1), "remembered");
  assert.ok(!assertValidTree(await band()).has("band-needs"), "the band stops nagging");
  assert.match(textOf(await pane()), /Verify docked pane/, "the panel still lists it");
});

test("markdownLines turns notes into readable lines", async () => {
  const lines = markdownLines("# Title\n\n- **bold** item\n\n\n\nSee [link](http://x) and `code`.");
  assert.equal(lines[0].bold, true);
  assert.ok(lines.some((l) => l.text.startsWith("•") && !l.text.includes("**")));
  assert.ok(lines.some((l) => l.text === "See link and code."));
  assert.ok(lines.filter((l) => l.text === "").length <= 2, "blank runs collapse");
});

test("dashboard probe and link: any running dashboard serves this project", async () => {
  const { dashProbeOf, dashHrefOf } = await import("../claude-mod/mental-mod.mjs");
  const ok = (body) => ({ exitCode: 0, stdout: JSON.stringify(body) });
  assert.deepEqual(dashProbeOf(null), { state: "stopped", url: "" });
  assert.deepEqual(dashProbeOf({ exitCode: 1, stdout: "" }), { state: "stopped", url: "" });
  assert.deepEqual(dashProbeOf(ok({ serving: false, url: null })), { state: "stopped", url: "" });
  assert.deepEqual(dashProbeOf(ok({ serving: true, url: "http://127.0.0.1:51234/" })), { state: "running", url: "http://127.0.0.1:51234/" });
  const href = dashHrefOf("http://127.0.0.1:51234/", "0b9d-4c");
  assert.equal(href, "http://localhost:51234/#/today?p=0b9d-4c", "Desktop Link only opens http://localhost");
  assert.equal(new URL(href).href, href, "spelled as URL normalises it");
  assert.equal(dashHrefOf("http://[::1]:3847/", null), "http://localhost:3847/");
  assert.equal(dashHrefOf("", "x"), "");
});

test("Claude Desktop: no dashboard running → the button starts one, once", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"] });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  await eng.flush();
  await eng.flush();
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
  let start;
  walk(pane, (n) => n.type === "Button" && n.props.key === "dashboard" && (start = n.props.onPress));
  start();
  for (let i = 0; i < 4; i++) await eng.flush();
  start();
  for (let i = 0; i < 4; i++) await eng.flush();
  const starts = eng.calls.filter((c) => c[0] === "run" && c[1][2] === "start");
  assert.equal(starts.length, 1, "a second press while starting does not spawn another server");
  assert.ok(eng.calls.some((c) => c[0] === "run" && c[1][2] === "probe" && c[1].length === 3), "probe takes no port: it reads the port file first");
});

test("toolCardOf reads mental shell calls and themes the chat row", async () => {
  const { toolCardOf } = await import("../claude-mod/lib/toolcard.mjs");
  const { toolRowDesktop, esc } = await import("../claude-mod/lib/desktop.mjs");
  assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(toolCardOf({ tool: "Bash", input: { command: "ls -la" }, output: "x" }), null);
  assert.equal(toolCardOf({ tool: "Bash", input: null, output: null }), null);
  assert.equal(toolCardOf({ tool: "Write", input: { command: "mental park" }, output: "ok" }), null, "only shell tools run mental");
  assert.equal(toolCardOf({ input: { command: "mental park" }, output: "ok" }), null, "no tool name, no card");
  assert.equal(toolCardOf({ tool: "Bash", input: { command: 'git commit -m "mental park"' }, output: "ok" }), null);
  const park = toolCardOf({ tool: "Bash", input: { command: 'mental park --title "Ship <it>"' }, output: "ok" });
  assert.equal(park?.state, "done");
  assert.ok(park?.title);
  assert.equal(toolCardOf({ tool: "Bash", input: { command: 'mental park --title "x"' }, output: "" })?.state, "running");
  assert.equal(toolCardOf({ tool: "Bash", input: { command: "mental park" }, output: '{"ok":true}', isRunning: true })?.state, "running", "isRunning wins over a partial result");
  assert.equal(toolCardOf({ tool: "Bash", input: '{"command":"mental heartbeat --json"}', output: "" })?.kind, "mental heartbeat");
  const el = (type) => (props) => ({ type, props });
  const row = toolRowDesktop({ Svg: el("Svg"), Box: el("Box") }, { model: { ...park, title: "<b>&" } });
  const svg = row.props.children[0].props;
  assert.match(svg.source, /prefers-color-scheme:light/);
  assert.match(svg.source, /#2dd4bf/, "dark console accent");
  assert.match(svg.source, /#0d9488/, "light console accent");
  assert.doesNotMatch(svg.source, /#a78bfa|#6d28d9|#a855f7|#9333ea|violet|purple/i, "no violet left in the card");
  assert.doesNotMatch(svg.source, /<animate/, "a finished call does not animate");
  assert.doesNotMatch(svg.source, /<b>/);
  assert.ok(svg.source.length <= 131072);
  const live = toolRowDesktop({ Svg: el("Svg"), Box: el("Box") }, { model: toolCardOf({ tool: "Bash", input: { command: "mental park" }, output: "", isRunning: true }) });
  assert.match(live.props.children[0].props.source, /<animate/, "a running call shows a live dot");
  const eng = fakeEngine({});
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const hit = await eng.fire("ui.render", { component: "ToolUse", surface: "desktop", props: { tool: "Bash", input: { command: 'mental park --title "x"' }, output: "ok" } }, "PASSED");
  assert.notEqual(hit, "PASSED", "mental call gets a card");
  const viaResult = await eng.fire("ui.render", { component: "ToolUse", surface: "desktop", props: { tool: "Bash", input: { command: "mental decide --json" }, result: { stdout: '{"ok":true,"data":{"title":"Pick SQLite"}}' } } }, "PASSED");
  assert.match(JSON.stringify(viaResult), /Pick SQLite/, "reads `result` when the row carries it");
  const other = await eng.fire("ui.render", { component: "ToolUse", surface: "desktop", props: { tool: "Read", input: { command: "mental park" }, output: "ok" } }, "PASSED");
  assert.equal(other, "PASSED", "other tools keep their own row");
  const miss = await eng.fire("ui.render", { component: "ToolUse", surface: "terminal", props: { tool: "Bash", input: { command: 'mental park --title "x"' }, output: "ok" } });
  assert.ok(!miss || !JSON.stringify(miss).includes("prefers-color-scheme"), "terminal untouched");
});

test("the chat card says what each mental call did", async () => {
  const { toolCardOf } = await import("../claude-mod/lib/toolcard.mjs");
  const card = (command, output, extra = {}) => toolCardOf({ tool: "Bash", input: { command }, output, ...extra });
  const env = (data) => JSON.stringify({ ok: true, data });

  const park = card('mental park --json --title "Wire card" --resume "Run the tests next"', env({ path: "journal/x.md", heartbeat: { handoff: { resume: "Run the tests next", outcome: "Wire card" } } }));
  assert.equal(park.title, "Next: Run the tests next");
  assert.equal(park.detail, "Wire card");
  const journal = card('mental journal --json --title J --resume "Do X"', env({ path: "journal/x.md", section: "## 18:54 — J\n\nResume: Do X\n" }));
  assert.equal(journal.title, "Next: Do X", "journal answers with a section, not a heartbeat");

  const raised = card("mental attention --json --tag ui --title 'Check width' --kind verify", env({ path: "attention/x.md", updated: false }));
  assert.deepEqual([raised.title, raised.detail, raised.tone], ["Check width", "verify · raised", "warn"], "the write prints only a path: the title comes from the flags");
  const resolved = card('mental attention --json --title "Check width" --status=resolved', env({ path: "attention/x.md", updated: true }));
  assert.deepEqual([resolved.detail, resolved.tone], ["resolved", "ok"]);

  const beat = card("mental heartbeat --json --passive", env({ git: { branch: "main" }, handoff: { resume: "Ship it" }, attentionCount: 3, openDecisionCount: 49 }));
  assert.equal(beat.title, "Pick up: Ship it");
  assert.equal(beat.detail, "3 need you · main · 49 open decisions");

  const hook = card("mental hooks session-start cursor", JSON.stringify({ additional_context: "x".repeat(1331) }));
  assert.deepEqual([hook.kind, hook.title, hook.detail], ["mental hooks session-start", "Session-start hook for Cursor", "1.3 KB context"]);
  const on = card("mental hooks on --json", env({ action: "on", written: ["C:\\h\\.cursor\\hooks.json", "C:\\h\\.claude\\settings.json"] }));
  assert.deepEqual([on.title, on.detail], ["Session-start hooks on", "Cursor, Claude Code · 2 files"]);
  assert.equal(card("mental hooks on", { stdout: "hooks on: a, b\n" }).title, "hooks on: a, b", "plain output: its first line");

  assert.equal(card("mental search card --json", env({ q: "card", hits: [{ title: "Card note" }] })).title, "1 result for “card”");
  assert.equal(card("mental list --type Decision --json", env({ items: [{ title: "A" }, { title: "B" }], total: 2, type: "Decision" })).title, "2 decisions");
  const doctor = card("mental doctor --json", env({ checks: [{ ok: true }, { ok: false, level: "warn", message: "2 untagged" }] }));
  assert.deepEqual([doctor.title, doctor.detail, doctor.tone], ["1 warning · 1 ok", "2 untagged", "warn"]);
  assert.equal(card("mental.cmd track stop --all --json", env({ stopped: [{ wall: "1:12", title_internal: "Card work" }] })).title, "Clock stopped · 1:12");
  assert.equal(card("mental option mcp off --json", env({ feature: "mcp", enabled: false, written: [] })).title, "mcp off");

  const failed = card("mental decide --json --title X", JSON.stringify({ ok: false, error: { code: "usage", message: "mental decide create requires --body", hint: "Pass --body" } }));
  assert.deepEqual([failed.state, failed.tone, failed.title, failed.detail], ["failed", "danger", "mental decide create requires --body", "Pass --body"]);
  const crashed = card("mental status --json", { stdout: "", stderr: "spawn ENOENT" }, { isErrored: true });
  assert.deepEqual([crashed.state, crashed.title], ["failed", "spawn ENOENT"], "the real error, from stderr");
  assert.equal(card("mental park", "", { isInterrupted: true }).title, "Interrupted");
});

test("the chat card spans the chat and stays one or two lines tall", async () => {
  const { toolCardOf } = await import("../claude-mod/lib/toolcard.mjs");
  const { toolRowDesktop, widthOf } = await import("../claude-mod/lib/desktop.mjs");
  const el = (type) => (props) => ({ type, props });
  const svgOf = (model, columns) => toolRowDesktop({ Svg: el("Svg"), Box: el("Box") }, { model, columns }).props.children[0].props;
  const short = toolCardOf({ tool: "Bash", input: { command: "mental park --json --resume 'Run tests'" }, output: JSON.stringify({ ok: true, data: { path: "j" } }) });
  const long = { ...short, title: "Next: ".concat("a very long resume line ".repeat(12)), detail: "a long outcome title that will not fit" };
  for (const columns of [40, 90, 140]) {
    for (const model of [short, long]) {
      const svg = svgOf(model, columns);
      assert.equal(svg.width, widthOf(columns), `width follows the site's ${columns} columns`);
      assert.ok(svg.height >= 28 && svg.height <= 46, `compact at ${columns} columns: ${svg.height}px`);
      assert.match(svg.source, new RegExp(`width="${svg.width}"`));
    }
  }
  assert.equal(svgOf(short, 140).height, 32, "a short summary is one line");
  assert.equal(svgOf(long, 140).height, 46, "a long one takes a second line, not more");

  const eng = fakeEngine({});
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const row = await eng.fire("ui.render", { component: "ToolUse", surface: "desktop", viewport: { columns: 110, rows: 40 }, props: { tool: "Bash", input: { command: "mental park" }, output: "ok", isRunning: false, isErrored: false, isInterrupted: false } });
  let drawn;
  walk(row, (n) => n.type === "Svg" && (drawn = n.props));
  assert.equal(drawn?.width, widthOf(110), "the hook sizes the card from e.viewport.columns");
  assert.doesNotMatch(JSON.stringify(row).replace(/"source":"(?:[^"\\]|\\.)*"/g, ""), /#[0-9a-f]{3,8}\b/i, "no hex colours outside the drawing");
});

test("register degrades when heartbeat cannot run", async () => {
  const eng = fakeEngine({ fail: true });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  assert.equal(eng.calls.filter((c) => c[0] === "run").length, 1, "the plugin's own CLI only: no slow PATH fallbacks");
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  assert.match(textOf(band), /Can't read Mental: ENOENT/, "the band says why, not 'not linked'");
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "terminal", props: { bodyColumns: 100, scroll: { bodyRows: 16 } } });
  assert.match(textOf(pane), /ENOENT/, "shows the real error");
});

test("register: /clear and /resume keep the timers; the next poll still fires", async () => {
  const eng = fakeEngine();
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  await eng.fire("tool.call", { tool: "Edit", file_path: "/repo/a.mjs" }, { text: "ok" });
  for (const reason of ["clear", "resume"]) {
    await eng.fire("session.end", { reason });
    await eng.flush();
    const polls = eng.timers.filter((t) => !t.once && t.ms === 60_000 && !t.cancelled);
    assert.equal(polls.length, 1, `one live poll after /${reason}`);
    const before = eng.calls.filter((c) => c[0] === "run").length;
    polls[0].fn();
    await eng.flush();
    assert.equal(eng.calls.filter((c) => c[0] === "run").length, before + 1, `the poll re-reads Mental after /${reason}`);
  }
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "terminal", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  assert.doesNotMatch(textOf(band), /1 file/, "the new conversation starts with fresh stats");
  await eng.fire("session.end", { reason: "logout" });
  assert.ok(eng.timers.every((t) => t.once || t.cancelled), "a real end stops the poll");
});

test("register: subagent turns do not count as session turns", async () => {
  const eng = fakeEngine();
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  await eng.fire("turn.start", {});
  await eng.fire("turn.start", { agentId: "sub-1" });
  await eng.fire("turn.complete", { agentId: "sub-1" });
  await eng.fire("turn.complete", {});
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: true, columns: 160 } });
  const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "terminal", props: { bodyColumns: 100, scroll: { bodyRows: 40 } } });
  assert.match(textOf(pane), /\b1\sturn\b/, "only the main turn is counted");
});

test("register: gating hooks pass through when they fail, and presses never reject", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"], openFails: true });
  for (const event of ["tool.call", "ui.close", "session.compact", "command.run"]) {
    assert.ok(eng.catchesOf(event).every((h) => typeof h === "function"), `${event} has a .catch`);
  }
  const [toolCatch] = eng.catchesOf("tool.call");
  assert.equal(await toolCatch({}, { tool: "Bash" }, Object.assign(async () => "NEXT", { called: false })), "NEXT");
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const unhandled = [];
  const onUnhandled = (err) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    const footer = await eng.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: [] } });
    let toggle;
    walk(footer, (n) => n.type === "Button" && n.props.key === "mental-toggle" && (toggle = n.props.onPress));
    toggle();
    for (let i = 0; i < 4; i++) await eng.flush();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(unhandled, [], "a host.open that throws does not reject unhandled");
  assert.ok(eng.calls.some((c) => c[0] === "toast" && /couldn't place/i.test(c[1])), "the person hears why");
  const band = await eng.fire("ui.render", { component: "AbovePrompt", surface: "desktop", props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120 } });
  walk(band, (n) => n.type === "Button" && n.props.key === "band-needs" && n.props.onPress());
  for (let i = 0; i < 4; i++) await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "toast" && c[1] === "2 need you · open Mental with /mental"), "with no pane, one short line, not the list");
});

test("needsOf: verify items once, counts from heartbeat, keyed on path", async () => {
  const verify = { title: "Check the pane", kind: "verify", status: "open", path: "attention/v.md" };
  const vm = viewModelOf(
    heartbeat({
      attention: [verify, { title: "Later thing", kind: "thread", status: "later", path: "attention/l.md" }],
      needsEyes: [verify],
      attentionCount: 9,
      laterCount: 1,
      openDecisions: [{ title: "Pick a store", path: "decisions/s.md" }],
      openDecisionCount: 3,
    }),
    NOW,
  );
  const { items, total, later } = needsOf(vm);
  assert.equal(items.filter((x) => x.title === "Check the pane").length, 1, "a verify item is listed once");
  assert.equal(items[0].label, "Needs eyes");
  assert.equal(total, 8 + 3, "open attention minus later, plus decisions: not the capped list length");
  assert.equal(later, 1);
  assert.equal(items[0].key, "attention/v.md");
  const shown = visibleNeedsOf(vm, new Set(["attention/v.md"]));
  assert.equal(shown.items.length, 1);
  assert.equal(shown.total, 10);
});

test("theme: no fixed hex on any surface; tones are colour names", async () => {
  const s = newSession(NOW);
  const vm = viewModelOf(heartbeat(), NOW);
  const on = { onPark() {}, onHandoff() {}, onAskNeeds() {}, onOpenItem() {}, onBrowse() {}, onRefresh() {} };
  const trees = [];
  for (const look of [{}, { rich: true, typography: true }]) {
    trees.push(renderBand(el, bandModelOf({ vm, s, now: NOW }), {}, { ...look, columns: 120 }));
    trees.push(renderPane(el, paneModelOf({ vm, s, now: NOW }), on, look));
  }
  const engine = fakeEngine({ surfaces: ["desktop"] });
  await engine.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await engine.flush();
  trees.push(await engine.fire("ui.render", { component: "SessionMode", surface: "desktop", props: { modes: [] } }));
  const colors = new Set();
  for (const tree of trees) {
    assertValidTree(tree);
    walk(tree, (n) => n.type === "Text" && n.props.color && colors.add(n.props.color));
  }
  for (const c of colors) assert.ok(["green", "cyan", "yellow", "red", "blue"].includes(c), `colour name ${c}`);
});

test("Claude Desktop 2.1.299+: typography and a primary Park; older builds draw plain", async () => {
  for (const [version, typed] of [["2.1.312", true], ["2.1.290", false]]) {
    const eng = fakeEngine({ surfaces: ["desktop"], version });
    await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
    await eng.flush();
    await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: false, columns: 80 } });
    await eng.flush();
    const pane = await eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 48 } });
    assertValidTree(pane);
    let variant = "";
    let weights = 0;
    walk(pane, (n) => {
      if (n.type === "Button" && n.props.key === "park" && n.props.variant) variant = n.props.variant;
      if ("weight" in n.props) weights++;
    });
    assert.equal(variant, typed ? "primary" : "", version);
    assert.equal(weights > 0, typed, version);
  }
});

test("terminal: Park fills the prompt; Browse opens the same list view as Desktop", async () => {
  const eng = fakeEngine();
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  await eng.fire("command.run", { command: "mental", presentation: { isFullscreen: true, columns: 160 } });
  const paneOf = () => eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "terminal", props: { bodyColumns: 100, scroll: { bodyRows: 16 } } });
  const press = (tree, key) => walk(tree, (n) => n.type === "Button" && n.props.key === key && n.props.onPress());
  press(await paneOf(), "park");
  await eng.flush();
  assert.ok(eng.calls.some((c) => c[0] === "fill" && /Park this session/.test(c[1].text)));
  assert.ok(!eng.calls.some((c) => c[0] === "submit"), "the terminal never sends on the person's behalf");
  press(await paneOf(), "browse-decision");
  await eng.flush();
  const list = await paneOf();
  assertValidTree(list);
  assert.match(textOf(list), /Use SQLite/);
});

test("Desktop pages: lists group by status under a drawn header; entries frame the body, offer Ask, and link back", () => {
  const opened = [];
  const asked = [];
  const on = { onBack() {}, onOpenItem: (p) => opened.push(p), onAskItem: (d) => asked.push(d) };
  const look = { rich: true, typography: true, columns: 60 };
  const items = [
    { path: "attention/2026-05-10-a.md", title: "Check the band", status: "open", kind: "verify", timestamp: "2026-05-10T10:00:00Z" },
    { path: "attention/2026-05-09-b.md", title: "Cross-PC sync", status: "later", kind: "thread", timestamp: "2026-05-09T10:00:00Z" },
    { path: "attention/2026-05-01-c.md", title: "Old concern", status: "resolved", kind: "concern", timestamp: "2026-05-01T10:00:00Z" },
  ];
  const list = renderRoute(el, { view: "list", type: "Attention", status: "ok", items, total: 3 }, on, look);
  assertValidTree(list);
  const drawn = [];
  walk(list, (n) => n.type === "Svg" && drawn.push(n.props.alt));
  assert.match(drawn[0], /Threads\. 3 in Mental\. 1 open, 1 later, 1 resolved/, "the header splits the list by status");
  assert.deepEqual(drawn.slice(1), ["Open · 1", "Later · 1", "Resolved · 1"], "one drawn header per group, open first");
  assert.match(textOf(list), /● check\s*Check the band/);
  walk(list, (n) => n.type === "Button" && n.props.key === "open-0" && n.props.onPress());
  assert.deepEqual(opened, ["attention/2026-05-10-a.md"], "rows open in status order");

  const doc = {
    frontmatter: { type: "Decision", title: "Use SQLite", status: "decided", tags: ["storage"] },
    body: "# Use SQLite\n\nFast and local.",
    backlinks: [{ type: "Journal", title: "Journal — 2026-05-11", path: "journal/2026-05-11.md" }],
  };
  const item = renderRoute(el, { view: "item", path: "decisions/2026-05-10-sqlite.md", status: "ok", doc, crumb: "Mental › Decision" }, on, look);
  const keys = assertValidTree(item);
  const head = [];
  walk(item, (n) => n.type === "Svg" && head.push(n.props.alt));
  assert.match(head[0], /^Decision: Use SQLite\. May 10 · #storage\. decided$/);
  let framed = false;
  walk(item, (n) => n.type === "Box" && n.props.key === "doc" && n.props.borderStyle === "round" && (framed = true));
  assert.ok(framed, "the body sits in an outlined frame");
  walk(item, (n) => n.type === "Button" && (n.props.key === "item-ask" || n.props.key === "backlink-0") && n.props.onPress());
  assert.deepEqual(asked, [{ path: "decisions/2026-05-10-sqlite.md", title: "Use SQLite", kind: "decision" }]);
  assert.deepEqual(opened.slice(1), ["journal/2026-05-11.md"], "linked entries open in place");
  assert.ok(keys.has("back"));

  const term = renderRoute(el, { view: "list", type: "Attention", status: "ok", items, total: 3 }, on, { columns: 80 });
  walk(term, (n) => assert.notEqual(n.type, "Svg", "the terminal keeps its plain list"));
});

test("Claude Desktop: each pressable row is a Client; a press anywhere on it opens the item; a fault falls back to native rows", async () => {
  const eng = fakeEngine({ surfaces: ["desktop"], client: true });
  await eng.fire("session.start", { cwd: "/repo" }, { cwd: "/repo" });
  await eng.flush();
  const pane = () => eng.fire("ui.render", { component: "Pane", requestId: "mental", surface: "desktop", props: { bodyColumns: 60 } });
  const first = await pane();
  assertValidTree(first);
  const clients = [];
  walk(first, (n) => n.type === "Client" && clients.push(n.props));
  assert.ok(clients.length >= 6, "needs rows, the four tiles and the last hand-off");
  assert.ok(clients.every((c) => c.module === "./lib/row-client.mjs" && c.width === "100%"));
  const need = clients.find((c) => c.key === "need-0");
  assert.match(need.props.title, /Verify docked pane/);
  assert.equal(need.props.tagColor, "red", "a check is tagged red in the host's theme");

  const heard = await eng.fire("ui.message", { surface: "desktop", component: "Pane", requestId: "mental", element: "browse-decision", module: "lib/row-client.mjs", data: { press: true } });
  assert.deepEqual(heard, {});
  await eng.flush();
  const list = await pane();
  const listClients = [];
  walk(list, (n) => n.type === "Client" && listClients.push(n.props.key));
  assert.ok(listClients.includes("open-0"), "the press anywhere on the tile opened Decisions, whose rows are Clients too");

  await eng.fire("ui.fault", { surface: "desktop", component: "Pane", requestId: "mental", phase: "load", reason: "boom" });
  const native = await pane();
  walk(native, (n) => assert.notEqual(n.type, "Client", "after a fault, rows are native"));
  let lit = false;
  walk(native, (n) => n.type === "Box" && n.props.hover?.borderColor === "cyan" && (lit = true));
  assert.ok(lit, "native rows still light on hover");
});

test("row Client: hover lights the border and title; a click or Enter posts one press", async () => {
  const { default: MentalRow } = await import("../claude-mod/lib/row-client.mjs");
  const posts = [];
  let state;
  let pointer;
  let key;
  const surface = () => ({
    elements: el,
    state,
    setState: (s) => (state = s),
    onPointer: (fn) => ((pointer = fn), () => {}),
    onKey: (fn) => ((key = fn), () => {}),
    post: (d) => posts.push(d),
  });
  const props = { tag: "● check", tagColor: "red", title: "Verify the pane", detail: "Oct 28" };
  const rest = MentalRow(props, surface());
  assert.equal(rest.props.borderDimColor, true, "a quiet hairline at rest");
  assert.equal(rest.props.borderColor, undefined);
  pointer({ type: "enter", x: 3, y: 0 });
  assert.deepEqual(state, { hot: true });
  const hot = MentalRow(props, surface());
  assert.equal(hot.props.borderColor, "cyan", "the border lights under the pointer");
  assert.match(textOf(hot), /Verify the pane.*Oct 28 ›/s);
  pointer({ type: "down", x: 3, y: 0, button: "left" });
  pointer({ type: "up", x: 3, y: 0, button: "left" });
  key({ key: "return" });
  assert.deepEqual(posts, [{ press: true }, { press: true }], "one press per click, one per Enter");
  pointer({ type: "leave", x: 40, y: 0 });
  assert.deepEqual(state, { hot: false });
});
