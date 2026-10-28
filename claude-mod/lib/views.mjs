/**
 * Element builders for the Mental panel, shared by every surface. They take
 * the constructors from `$.ui.resolve(e)` (or fakes in tests) and the plain
 * data from `model.mjs`, and return one RenderElement tree. The terminal and
 * Claude Desktop draw the same tree; `look` says what the host can do:
 *
 * - `rich`: the host draws `Svg` (Desktop, VS Code), so the logo shows.
 * - `typography`: the host takes `Text` `size`/`weight`, `Button` `variant`
 *   and `Markdown` (Claude Code 2.1.299+). Without it a tree that sets them
 *   would not draw at all, so they fall back to `bold` and plain lines.
 *
 * Only props from the mods allowlist are used, and never an `undefined` one:
 * one bad prop throws the whole tree out. No fixed colours: primary text keeps
 * the host's ink, secondary text is `dimColor`, accents are colour names the
 * host maps to its own light or dark theme.
 */

import { clip, oneLine } from "./format.mjs";
import { markdownLines, needsLabelOf } from "./model.mjs";
import { bandSvg, headSvg, heroSvg, logoSvg, pageHeadSvg, pulseSvg, widthOf } from "./desktop.mjs";

/** Semantic tone → `Text` props. */
const TONE = {
  accent: { color: "cyan" },
  ok: { color: "green" },
  info: { color: "cyan" },
  warn: { color: "yellow" },
  danger: { color: "red" },
  blue: { color: "blue" },
  muted: { dimColor: true },
};

const BREATH = ["∙", "•", "●", "•"];
const MARKDOWN_MAX = 10000;
const MAX_LIST = 30;

/** Browse targets: `mental list --type` value and label. */
export const BROWSE = [
  { type: "Journal", label: "Journal" },
  { type: "Decision", label: "Decisions" },
  { type: "Note", label: "Notes" },
  { type: "Attention", label: "Threads" },
];

const TYPE_LABEL = { Journal: "Journal", Decision: "Decision", Note: "Note", Attention: "Thread" };

/**
 * @typedef {{ Box: Function, Text: Function, Button: Function, Svg?: Function, Link?: Function, Markdown?: Function }} Elements
 * @typedef {{ rich?: boolean, typography?: boolean, columns?: number }} Look
 * @typedef {"title" | "heading" | "body" | "caption"} Size
 */

/**
 * One `Text`.
 * @param {Elements} E
 * @param {Look} look
 * @param {string} text
 * @param {{ tone?: string, size?: Size, strong?: boolean, truncate?: boolean }} [o]
 */
function say(E, look, text, o = {}) {
  /** @type {Record<string, unknown>} */
  const props = { ...(o.tone ? TONE[o.tone] || {} : {}) };
  if (look.typography) {
    if (o.size && o.size !== "body") props.size = o.size;
    if (o.strong) props.weight = "semibold";
  } else if (o.strong) props.bold = true;
  if (o.truncate) props.wrap = "truncate-end";
  props.children = [text];
  return E.Text(props);
}

/** A small uppercase label over a section. */
function caption(E, look, text) {
  return say(E, look, text.toUpperCase(), { tone: "muted", size: "caption", strong: true });
}

/**
 * One `Button`. `primary` asks for the host's filled style where it has one.
 * @param {Elements} E
 * @param {Look} look
 * @param {{ key: string, label: string, onPress: () => void, hotkey?: string, primary?: boolean, quiet?: boolean }} o
 */
function button(E, look, o) {
  /** @type {Record<string, unknown>} */
  const props = { key: o.key, label: o.label, onPress: o.onPress };
  if (o.hotkey) props.hotkey = o.hotkey;
  if (o.primary && look.typography) props.variant = "primary";
  if (o.quiet) {
    props.plain = true;
    props.dimColor = true;
  }
  return E.Button(props);
}

function column(E, key, children, gap = 0) {
  return E.Box({ key, flexDirection: "column", ...(gap ? { gap } : {}), children: children.filter(Boolean) });
}

function row(E, key, children, gap = 1) {
  return E.Box({ key, flexDirection: "row", alignItems: "center", gap, children: children.filter(Boolean) });
}

/** Room for a label on one line, in cells. */
function roomOf(look, less = 0) {
  return Math.max(24, (Number(look.columns) || 60) - 6 - less);
}

/** Header: logo (rich hosts only), project, status, branch, and any error in full. */
function headerOf(E, look, h) {
  const top = row(E, "head", [
    look.rich && E.Svg ? E.Svg({ source: logoSvg(20), alt: "Mental", width: 20, height: 20 }) : say(E, look, "◆", { tone: "accent", strong: true }),
    E.Box({ key: "head-title", flexGrow: 1, flexShrink: 1, children: [say(E, look, h.title, { size: "heading", strong: true, truncate: true })] }),
    say(E, look, `● ${h.status.label}`, { tone: h.status.tone }),
  ]);
  return column(E, "header", [
    top,
    h.meta ? say(E, look, h.meta, { tone: "muted", truncate: true }) : null,
    h.error ? say(E, look, `△ ${h.error}`, { tone: "danger" }) : null,
  ]);
}

