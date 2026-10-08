import { $, $$, api, badge, debounce, fuzzyScore, h, icon, relTime, fill } from "./ui.js";
import { createInspector } from "./inspector.js";
import { createPalette, renderShortcutSheet } from "./palette.js";
import { renderToday } from "./today.js";
import { renderAttention, renderDecisions } from "./boards.js";
import { renderLibrary } from "./library.js";
import { renderMapView, renderProjects, renderSitdowns, stopMap } from "./explore.js";

const THEME_KEY = "mental-dashboard-theme";
const RAIL_KEY = "mental-dashboard-rail";

/** View registry. `key` is the second key of the `g <key>` chord. */
const VIEWS = [
  { id: "today", label: "Today", icon: "today", key: "t", render: renderToday },
  { id: "attention", label: "Attention", icon: "attention", key: "a", render: renderAttention, badge: "attention" },
  { id: "library", label: "Library", icon: "library", key: "l", render: renderLibrary },
  { id: "decisions", label: "Decisions", icon: "decisions", key: "d", render: renderDecisions, badge: "decisions" },
  { id: "map", label: "Map", icon: "map", key: "m", render: renderMapView },
  { id: "sitdowns", label: "Sit-downs", icon: "sitdowns", key: "s", render: renderSitdowns, trackOnly: true },
  { id: "projects", label: "All projects", icon: "projects", key: "p", render: renderProjects },
];
const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

/** Shared app context handed to every view module. */
const ctx = {
  id: "",
  activeId: "",
  projects: [],
  trackEnabled: false,
  heartbeat: null,
  route: { view: "today", params: new URLSearchParams() },
  cache: new Map(),
  api,
  /** Query string with the selected project id. */
  qs(extra = {}) {
    const p = new URLSearchParams();
    if (ctx.id) p.set("id", ctx.id);
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  },
  /** Cached `data` payload for an API path (scoped to the current project). Null on error. */
  async get(path, extra = {}) {
    const url = `${path}${ctx.qs(extra)}`;
    if (!ctx.cache.has(url)) {
      ctx.cache.set(
        url,
        api(url).then(({ body }) => {
          if (!body?.ok) {
            ctx.cache.delete(url);
            return null;
          }
          return body.data;
        }),
      );
    }
    return ctx.cache.get(url);
  },
  invalidate() {
    ctx.cache.clear();
  },
  open: (path) => inspector.open(path),
  close: () => inspector.close(),
  go,
  setParams,
  projectName() {
    const p = ctx.projects.find((x) => x.id === ctx.id);
    return p?.name || "This folder";
  },
};

const inspector = createInspector(ctx);

// ─── Routing ────────────────────────────────────────────────────────────────

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  let [view, ...rest] = pathPart.split("/");
  if (view === "item" && rest.length) {
    params.set("open", decodeURIComponent(rest.join("/")));
    view = "today";
  }
  if (!VIEW_BY_ID[view]) view = "today";
  return { view, params };
}

function buildHash(view, params) {
  const p = new URLSearchParams(params);
  if (ctx.id && ctx.id !== ctx.activeId) p.set("p", ctx.id);
  else p.delete("p");
  for (const [k, v] of [...p.entries()]) if (v === "") p.delete(k);
  const s = p.toString();
  return `#/${view}${s ? `?${s}` : ""}`;
}

/** Navigate to a view. Params replace the current ones (project is kept). */
function go(view, params = {}) {
  const next = buildHash(view, params);
  if (next === location.hash) onRoute();
  else location.hash = next;
}

/** Update params of the current route. Re-renders the view only with `render: true`. */
function setParams(patch, { push = false, render = false } = {}) {
  const p = new URLSearchParams(ctx.route.params);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  ctx.route.params = p;
  const next = buildHash(ctx.route.view, p);
  if (push) history.pushState(null, "", next);
  else history.replaceState(null, "", next);
  lastRouteKey = routeKey(ctx.route.view, p);
  if (render) return renderView();
}

function routeKey(view, params) {
  const p = new URLSearchParams(params);
  p.delete("open");
  return `${view}?${p}`;
}

let lastRouteKey = "";
let renderToken = 0;

