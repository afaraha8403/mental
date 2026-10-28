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
import { logoSvg } from "./desktop.mjs";

/** Semantic tone → `Text` props. */
const TONE = {
  accent: { color: "magenta" },
  ok: { color: "green" },
  info: { color: "cyan" },
  warn: { color: "yellow" },
  danger: { color: "red" },
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
 *   onDashboard?: () => void,
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
  if (dash.state === "running" && dash.href && E.Link) return E.Link({ href: dash.href, label: "Open the dashboard ↗" });
  if (dash.state === "starting") return say(E, look, "Starting the dashboard — it opens in your browser…", { tone: "muted" });
  return button(E, look, { key: "dashboard", label: dash.state === "running" ? "Open the dashboard ↗" : "Start the dashboard", onPress: on.onDashboard });
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