/**
 * @typedef {{
 *   onPark: () => void, onHandoff: () => void, onAskNeeds: () => void,
 *   onOpenItem: (path: string, title?: string) => void, onBrowse: (type: string) => void,
 *   onRefresh: () => void, onTrackStart?: () => void, onTrackStop?: () => void,
 *   onDashboard?: () => void, onDashboardStop?: () => void, onDismiss?: () => void,
 * }} PaneHandlers
 */

/**
 * The `/mental` pane. Above the fold: where to pick up, the two ways to leave
 * a resume point, and what needs you, one button per item. Below: this
 * session, the clock, recent receipts, and ways to read more. The host scrolls
 * a tree taller than the pane, so nothing is cut to "+N more".
 * @param {Elements} E
 * @param {ReturnType<typeof import("./model.mjs").paneModelOf>} m
 * @param {PaneHandlers} on
 * @param {Look & { dash?: { state: string, href?: string } | null }} look
 */
export function renderPane(E, m, on, look) {
  if (look.rich && E.Svg) return renderConsole(E, m, on, look);
  const sections = [headerOf(E, look, m.header)];
  if (!m.linked) {
    sections.push(column(E, "absent", [say(E, look, m.message), m.hint ? say(E, look, m.hint, { tone: "muted" }) : null]));
    sections.push(footerOf(E, look, m, on));
    return column(E, "pane", sections, 1);
  }

  sections.push(
    column(E, "resume", [
      caption(E, look, "Pick up here"),
      m.resume ? say(E, look, m.resume.text, { size: "heading" }) : say(E, look, "No resume point yet. Park when you pause.", { tone: "muted" }),
      m.resume?.detail ? say(E, look, m.resume.detail, { tone: "muted" }) : null,
    ]),
  );

  const parkFirst = m.primary === "park";
  sections.push(
    column(E, "leave", [
      m.pressure ? say(E, look, `△ ${m.pressure}`, { tone: "warn" }) : null,
      row(E, "leave-row", [
        button(E, look, { key: "park", label: "Park", hotkey: "p", primary: parkFirst, onPress: on.onPark }),
        button(E, look, { key: "handoff", label: "Hand off", hotkey: "h", primary: !parkFirst, onPress: on.onHandoff }),
      ]),
      say(E, look, parkFirst ? "Park saves where you are. Hand off writes notes for the next chat." : "Context is nearly full: hand off so the next chat starts clean.", {
        tone: "muted",
      }),
    ]),
  );

  sections.push(needsSectionOf(E, look, m.needs, on));

  if (m.session || m.activity.length) {
    sections.push(
      column(E, "session", [
        caption(E, look, "This session"),
        m.session ? say(E, look, m.session) : null,
        ...m.activity.map((a) => say(E, look, `${a.text}${a.age ? `  ${a.age}` : ""}`, { tone: a.tone, truncate: true })),
      ]),
    );
  }

  if (m.time) {
    const t = m.time;
    const act = t.running
      ? on.onTrackStop && button(E, look, { key: "track-stop", label: "Stop clock", onPress: on.onTrackStop })
      : on.onTrackStart && button(E, look, { key: "track-start", label: "Start clock", onPress: on.onTrackStart });
    sections.push(
      column(E, "time", [
        caption(E, look, "Time"),
        row(E, "time-row", [say(E, look, t.line, { tone: t.tone }), act || null], 2),
        ...t.notes.map((n) => say(E, look, n, { tone: "warn" })),
      ]),
    );
  }

  sections.push(
    column(E, "browse", [
      caption(E, look, "Read in Mental"),
      row(
        E,
        "browse-row",
        BROWSE.map((b) => button(E, look, { key: `browse-${b.type.toLowerCase()}`, label: b.label, onPress: () => on.onBrowse(b.type) })),
      ),
      m.handoffFile ? button(E, look, { key: "browse-handoff", label: "Last hand-off ›", onPress: () => on.onOpenItem(m.handoffFile, "Last hand-off") }) : null,
      dashboardOf(E, look, on),
    ]),
  );

  sections.push(footerOf(E, look, m, on));
  return column(E, "pane", sections, 1);
}

/** The words each kind of need is tagged with in the console list. */
const NEED_TAG = { eyes: "check", concern: "concern", decision: "decide", direction: "direction", thread: "thread" };
/** Kind → native tone, so each tag reads at a glance in the host's own theme. */
const NEED_TONE = { eyes: "danger", concern: "warn", decision: "blue", direction: "accent", thread: "accent" };
/** One glyph per Read in Mental tile. */
const BROWSE_ICON = { Journal: "▤", Decision: "◆", Note: "✎", Attention: "◎" };