async function onRoute() {
  const { view, params } = parseHash();
  const wantedId = params.get("p") || ctx.activeId || "";
  if (wantedId !== ctx.id && (ctx.projects.some((p) => p.id === wantedId) || !wantedId)) {
    await switchProject(wantedId, { fromRoute: true });
  }
  const spec = VIEW_BY_ID[view];
  if (spec.trackOnly && !ctx.trackEnabled) {
    go("today");
    return;
  }
  const key = routeKey(view, params);
  const viewChanged = view !== ctx.route.view;
  ctx.route = { view, params };
  if (key !== lastRouteKey) {
    lastRouteKey = key;
    await renderView({ fresh: viewChanged });
  }
  const open = params.get("open");
  if (open) inspector.open(open, { fromRoute: true });
  else if (inspector.isOpen() && !inspector.isPinned()) inspector.close({ fromRoute: true });
}

async function renderView({ fresh = false } = {}) {
  const { view } = ctx.route;
  const spec = VIEW_BY_ID[view];
  for (const v of VIEWS) {
    const section = document.getElementById(`view-${v.id}`);
    if (section) section.hidden = v.id !== view;
  }
  if (view !== "map") stopMap();
  document.body.dataset.view = view;
  $("#crumb-view").textContent = spec.label;
  document.title = `${spec.label} · ${ctx.projectName()} · Mental`;
  for (const link of $$("[data-nav]")) {
    const on = link.dataset.nav === view;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const el = document.getElementById(`view-${view}`);
  if (fresh) el.scrollTop = 0;
  const token = ++renderToken;
  el.classList.toggle("is-loading", true);
  try {
    await spec.render(el, ctx, ctx.route.params, () => token === renderToken);
  } catch (err) {
    console.error(err);
    fill(el, h("div.empty", null, h("p.empty-title", null, "Something went wrong rendering this view."), h("p.empty-body", null, String(err?.message || err))));
  } finally {
    if (token === renderToken) el.classList.remove("is-loading");
  }
}

// ─── Projects ───────────────────────────────────────────────────────────────

async function loadProjects() {
  const { body } = await api("/api/projects");
  ctx.projects = body?.ok ? body.data.projects || [] : [];
  ctx.activeId = body?.ok ? body.data.activeId || "" : "";
  const sel = $("#project");
  fill(sel, h("option", { value: "" }, "This folder"), ...ctx.projects.map((p) => h("option", { value: p.id }, p.name)));
}

async function switchProject(id, { fromRoute = false } = {}) {
  ctx.id = id || "";
  $("#project").value = ctx.id;
  $("#project-name").textContent = ctx.projectName();
  ctx.invalidate();
  inspector.close({ fromRoute: true, force: true });
  lastRouteKey = "";
  await loadHeartbeat();
  if (!fromRoute) go(ctx.route.view === "projects" ? "today" : ctx.route.view);
}

function renderProjectOptions(filter = "") {
  const ul = $("#project-options");
  const ranked = ctx.projects
    .map((p) => ({ p, score: filter ? fuzzyScore(filter, p.name) : 0 }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || String(b.p.lastTouched || "").localeCompare(String(a.p.lastTouched || "")));
  fill(ul, 
    ...ranked.map(({ p }, i) =>
      h(
        "li",
        {
          role: "option",
          id: `proj-opt-${i}`,
          "aria-selected": String(p.id === ctx.id),
          class: i === 0 ? "hot" : "",
          dataset: { id: p.id },
          onclick: () => pickProject(p.id),
        },
        h("span.opt-name", null, p.name),
        p.id === ctx.activeId ? h("span.opt-tag", null, "here") : null,
        h("span.opt-meta", null, p.lastTouched ? relTime(p.lastTouched) : ""),
      ),
    ),
  );
  if (!ranked.length) ul.append(h("li.opt-empty", null, "No matching project"));
}

function openProjectPop() {
  const pop = $("#project-pop");
  pop.hidden = false;
  $("#project-btn").setAttribute("aria-expanded", "true");
  $("#project-filter").value = "";
  renderProjectOptions();
  $("#project-filter").focus();
}

function closeProjectPop() {
  $("#project-pop").hidden = true;
  $("#project-btn").setAttribute("aria-expanded", "false");
}

function pickProject(id) {
  closeProjectPop();
  if (id === ctx.id) return;
  switchProject(id);
}

function wireProjectSwitch() {
  $("#project-btn").addEventListener("click", () => ($("#project-pop").hidden ? openProjectPop() : closeProjectPop()));
  $("#project-filter").addEventListener("input", (e) => renderProjectOptions(e.target.value));
  $("#project-filter").addEventListener("keydown", (e) => {
    const items = $$("#project-options li[role=option]");
    let i = items.findIndex((li) => li.classList.contains("hot"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      i = Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      items.forEach((li, j) => li.classList.toggle("hot", j === i));
      items[i]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[i]) pickProject(items[i].dataset.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeProjectPop();
      $("#project-btn").focus();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!$("#project-pop").hidden && !$("#project-switch").contains(e.target)) closeProjectPop();
  });
}

// ─── Heartbeat (badges, track gate) ─────────────────────────────────────────

async function loadHeartbeat() {
  const data = await ctx.get("/api/heartbeat");
  ctx.heartbeat = data;
  ctx.trackEnabled = Boolean(data?.track?.enabled);
  for (const v of VIEWS) {
    if (!v.trackOnly) continue;
    for (const el of $$(`[data-nav="${v.id}"]`)) el.closest("li, a").hidden = !ctx.trackEnabled;
  }
  const counts = {
    attention: data?.attentionCount || 0,
    decisions: data?.openDecisionCount || 0,
  };
  for (const el of $$("[data-badge]")) {
    const n = counts[el.dataset.badge] || 0;
    el.hidden = !n;
    el.textContent = n > 99 ? "99+" : String(n);
  }
  const eyes = data?.needsEyesCount || 0;
  for (const el of $$('[data-nav="today"] .nav-dot')) el.hidden = !eyes;
  $("#live").classList.toggle("is-clock", Boolean(data?.track?.runningCount));
  $("#live .live-text").textContent = data?.track?.runningCount ? "Clock running" : "Read-only";
  $("#project-name").textContent = ctx.projectName();
}

// ─── Shell chrome ───────────────────────────────────────────────────────────

function buildNav() {
  const rail = $("#rail-nav");
  const tabs = $("#tabbar");
  fill(rail);
  fill(tabs);
  for (const v of VIEWS) {
    const b = v.badge ? badge(0) : null;
    if (b) b.dataset.badge = v.badge;
    rail.append(
      h(
        "li",
        { hidden: v.trackOnly ? true : null },
        h(
          "a.rail-link",
          { href: `#/${v.id}`, dataset: { nav: v.id }, title: `${v.label}  (g ${v.key})`, onclick: navClick(v.id) },
          icon(v.icon, 19),
          h("span.rail-label", null, v.label),
          b,
          v.id === "today" ? h("span.nav-dot", { hidden: true, title: "Something needs your eyes" }) : null,
        ),
      ),
    );
    if (["today", "attention", "library", "decisions", "map"].includes(v.id)) {
      const tb = v.badge ? badge(0) : null;
      if (tb) tb.dataset.badge = v.badge;
      tabs.append(h("a.tab-link", { href: `#/${v.id}`, dataset: { nav: v.id }, onclick: navClick(v.id) }, icon(v.icon, 20), h("span", null, v.label), tb));
    }
  }
  $("#rail-help").append(icon("keyboard", 18));
  $("#rail-help").addEventListener("click", () => openShortcuts());
  const expand = $("#rail-expand");
  expand.append(icon("chevron", 16));
  const setRail = (on) => {
    document.body.classList.toggle("rail-open", on);
    expand.setAttribute("aria-expanded", String(on));
    expand.title = on ? "Collapse sidebar" : "Expand sidebar";
    localStorage.setItem(RAIL_KEY, on ? "1" : "0");
  };
  setRail(localStorage.getItem(RAIL_KEY) === "1");
  expand.addEventListener("click", () => setRail(!document.body.classList.contains("rail-open")));
}

function navClick(view) {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const keep = view === ctx.route.view ? ctx.route.params : {};
    const p = new URLSearchParams(keep);
    p.delete("open");
    go(view, p);
  };
}

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function paintThemeButton() {
  const btn = $("#theme-toggle");
  const dark = currentTheme() === "dark";
  fill(btn, icon(dark ? "sun" : "moon", 17));
  btn.title = dark ? "Switch to light" : "Switch to dark";
}

function setTheme(next) {
  if (next === "system") {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  } else {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  }
  paintThemeButton();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  paintThemeButton();
  $("#theme-toggle").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeButton);
}

// ─── Palette, shortcuts ─────────────────────────────────────────────────────

const commands = () => [
  ...VIEWS.filter((v) => !v.trackOnly || ctx.trackEnabled).map((v) => ({
    id: `view:${v.id}`,
    label: `Go to ${v.label}`,
    hint: `g ${v.key}`,
    icon: v.icon,
    run: () => go(v.id),
  })),
  { id: "theme:dark", label: "Theme: Dark", icon: "moon", run: () => setTheme("dark") },
  { id: "theme:light", label: "Theme: Light", icon: "sun", run: () => setTheme("light") },
  { id: "theme:system", label: "Theme: Match system", icon: "sparkle", run: () => setTheme("system") },
  { id: "refresh", label: "Refresh data", hint: "r", icon: "refresh", run: () => refresh() },
  { id: "shortcuts", label: "Keyboard shortcuts", hint: "?", icon: "keyboard", run: () => openShortcuts() },
  ...(ctx.heartbeat?.handoff?.resume
    ? [{ id: "copy-resume", label: "Copy resume line", icon: "copy", run: () => navigator.clipboard.writeText(ctx.heartbeat.handoff.resume) }]
    : []),
];

const palette = createPalette(ctx, { commands, pickProject: (id) => pickProject(id), views: VIEWS });

const SHORTCUTS = [
  ["Navigation", [["⌘ K", "Search & commands"], ["g t", "Today"], ["g a", "Attention"], ["g l", "Library"], ["g d", "Decisions"], ["g m", "Map"], ["g p", "All projects"]]],
  ["Anywhere", [["/", "Focus search"], ["Esc", "Close drawer / dialog"], ["r", "Refresh data"], ["?", "This sheet"]]],
  ["Library", [["↑ ↓", "Move selection"], ["⏎", "Open in drawer"], ["[ ]", "Previous / next type"]]],
];

function openShortcuts() {
  const dlg = $("#shortcuts");
  renderShortcutSheet($("#shortcut-grid"), SHORTCUTS);
  if (!dlg.open) dlg.showModal();
}

function isTyping(target) {
  const el = target instanceof Element ? target : null;
  return Boolean(el && (el.closest("input, textarea, select, [contenteditable=true]")));
}

let chord = "";
let chordTimer = 0;

function wireKeys() {
  $("#shortcuts-close").append(icon("close", 16));
  $("#shortcuts-close").addEventListener("click", () => $("#shortcuts").close());
  $("#shortcuts").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#search-kbd").textContent = isMac ? "⌘K" : "Ctrl K";
  $(".search-trigger-icon").append(icon("search", 15));
  $("#search-trigger").addEventListener("click", () => palette.open());

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      palette.toggle();
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($("#palette").open || $("#shortcuts").open) return;
    if (e.key === "Escape") {
      if (!$("#project-pop").hidden) return closeProjectPop();
      const wrap = $("#map-wrap");
      if (wrap?.classList.contains("expanded")) return wrap.classList.remove("expanded");
      if (inspector.isOpen()) return inspector.close();
      return;
    }
    if (isTyping(e.target)) return;
    if (chord === "g") {
      chord = "";
      clearTimeout(chordTimer);
      const v = VIEWS.find((x) => x.key === e.key.toLowerCase() && (!x.trackOnly || ctx.trackEnabled));
      if (v) {
        e.preventDefault();
        go(v.id);
      }
      return;
    }
    if (e.key === "g") {
      chord = "g";
      chordTimer = window.setTimeout(() => (chord = ""), 1200);
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      openShortcuts();
    } else if (e.key === "/") {
      const field = $(`#view-${ctx.route.view} [data-search]`);
      e.preventDefault();
      if (field) field.focus();
      else palette.open();
    } else if (e.key === "r") {
      refresh();
    }
  });
}

// ─── Refresh on focus (no polling) ──────────────────────────────────────────

let lastRefresh = Date.now();

async function refresh() {
  lastRefresh = Date.now();
  ctx.invalidate();
  const { body } = await api("/api/projects");
  if (body?.ok) ctx.projects = body.data.projects || ctx.projects;
  await loadHeartbeat();
  lastRouteKey = "";
  await renderView();
  if (inspector.isOpen()) inspector.reload();
  $("#live").classList.add("pulse");
  setTimeout(() => $("#live").classList.remove("pulse"), 900);
}

const refreshSoon = debounce(() => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastRefresh < 4000) return;
  refresh();
}, 120);

// ─── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  initTheme();
  buildNav();
  wireProjectSwitch();
  wireKeys();
  await loadProjects();
  const first = parseHash();
  ctx.id = first.params.get("p") || ctx.activeId || "";
  $("#project").value = ctx.id;
  await loadHeartbeat();
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("focus", refreshSoon);
  document.addEventListener("visibilitychange", refreshSoon);
  if (!location.hash) history.replaceState(null, "", buildHash("today", {}));
  await onRoute();
  document.body.classList.add("ready");
}

boot();
