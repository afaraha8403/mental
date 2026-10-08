import { startMap } from "./map.js";
import { KIND_COLOR, tagColor, topicTags } from "./map-data.js";
import { $, clockTime, dayLabel, debounce, emptyState, h, icon, KIND, relTime, skeleton, fill } from "./ui.js";

// ─── Map ────────────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof startMap> | null} */
let map = null;
let mapKey = "";
let running = false;

export function stopMap() {
  if (map && running) map.stop();
  running = false;
}

/** @param {HTMLElement} _el */
export async function renderMapView(_el, ctx, search0, alive) {
  const toolbar = $("#map-toolbar");
  const help = $("#map-help");
  if (!map) {
    map = startMap($("#map"), (path) => ctx.open(path));
    $("#map-wrap").append(
      h(
        "div.map-legend",
        { "aria-hidden": "true" },
        Object.entries(KIND_COLOR).map(([type, color]) => h("span", null, h("i", { style: { "--dot": color } }), type)),
        h("span.legend-sep", null, "Bubble = topic \u00b7 Dot size = links \u00b7 Faded = done"),
      ),
    );
    document.addEventListener("mental:select", (e) => map?.select(e.detail?.path || ""));
  }
  const data = await ctx.get("/api/graph");
  if (!alive()) return;
  const nodes = data?.nodes || [];
  const key = `${ctx.id}|${nodes.length}|${data?.edges?.length || 0}`;
  if (key !== mapKey) {
    mapKey = key;
    map.setGraph(data || { nodes: [], edges: [] });
  }
  map.start();
  running = true;

  const params = Object.fromEntries(search0);
  const layout = params.layout || "graph";
  const activeTag = params.tag || "";
  const counts = new Map();
  for (const n of nodes) for (const t of topicTags(n)) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14);

  const query = h("input.field-input", {
    type: "search",
    placeholder: "Highlight…",
    value: params.q || "",
    "data-search": "",
    "aria-label": "Highlight files on the map",
    oninput: debounce((e) => {
      map?.setFilter({ query: e.target.value });
      ctx.setParams({ q: e.target.value || null });
    }, 150),
  });
  const layoutSeg = h(
    "div.seg",
    { role: "group", "aria-label": "Layout" },
    [
      ["graph", "Graph"],
      ["organic", "Organic"],
      ["tree", "Tree"],
    ].map(([value, label]) =>
      h(
        "button.seg-btn",
        {
          type: "button",
          "aria-pressed": String(layout === value),
          onclick: (e) => {
            for (const b of layoutSeg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === e.currentTarget));
            map?.setLayoutMode(value);
            setHelp(value);
            ctx.setParams({ layout: value === "graph" ? null : value });
          },
        },
        label,
      ),
    ),
  );
  const tagRow = h(
    "div.map-tags",
    { role: "group", "aria-label": "Topic tags" },
    tags.map(([t, n]) =>
      h(
        "button.chip.chip-tag.map-tag",
        {
          type: "button",
          "aria-pressed": String(activeTag === t),
          style: { "--tag": tagColor(t) },
          title: `${n} files`,
          onclick: (e) => {
            const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
            for (const b of tagRow.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
            e.currentTarget.setAttribute("aria-pressed", String(on));
            map?.setFilter({ tag: on ? t : "" });
            ctx.setParams({ tag: on ? t : null });
          },
        },
        h("span.tag-dot", { "aria-hidden": "true" }),
        t,
      ),
    ),
  );
  fill(toolbar, h("div.field.map-search", null, icon("search", 15), query), layoutSeg, tagRow);
  const setHelp = (mode) =>
    fill(
      help,
      mode === "graph"
        ? "Bubbles are topics (untagged files group by type). Hover to focus, click a bubble to zoom in, click a file to peek."
        : "Scroll to zoom. Drag empty space to pan. Click a tag to fold or unfold. Click a file to peek.",
      ...(data?.truncated ? [h("span.muted", null, ` Showing the ${nodes.length} most recent files.`)] : []),
    );
  setHelp(layout);

  if (layout !== "graph") map.setLayoutMode(layout);
  if (activeTag || params.q) map.setFilter({ tag: activeTag, query: params.q || "" });
  const open = search0.get("open");
  if (open) map.select(open);
}