/**
 * The Desktop pane as a console: drawings carry the picture (where you are,
 * the thread across agents, the pulse), native controls sit right under the
 * drawing they act on, and links close it out. An `Svg` cannot be clicked, so
 * nothing actionable lives inside one.
 * @param {Elements} E
 * @param {ReturnType<typeof import("./model.mjs").paneModelOf>} m
 * @param {PaneHandlers} on
 * @param {Look & { dash?: { state: string, href?: string } | null, now?: number }} look
 */
function renderConsole(E, m, on, look) {
  const { width, picture, head, card, grow, link, press } = kitOf(E, look);
  const now = look.now ?? Date.now();
  const working = m.header.status.state === "working";
  const sections = [picture(heroSvg(m, { width, now, working }))];
  if (!m.linked) {
    sections.push(footerOf(E, look, m, on));
    return column(E, "pane", sections, 1);
  }

  const parkFirst = m.primary === "park";
  sections.push(
    column(E, "leave", [
      row(E, "leave-row", [
        button(E, look, { key: "park", label: "Park", hotkey: "p", primary: parkFirst, onPress: on.onPark }),
        button(E, look, { key: "handoff", label: "Hand off", hotkey: "h", primary: !parkFirst, onPress: on.onHandoff }),
        say(E, look, m.pressure ? `△ ${m.pressure}` : parkFirst ? "Save your place, or brief the next chat" : "Context is nearly full", {
          tone: m.pressure ? "warn" : "muted",
          truncate: true,
        }),
      ]),
    ]),
  );

  sections.push(picture(pulseSvg(m, { width, now })));


  const { items, total, later } = m.needs;
  if (total) {
    const room = roomOf(look, 16);
    const unlisted = total - items.length;
    const urgent = items.some((x) => x.kind === "eyes");
    sections.push(
      column(E, "needs", [
        head("Needs you", String(total), urgent ? "rose" : "amber"),
        ...items.map((x, i) =>
          press(`need-${i}`, { tag: `● ${NEED_TAG[x.kind] || "thread"}`, tone: NEED_TONE[x.kind] || "accent", title: clip(x.title, room) }, x.path ? () => on.onOpenItem(x.path, x.title) : on.onAskNeeds),
        ),
        row(E, "needs-more", [
          link("needs-ask", "✦ Walk me through these ›", on.onAskNeeds),
          unlisted > 0 ? link("need-more", `${unlisted} more ›`, () => on.onBrowse("Attention")) : null,
          later ? say(E, look, `· ${later} parked for later`, { tone: "muted" }) : null,
          on.onDismiss ? button(E, look, { key: "needs-hide", label: "Hide from band", quiet: true, onPress: on.onDismiss }) : null,
        ], 1),
      ], 1),
    );
  } else {
    sections.push(column(E, "needs", [head("Needs you", "all clear", "emerald"), card("needs-clear", [say(E, look, "✓ Nothing is waiting on you.", { tone: "ok" }), later ? say(E, look, `· ${later} parked for later`, { tone: "muted" }) : null])], 1));
  }

  if (m.activity.length) {
    sections.push(
      column(E, "receipts", [
        head("Just recorded"),
        ...m.activity.map((a, i) => card(`receipt-${i}`, [grow(`receipt-t-${i}`, say(E, look, a.text, { tone: a.tone, truncate: true })), a.age ? say(E, look, a.age, { tone: "muted" }) : null])),
      ], 1),
    );
  }

  if (m.time) {
    const t = m.time;
    const act = t.running
      ? on.onTrackStop && link("track-stop", "■ Stop", on.onTrackStop)
      : on.onTrackStart && link("track-start", "▶ Start", on.onTrackStart);
    sections.push(
      column(E, "time", [
        head("Time", t.running ? "running" : "", "emerald"),
        card("time-row", [grow("time-line", say(E, look, t.line, { tone: t.running ? "ok" : "muted", strong: t.running })), act || null]),
        ...t.notes.slice(0, 1).map((n) => say(E, look, n, { tone: "muted" })),
      ], 1),
    );
  }

  const tile = (b) => E.Box({ key: `tile-${b.type}`, flexGrow: 1, flexShrink: 1, children: [press(`browse-${b.type.toLowerCase()}`, { tag: BROWSE_ICON[b.type], tagWidth: 2, tone: "accent", title: b.label }, () => on.onBrowse(b.type))] });
  sections.push(
    column(E, "browse", [
      head("Read in Mental"),
      row(E, "tiles-a", BROWSE.slice(0, 2).map(tile), 1),
      row(E, "tiles-b", BROWSE.slice(2).map(tile), 1),
      m.handoffFile
        ? press("browse-handoff", { tag: "↩", tagWidth: 2, tone: "accent", title: "Last hand-off", ...(m.resume?.detail ? { detail: clip(m.resume.detail.split(" · ").slice(-2).join(" · "), 24) } : {}) }, () => on.onOpenItem(m.handoffFile, "Last hand-off"))
        : null,
    ], 1),
  );

  const dash = consoleDashboardOf(E, look, on, { card, grow, link });
  if (dash) sections.push(column(E, "dashboard", [head("Dashboard", look.dash?.state === "running" ? "live" : "", "emerald"), dash], 1));

  sections.push(
    E.Box({
      key: "foot",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      children: [m.updated ? say(E, look, m.updated, { tone: "muted" }) : say(E, look, "", { tone: "muted" }), button(E, look, { key: "refresh", label: "↻ Refresh", hotkey: "r", quiet: true, onPress: on.onRefresh })],
    }),
  );
  return column(E, "pane", sections, 1);
}

/** The dashboard as one outlined row: a status dot, what it is doing, and the action that fits. */
function consoleDashboardOf(E, look, on, { card, grow, link }) {
  const dash = look.dash;
  if (!dash || !on.onDashboard) return null;
  if (dash.state === "running") {
    const open = dash.href && E.Link ? E.Link({ href: dash.href, label: "Open ↗" }) : link("dashboard", "Open ↗", on.onDashboard);
    return card("dash-row", [say(E, look, "●", { tone: "ok" }), grow("dash-l", say(E, look, "Running", { strong: true })), open, on.onDashboardStop ? link("dashboard-stop", "■ Stop", on.onDashboardStop) : null]);
  }
  if (dash.state === "starting") return card("dash-row", [say(E, look, "◌", { tone: "accent" }), say(E, look, "Starting — it opens in your browser…", { tone: "muted" })]);
  return card("dash-row", [say(E, look, "○", { tone: "muted" }), grow("dash-l", say(E, look, "Not running", { tone: "muted" })), link("dashboard", "▶ Start", on.onDashboard)]);
}

/** "Needs you": one button per item that opens it, then one that asks Claude to walk through them. */
function needsSectionOf(E, look, needs, on) {
  const { items, total, later } = needs;
  if (!total) {
    return column(E, "needs", [
      caption(E, look, "Needs you"),
      say(E, look, "✓ Nothing is waiting on you.", { tone: "ok" }),
      later ? say(E, look, `${later} parked for later`, { tone: "muted" }) : null,
    ]);
  }
  const room = roomOf(look);
  const rows = items.map((x, i) =>
    button(E, look, {
      key: `need-${i}`,
      label: clip(`${x.label}: ${x.title}`, room),
      ...(i < 9 ? { hotkey: String(i + 1) } : {}),
      onPress: x.path ? () => on.onOpenItem(x.path, x.title) : on.onAskNeeds,
    }),
  );
  const unlisted = total - items.length;
  return column(E, "needs", [
    say(E, look, needsLabelOf(total).toUpperCase(), { tone: items.some((x) => x.tone === "danger") ? "danger" : "warn", size: "caption", strong: true }),
    ...rows,
    unlisted > 0 ? button(E, look, { key: "need-more", label: `${unlisted} more in Threads ›`, quiet: true, onPress: () => on.onBrowse("Attention") }) : null,
    later ? say(E, look, `${later} parked for later`, { tone: "muted" }) : null,
    button(E, look, { key: "needs-ask", label: "Walk me through these", onPress: on.onAskNeeds }),
  ]);
}

/** The dashboard: a native link when one runs (it serves every project), else a button that starts one. */
function dashboardOf(E, look, on) {
  const dash = look.dash;
  if (!dash || !on.onDashboard) return null;
  if (dash.state === "running") {
    const open = dash.href && E.Link
      ? E.Link({ href: dash.href, label: "Open the dashboard ↗" })
      : button(E, look, { key: "dashboard", label: "Open the dashboard ↗", onPress: on.onDashboard });
    const stop = on.onDashboardStop ? button(E, look, { key: "dashboard-stop", label: "Stop", quiet: true, onPress: on.onDashboardStop }) : null;
    return row(E, "dash-row", [open, stop], 2);
  }
  if (dash.state === "starting") return say(E, look, "Starting the dashboard — it opens in your browser…", { tone: "muted" });
  return button(E, look, { key: "dashboard", label: "Start the dashboard", onPress: on.onDashboard });
}

function footerOf(E, look, m, on) {
  return row(E, "foot", [m.updated ? say(E, look, m.updated, { tone: "muted" }) : null, button(E, look, { key: "refresh", label: "Refresh", hotkey: "r", quiet: true, onPress: on.onRefresh })], 2);
}