// ─── Projects ───────────────────────────────────────────────────────────────

/** @param {HTMLElement} el */
export async function renderProjects(el, ctx, search0) {
  const sort = search0.get("sort") || "recent";
  const list = ctx.projects.slice();
  if (sort === "attention") list.sort((a, b) => (b.attentionCount || 0) - (a.attentionCount || 0) || a.name.localeCompare(b.name));
  else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else list.sort((a, b) => String(b.lastTouched || "").localeCompare(String(a.lastTouched || "")) || a.name.localeCompare(b.name));

  const head = h(
    "header.page-head",
    null,
    h("div", null, h("h1.page-title", null, "All projects"), h("p.page-sub", null, "Every Mental catalog on this machine, and where each one stands.")),
    h(
      "div.seg",
      { role: "group", "aria-label": "Sort" },
      [
        ["recent", "Recent"],
        ["attention", "Attention"],
        ["name", "Name"],
      ].map(([v, label]) =>
        h("button.seg-btn", { type: "button", "aria-pressed": String(sort === v), onclick: () => ctx.setParams({ sort: v === "recent" ? null : v }, { render: true }) }, label),
      ),
    ),
  );
  if (!list.length) {
    fill(el, 
      h(
        "div.page",
        null,
        head,
        emptyState({ icon: "🗂", title: "No other projects yet", body: "Run Mental in another repository and it appears here.", cmd: "mental init" }),
      ),
    );
    return;
  }
  fill(el, 
    h(
      "div.page.page-wide",
      null,
      head,
      h(
        "div.project-grid",
        null,
        list.map((p) => {
          const current = p.id === ctx.id;
          return h(
            "a.project-card",
            {
              href: `#/today?p=${encodeURIComponent(p.id)}`,
              class: current ? "is-current" : "",
              "aria-current": current ? "true" : null,
            },
            h(
              "span.project-top",
              null,
              h("span.project-avatar", { "aria-hidden": "true", style: { "--tag": tagColor(p.name) } }, (p.name || "?").slice(0, 1).toUpperCase()),
              h("span.project-name", null, p.name),
              current ? h("span.chip.chip-soft", null, "viewing") : null,
            ),
            p.resume
              ? h("span.project-resume", null, p.resume)
              : h("span.project-resume.muted", null, "No resume point yet."),
            h(
              "span.project-meta",
              null,
              p.outcome ? h("span.chip.chip-soft.project-outcome", { title: p.outcome }, p.outcome) : null,
              h(`span.project-stat${p.attentionCount ? ".is-hot" : ""}`, { title: "Open attention" }, h("span.mark", { "aria-hidden": "true" }, KIND.Attention.emoji), h("b.num", null, String(p.attentionCount || 0))),
              h("span.project-stat", { title: "Open decisions" }, h("span.mark", { "aria-hidden": "true" }, KIND.Decision.emoji), h("b.num", null, String(p.openDecisionCount || 0))),
              h("span.card-spacer"),
              p.lastTouched ? h("time.card-age", { datetime: p.lastTouched }, relTime(p.lastTouched)) : null,
            ),
          );
        }),
      ),
    ),
  );
}

// ─── Sit-downs (Track on only) ──────────────────────────────────────────────

/** @param {HTMLElement} el */
export async function renderSitdowns(el, ctx, search0, alive) {
  const head = h(
    "header.page-head",
    null,
    h("div", null, h("h1.page-title", null, "Sit-downs"), h("p.page-sub", null, "Each clocked sit-down and what happened during it.")),
  );
  fill(el, h("div.page", null, head, skeleton(6)));
  const { status, body } = await ctx.api(`/api/sessions${ctx.qs()}`);
  if (!alive()) return;
  if (status === 404 && body?.error?.code === "track-disabled") {
    fill(el, h("div.page", null, head, emptyState({ icon: "⏱", title: "Time tracking is off", body: "Sit-downs only appear when Track is on for this project." })));
    return;
  }
  const sessions = body?.data?.sessions || [];
  if (!sessions.length) {
    fill(el, h("div.page", null, head, emptyState({ icon: "⏱", title: "No sit-downs yet", body: "Start a clock and each sit-down lands here.", cmd: "mental track start" })));
    return;
  }
  const selected = search0.get("session") || sessions[0].id;
  const detail = h("section.sit-detail", { "aria-live": "polite" });

  /** @type {Map<string, any[]>} */
  const byDay = new Map();
  for (const s of sessions) {
    const day = String(s.started || "").slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  }
  const listEl = h(
    "nav.sit-list",
    { "aria-label": "Sit-downs" },
    [...byDay.entries()].map(([day, list]) =>
      h(
        "section.sit-day",
        null,
        h("h2.lib-group-label", null, dayLabel(day)),
        list.map((s) =>
          h(
            "button.sit-row",
            {
              type: "button",
              dataset: { id: s.id },
              "aria-pressed": String(s.id === selected),
              onclick: () => {
                for (const b of listEl.querySelectorAll(".sit-row")) b.setAttribute("aria-pressed", String(b === event?.currentTarget));
                ctx.setParams({ session: s.id });
                loadDetail(s);
              },
            },
            h(`span.sit-dot.status-${s.status}`, { "aria-hidden": "true" }),
            h("span.sit-title", null, s.title),
            h("span.sit-time.mono", null, `${clockTime(s.started)}${s.stopped ? `–${clockTime(s.stopped)}` : ""}`),
            h("span.sit-wall.num", { title: "Wall time" }, s.wall),
          ),
        ),
      ),
    ),
  );

  async function loadDetail(s) {
    fill(detail, skeleton(4));
    const res = await ctx.api(`/api/sessions${ctx.qs({ session: s.id })}`);
    if (!alive()) return;
    const events = res.body?.data?.events || [];
    fill(detail, 
      h(
        "header.sit-detail-head",
        null,
        h("p.eyebrow", null, s.status === "running" ? "Running now" : dayLabel(String(s.started).slice(0, 10))),
        h("h2.sit-detail-title", null, s.title),
        h(
          "p.sit-detail-meta",
          null,
          h("span.mono", null, `${clockTime(s.started)} → ${s.stopped ? clockTime(s.stopped) : "now"}`),
          h("span.chip.chip-soft", null, `wall ${s.wall}`),
          s.via ? h("span.chip.chip-soft", null, `via ${s.via}`) : null,
        ),
      ),
      events.length
        ? h(
            "ol.timeline.sit-events",
            null,
            events.map((ev) =>
              h(
                "li.tl-hop",
                null,
                h("span.tl-node", { "aria-hidden": "true" }),
                h(
                  ev.path ? "button.tl-card" : "div.tl-card",
                  { type: ev.path ? "button" : null, onclick: ev.path ? () => ctx.open(String(ev.path).split("#")[0]) : null },
                  h(
                    "span.tl-row",
                    null,
                    h("time.tl-time.mono", { datetime: ev.at }, clockTime(ev.at)),
                    KIND[ev.type] ? h("span.mark", { "aria-hidden": "true" }, KIND[ev.type].emoji) : null,
                    h("span.tl-title", null, ev.title || ev.type),
                  ),
                ),
              ),
            ),
          )
        : h("p.lane-empty", null, "Nothing was written during this sit-down."),
    );
  }

  fill(el, h("div.page.page-wide", null, head, h("div.sit", null, listEl, detail)));
  const first = sessions.find((s) => s.id === selected) || sessions[0];
  loadDetail(first);
}