const dateOfPath = (p) => String(p || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";

/**
 * A list of one kind of entry, or one entry's body, with a Back button.
 * @param {Elements} E
 * @param {any} route
 * @param {{ onBack: () => void, onOpenItem: (path: string, title?: string) => void }} on
 * @param {Look} look
 */
export function renderRoute(E, route, on, look) {
  if (look.rich && E.Svg) return renderRouteConsole(E, route, on, look);
  const children = [
    row(E, "route-back", [
      button(E, look, { key: "back", label: "‹ Back", hotkey: "b", onPress: on.onBack }),
      say(E, look, route.view === "list" ? "Mental" : route.crumb || "Mental", { tone: "muted", truncate: true }),
    ]),
  ];
  const note = (text, tone = "muted") => say(E, look, text, { tone });
  if (route.view === "list") {
    const label = route.type === "Attention" ? "Threads" : `${TYPE_LABEL[route.type] || route.type}s`;
    const items = (route.items || []).slice();
    if (route.type === "Journal") items.sort((a, b) => String(b.path).localeCompare(String(a.path)));
    const shown = items.slice(0, MAX_LIST);
    children.push(
      column(E, "route-head", [say(E, look, label, { size: "title", strong: true }), route.status === "ok" ? note(`${route.total ?? items.length} in Mental`) : null]),
    );
    if (route.status === "loading") children.push(note("Reading…"));
    else if (route.status === "error") children.push(note("Couldn't read that. Go back and try again.", "danger"));
    else if (!shown.length) children.push(note(`No ${label.toLowerCase()} yet.`));
    else {
      const room = roomOf(look);
      shown.forEach((it, i) => {
        const meta = [it.status, dateOfPath(it.path)].filter(Boolean).join(" · ");
        const title = oneLine(it.title) || it.path;
        children.push(
          button(E, look, { key: `open-${i}`, label: clip(meta ? `${title} — ${meta}` : title, room), onPress: () => on.onOpenItem(it.path, oneLine(it.title)) }),
        );
      });
      if (items.length > shown.length) children.push(note(`Showing the newest ${shown.length} of ${route.total ?? items.length}. The dashboard has the rest.`));
    }
    return column(E, "route", children, 1);
  }
  const doc = route.doc;
  const fm = doc?.frontmatter || {};
  const kind = TYPE_LABEL[fm.type] || fm.type || "";
  const meta = [kind, fm.status, dateOfPath(route.path) || String(fm.timestamp || "").slice(0, 10), Array.isArray(fm.tags) ? fm.tags.slice(0, 4).join(" ") : ""]
    .filter(Boolean)
    .join(" · ");
  children.push(column(E, "route-head", [say(E, look, oneLine(fm.title || route.title || route.path), { size: "title", strong: true }), meta ? note(meta) : null]));
  if (route.status === "loading") children.push(note("Reading…"));
  else if (route.status === "error" || !doc) children.push(note("Couldn't open that. Go back and try again.", "danger"));
  else {
    if (fm.description) children.push(say(E, look, oneLine(fm.description)));
    children.push(bodyOf(E, look, doc.body));
    const backlinks = Array.isArray(doc.backlinks) ? doc.backlinks.length : 0;
    if (backlinks) children.push(note(`${backlinks} other entr${backlinks === 1 ? "y links" : "ies link"} here.`));
  }
  return column(E, "route", children, 1);
}

/**
 * The console's building blocks for one width: drawings, outlined rows (a
 * rounded hairline the host draws in its own theme), and link-style buttons.
 * @param {Elements} E
 * @param {Look} look
 */
function kitOf(E, look) {
  const width = widthOf(look.columns);
  const picture = (built) => E.Svg({ source: built.source, alt: built.alt, width, height: built.height });
  return {
    width,
    picture,
    head: (label, right = "", tone = "accent") => picture(headSvg({ label, right, tone }, { width })),
    card: (key, children, extra = {}) =>
      E.Box({ key, flexDirection: "row", alignItems: "center", gap: 1, borderStyle: "round", borderDimColor: true, paddingX: 1, ...extra, children: children.filter(Boolean) }),
    grow: (key, child) => E.Box({ key, flexGrow: 1, flexShrink: 1, children: [child] }),
    link: (key, label, onPress) => E.Button({ key, label, plain: true, onPress }),
    press: (key, spec, onPress) => pressRow(E, look, key, spec, onPress),
  };
}

/** The hover a native row takes while the pointer is on it: a teal border. */
const ROW_HOVER = { borderColor: "cyan", borderDimColor: false };

/**
 * One row that is a single target. Where the host gives a row `Client`
 * (`look.client`), the whole row takes the pointer: it lights on hover and a
 * click anywhere runs `onPress`. Elsewhere it is a native outlined row whose
 * border and title light on hover, pressed through its title.
 * @param {Elements} E
 * @param {Look & { client?: (key: string, props: object, onPress: () => void) => any }} look
 * @param {string} key the action's key; the native title Button keeps it
 * @param {{ tag?: string, tone?: string, tagWidth?: number, title: string, detail?: string }} spec
 * @param {() => void} onPress
 */
function pressRow(E, look, key, spec, onPress) {
  const tagColor = TONE[spec.tone || "accent"]?.color;
  if (look.client) {
    return look.client(
      key,
      { title: spec.title, ...(spec.tag ? { tag: spec.tag, tagWidth: spec.tagWidth || 11 } : {}), ...(tagColor ? { tagColor } : {}), ...(spec.detail ? { detail: spec.detail } : {}) },
      onPress,
    );
  }
  return E.Box({
    key: `${key}-row`,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    borderStyle: "round",
    borderDimColor: true,
    paddingX: 1,
    hover: ROW_HOVER,
    children: [
      spec.tag ? E.Box({ key: `${key}-tag`, width: spec.tagWidth || 11, flexShrink: 0, children: [say(E, look, spec.tag, { tone: spec.tone || "accent", strong: true })] }) : null,
      E.Box({ key: `${key}-title`, flexGrow: 1, flexShrink: 1, children: [E.Button({ key, label: spec.title, plain: true, hover: { color: "cyan", bold: true }, onPress })] }),
      spec.detail ? say(E, look, spec.detail, { tone: "muted" }) : null,
    ].filter(Boolean),
  });
}

/** Status → tone and short tag, per kind of entry. */
const STATUS_TONE = {
  open: "warn",
  deferred: "info",
  decided: "ok",
  accepted: "ok",
  superseded: "muted",
  obsolete: "muted",
  active: "accent",
  draft: "muted",
  resolved: "ok",
  later: "info",
};
const ATTENTION_TAG = { verify: "check", concern: "concern", thread: "thread", direction: "direction" };
const ATTENTION_TONE = { verify: "danger", concern: "warn", thread: "accent", direction: "accent" };
const LIST_GROUPS = {
  Attention: [
    { label: "Open", match: (it) => it.status === "open", tone: "warn" },
    { label: "Later", match: (it) => it.status === "later", tone: "info", max: 10 },
    { label: "Resolved", match: (it) => it.status === "resolved", tone: "ok", max: 8 },
  ],
  Decision: [
    { label: "Open", match: (it) => it.status === "open" || it.status === "deferred", tone: "warn" },
    { label: "Decided", match: (it) => it.status === "decided" || it.status === "accepted", tone: "ok" },
    { label: "Superseded", match: (it) => it.status === "superseded" || it.status === "obsolete", tone: "muted", max: 8 },
  ],
  Note: [
    { label: "Active", match: (it) => it.status !== "draft" && it.status !== "superseded" && it.status !== "obsolete", tone: "accent" },
    { label: "Draft", match: (it) => it.status === "draft", tone: "muted" },
    { label: "Superseded", match: (it) => it.status === "superseded" || it.status === "obsolete", tone: "muted", max: 8 },
  ],
};
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 26" from an entry's path date, or "". */
function shortDateOf(path) {
  const d = dateOfPath(path);
  if (!d) return "";
  const [, m, day] = d.split("-").map(Number);
  return `${SHORT_MONTHS[m - 1]} ${day}`;
}

/** A list's entries in labelled groups: by status, or by month for the journal. */
function groupsOf(type, items) {
  if (type === "Journal") {
    const byMonth = new Map();
    for (const it of items.slice().sort((a, b) => String(b.path).localeCompare(String(a.path)))) {
      const d = dateOfPath(it.path);
      const key = d ? `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "Undated";
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(it);
    }
    return [...byMonth].map(([label, list]) => ({ label, items: list, tone: "accent" }));
  }
  const defs = LIST_GROUPS[type] || [{ label: "All", match: () => true, tone: "accent" }];
  const newest = (a, b) => String(b.timestamp || b.path).localeCompare(String(a.timestamp || a.path));
  return defs.map((g) => ({ ...g, items: items.filter(g.match).sort(newest) })).filter((g) => g.items.length);
}

/**
 * The console's pages: a list of one kind of entry, grouped and coloured by
 * status under a drawn header, or one entry with its body framed and the
 * entries that link to it.
 * @param {Elements} E
 * @param {any} route
 * @param {{ onBack: () => void, onOpenItem: (path: string, title?: string) => void, onAskItem?: (doc: { path: string, title: string, kind: string }) => void }} on
 * @param {Look} look
 */
function renderRouteConsole(E, route, on, look) {
  const { width, picture, head, card, link, press } = kitOf(E, look);
  const room = roomOf(look, 18);
  const children = [
    row(E, "route-back", [
      button(E, look, { key: "back", label: "‹ Back", hotkey: "b", onPress: on.onBack }),
      say(E, look, route.view === "list" ? "Mental" : route.crumb || "Mental", { tone: "muted", truncate: true }),
    ]),
  ];
  const state = (key, glyph, text, tone = "muted") => card(key, [say(E, look, glyph, { tone }), say(E, look, text, { tone })]);

  if (route.view === "list") {
    const label = route.type === "Attention" ? "Threads" : `${TYPE_LABEL[route.type] || route.type}s`;
    const items = route.items || [];
    const total = route.total ?? items.length;
    const groups = route.status === "ok" ? groupsOf(route.type, items) : [];
    children.push(
      picture(
        pageHeadSvg(
          {
            eyebrow: "Read in Mental",
            title: label,
            sub: route.status === "ok" ? `${total} in Mental${total > items.length ? ` · newest ${items.length} shown` : ""}` : "",
            segments: route.type === "Journal" ? [] : groups.map((g) => ({ label: g.label, n: g.items.length, tone: g.tone })),
          },
          { width },
        ),
      ),
    );
    if (route.status === "loading") children.push(state("route-state", "◌", "Reading…"));
    else if (route.status === "error") children.push(state("route-state", "△", "Couldn't read that. Go back and try again.", "danger"));
    else if (!groups.length) children.push(state("route-state", "○", `No ${label.toLowerCase()} yet.`));
    else {
      let n = 0;
      for (const g of groups) {
        const shown = g.items.slice(0, Math.max(0, Math.min(g.max ?? MAX_LIST, MAX_LIST - n)));
        if (!shown.length) continue;
        const rows = shown.map((it) => {
          const i = n++;
          const kind = route.type === "Attention" ? it.kind || "thread" : "";
          const tag = route.type === "Journal" ? "▤" : route.type === "Attention" ? `● ${ATTENTION_TAG[kind] || kind}` : `● ${it.status || "note"}`;
          const tone = route.type === "Journal" ? "accent" : route.type === "Attention" ? (it.status === "resolved" ? "muted" : ATTENTION_TONE[kind] || "accent") : STATUS_TONE[it.status] || "accent";
          const title = oneLine(it.title).replace(/^Journal — /, "") || it.path;
          const date = route.type === "Journal" ? "" : shortDateOf(it.path);
          return press(`open-${i}`, { tag, tone, tagWidth: route.type === "Journal" ? 2 : 11, title: clip(title, room), ...(date ? { detail: date } : {}) }, () => on.onOpenItem(it.path, oneLine(it.title)));
        });
        const more = g.items.length - shown.length;
        children.push(column(E, `group-${g.label}`, [head(g.label, String(g.items.length), TONE_KEY_OF[g.tone] || "accent"), ...rows, more > 0 ? say(E, look, `+ ${more} more in the dashboard`, { tone: "muted" }) : null], 1));
      }
    }
    return column(E, "route", children, 1);
  }

  const doc = route.doc;
  const fm = doc?.frontmatter || {};
  const kind = TYPE_LABEL[fm.type] || fm.type || "Entry";
  const title = oneLine(fm.title || route.title || route.path);
  const tags = Array.isArray(fm.tags) ? fm.tags.slice(0, 4).map((t) => `#${t}`) : [];
  const date = shortDateOf(route.path) || String(fm.timestamp || "").slice(0, 10);
  const status = fm.status ? { label: fm.status, tone: fm.type === "Attention" && fm.kind === "verify" && fm.status === "open" ? "danger" : STATUS_TONE[fm.status] || "accent" } : null;
  children.push(
    picture(
      pageHeadSvg(
        {
          eyebrow: fm.type === "Attention" && fm.kind ? `${kind} · ${ATTENTION_TAG[fm.kind] || fm.kind}` : kind,
          title,
          sub: [date, fm.via ? `via ${fm.via}` : "", ...tags].filter(Boolean).join(" · "),
          status,
        },
        { width },
      ),
    ),
  );
  if (route.status === "loading") children.push(state("route-state", "◌", "Reading…"));
  else if (route.status === "error" || !doc) children.push(state("route-state", "△", "Couldn't open that. Go back and try again.", "danger"));
  else {
    if (fm.description && oneLine(fm.description) !== title) children.push(say(E, look, oneLine(fm.description), { tone: "muted" }));
    if (on.onAskItem) {
      children.push(row(E, "item-actions", [link("item-ask", "✦ Ask Claude about this ›", () => on.onAskItem({ path: route.path, title, kind: kind.toLowerCase() }))], 2));
    }
    children.push(E.Box({ key: "doc", flexDirection: "column", borderStyle: "round", borderDimColor: true, paddingX: 1, paddingY: 0, children: [bodyOf(E, look, doc.body)] }));
    const links = Array.isArray(doc.backlinks) ? doc.backlinks.filter((b) => b?.path) : [];
    if (links.length) {
      children.push(
        column(E, "backlinks", [
          head("Linked from", String(links.length)),
          ...links.slice(0, 12).map((b, i) =>
            press(`backlink-${i}`, { tag: `● ${(TYPE_LABEL[b.type] || b.type || "entry").toLowerCase()}`, tone: "accent", title: clip(oneLine(b.title) || b.path, room) }, () => on.onOpenItem(b.path, oneLine(b.title))),
          ),
        ], 1),
      );
    }
  }
  return column(E, "route", children, 1);
}

/** Native tone → console palette key for drawn headers. */
const TONE_KEY_OF = { ok: "emerald", warn: "amber", danger: "rose", info: "sky", accent: "accent", muted: "ink4" };

/** A note's body: the host's own Markdown where it has one, else plain lines. */
function bodyOf(E, look, body) {
  const text = String(body || "")
    .replace(/\r\n?/g, "\n")
    // Markdown takes tab and newline as its only control characters.
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  if (look.typography && E.Markdown) {
    return E.Markdown({ text: text.length > MARKDOWN_MAX ? `${text.slice(0, MARKDOWN_MAX - 1)}…` : text });
  }
  return column(
    E,
    "route-body",
    markdownLines(text).map((l) => say(E, look, l.text || " ", { strong: !!l.bold, tone: l.dim ? "muted" : "" })),
  );
}

/**
 * The band above the prompt: status, the resume point, what needs you, and
 * one line of news. On rich hosts "N need you" is a button that opens the pane.
 * @param {Elements} E
 * @param {ReturnType<typeof import("./model.mjs").bandModelOf>} m
 * @param {{ onNeeds?: () => void, onDismiss?: () => void }} on
 * @param {Look & { maxRows?: number, frame?: number }} look
 */
export function renderBand(E, m, on, look) {
  const cols = Math.max(40, Number(look.columns) || 100);
  const needs = m.needs ? needsLabelOf(m.needs) : "";
  if (look.rich && E.Svg) {
    const stripWidth = widthOf(cols - (needs ? needs.length + 6 : 0));
    const built = bandSvg(m, { width: stripWidth, name: m.name });
    return row(E, "band", [
      E.Box({ key: "band-strip", flexGrow: 1, flexShrink: 1, children: [E.Svg({ source: built.source, alt: built.alt, width: stripWidth, height: built.height })] }),
      needs && on.onNeeds ? E.Button({ key: "band-needs", label: `${needs} ›`, plain: true, onPress: on.onNeeds }) : null,
    ]);
  }
  const pulse = m.working && !look.rich ? `${BREATH[(look.frame || 0) % BREATH.length]} ` : "● ";
  const fixed = 9 + m.status.label.length + 3 + (needs ? needs.length + 4 : 0) + (m.hideable && on.onDismiss ? 8 : 0);
  const head = row(E, "band-head", [
    look.rich && E.Svg ? E.Svg({ source: logoSvg(16), alt: "Mental", width: 16, height: 16 }) : say(E, look, "◆", { tone: "accent" }),
    say(E, look, "Mental", { strong: true }),
    say(E, look, `${pulse}${m.status.label}`, { tone: m.status.tone }),
    E.Box({ key: "band-msg", flexGrow: 1, flexShrink: 1, children: [say(E, look, clip(m.message, Math.max(8, cols - fixed)), { tone: "muted", truncate: true })] }),
    needs && on.onNeeds
      ? button(E, look, { key: "band-needs", label: `${needs} ›`, onPress: on.onNeeds })
      : needs
        ? say(E, look, needs, { tone: "warn", strong: true })
        : null,
    m.hideable && on.onDismiss ? button(E, look, { key: "band-dismiss", label: "Hide", onPress: on.onDismiss }) : null,
  ]);
  const rows = [head];
  if (m.second && (look.maxRows ?? 2) >= 2) rows.push(say(E, look, clip(m.second.text, cols), { tone: m.second.tone, truncate: true }));
  return column(E, "band", rows);
}

/**
 * The persistent opener in the Desktop prompt footer (the `SessionMode` site):
 * logo and the button that opens or hides the pane, with the status and what
 * needs you when the band is not showing them. Keeps the host's mode labels.
 * @param {Elements} E
 * @param {{ band: ReturnType<typeof import("./model.mjs").bandModelOf>, isOpen: boolean, bandSeen: boolean, modes: string[] }} m
 * @param {{ onToggle: () => void, onDismiss?: () => void }} on
 * @param {Look} look
 */
export function renderFooter(E, m, on, look) {
  const parts = ["Mental"];
  if (!m.bandSeen) {
    parts.push(m.band.status.label);
    if (m.band.needs) parts.push(needsLabelOf(m.band.needs));
  }
  return row(E, "mental-foot", [
    E.Svg ? E.Svg({ source: logoSvg(16), alt: "Mental", width: 16, height: 16 }) : null,
    button(E, look, { key: "mental-toggle", label: `${parts.join(" · ")}  ${m.isOpen ? "◧" : "◨"}`, onPress: on.onToggle }),
    !m.bandSeen && m.band.hideable && on.onDismiss ? button(E, look, { key: "mental-dismiss", label: "Hide", onPress: on.onDismiss }) : null,
    m.modes.length ? say(E, look, m.modes.join(" & "), { tone: "muted" }) : null,
  ]);
}
