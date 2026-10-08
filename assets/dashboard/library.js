import { listAll } from "./boards.js";
import { $$, debounce, emptyState, h, icon, KIND, pathDate, relTime, skeleton, statusChip, toDate, TYPES, fill } from "./ui.js";

const PAGE_ROWS = 150;

/** Bucket label for a `YYYY-MM-DD`: Today, Yesterday, This week, then month. */
function bucket(ymd, now = new Date()) {
  const d = toDate(ymd);
  if (!d) return "Undated";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return d.toLocaleDateString(undefined, { month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** @param {HTMLElement} el */
export async function renderLibrary(el, ctx, search0, alive) {
  const state = {
    type: search0.get("type") || "",
    status: search0.get("status") || "",
    tag: search0.get("tag") || "",
    q: search0.get("q") || "",
    limit: PAGE_ROWS,
    sel: 0,
    hits: /** @type {any[] | null} */ (null),
  };
  fill(el, h("div.page.page-wide", null, h("div.lib", null, h("aside.lib-facets", null, skeleton(8)), h("div.lib-main", null, skeleton(10)))));
  const res = await listAll(ctx, {});
  if (!alive()) return;
  if (!res) {
    fill(el, h("div.page", null, emptyState({ icon: "🔌", title: "Couldn't load the library" })));
    return;
  }
  const all = res.items.slice().sort((a, b) => pathDate(b.path).localeCompare(pathDate(a.path)) || a.title.localeCompare(b.title));
  if (!all.length) {
    fill(el, 
      h(
        "div.page",
        null,
        emptyState({ icon: "📚", title: "The library is empty", body: "Notes, decisions, attention, and journals you write show up here.", cmd: 'mental note --title "…"' }),
      ),
    );
    return;
  }

  const facets = h("aside.lib-facets", { "aria-label": "Filters" });
  const list = h("div.lib-list", { role: "listbox", "aria-label": "Results", tabindex: "0" });
  const summary = h("p.lib-summary", { "aria-live": "polite" });
  const input = h("input.field-input", {
    type: "search",
    placeholder: "Search titles and bodies…",
    value: state.q,
    "data-search": "",
    "aria-label": "Search the library",
    autocomplete: "off",
  });
  const fieldWrap = h("div.field.lib-search", null, icon("search", 16), input, h("kbd.kbd", null, "/"));

  const sync = () => ctx.setParams({ type: state.type || null, status: state.status || null, tag: state.tag || null, q: state.q || null });

  const runSearch = debounce(async () => {
    const q = state.q.trim();
    if (q.length < 2) {
      state.hits = null;
      paint();
      return;
    }
    const data = await ctx.get("/api/search", { q, limit: 100 });
    if (!alive() || state.q.trim() !== q) return;
    state.hits = data?.hits || [];
    paint();
  }, 180);

  input.addEventListener("input", () => {
    state.q = input.value;
    state.sel = 0;
    state.limit = PAGE_ROWS;
    sync();
    runSearch();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list.focus();
      move(0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      openSel();
    } else if (e.key === "Escape" && input.value) {
      e.stopPropagation();
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
  });

  function filtered() {
    const pool = state.hits ?? all;
    return pool.filter(
      (i) =>
        (!state.type || i.type === state.type) &&
        (!state.status || i.status === state.status) &&
        (!state.tag || (i.tags || []).includes(state.tag)),
    );
  }

  function setFacet(patch) {
    Object.assign(state, patch, { sel: 0, limit: PAGE_ROWS });
    sync();
    paint();
  }

  function paintFacets(pool) {
    const scope = (skip) =>
      pool.filter(
        (i) =>
          (skip === "type" || !state.type || i.type === state.type) &&
          (skip === "status" || !state.status || i.status === state.status) &&
          (skip === "tag" || !state.tag || (i.tags || []).includes(state.tag)),
      );
    const typePool = scope("type");
    const statusPool = scope("status");
    const tagPool = scope("tag");
    const count = (arr, fn) => arr.reduce((n, i) => n + (fn(i) ? 1 : 0), 0);
    const statuses = [...new Set(statusPool.map((i) => i.status).filter(Boolean))].sort();
    const tagCounts = new Map();
    for (const i of tagPool) for (const t of i.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);

    const facetBtn = (on, label, n, onclick, mark) =>
      h(
        "button.facet",
        { type: "button", "aria-pressed": String(on), onclick },
        mark ? h("span.mark", { "aria-hidden": "true" }, mark) : null,
        h("span.facet-label", null, label),
        h("span.facet-count.num", null, String(n)),
      );

    fill(facets, 
      h(
        "section.facet-group",
        null,
        h("h2.eyebrow", null, "Type"),
        facetBtn(!state.type, "Everything", typePool.length, () => setFacet({ type: "" }), "✦"),
        TYPES.map((t) => facetBtn(state.type === t, KIND[t].plural, count(typePool, (i) => i.type === t), () => setFacet({ type: state.type === t ? "" : t }), KIND[t].emoji)),
      ),
      statuses.length
        ? h(
            "section.facet-group",
            null,
            h("h2.eyebrow", null, "Status"),
            statuses.map((s) => facetBtn(state.status === s, s, count(statusPool, (i) => i.status === s), () => setFacet({ status: state.status === s ? "" : s }))),
          )
        : null,
      tags.length
        ? h(
            "section.facet-group",
            null,
            h("h2.eyebrow", null, "Tags"),
            h(
              "div.tag-cloud",
              null,
              tags.map(([t, n]) =>
                h(
                  "button.chip.chip-tag",
                  { type: "button", "aria-pressed": String(state.tag === t), onclick: () => setFacet({ tag: state.tag === t ? "" : t }), title: `${n} items` },
                  `#${t}`,
                  h("span.num.tag-n", null, String(n)),
                ),
              ),
            ),
          )
        : null,
      state.type || state.status || state.tag
        ? h("button.link-btn.facet-clear", { type: "button", onclick: () => setFacet({ type: "", status: "", tag: "" }) }, icon("close", 13), "Clear filters")
        : null,
    );
  }

  let rows = /** @type {any[]} */ ([]);

  function paint() {
    const pool = state.hits ?? all;
    paintFacets(pool);
    rows = filtered();
    const shown = rows.slice(0, state.limit);
    const searching = state.hits != null;
    fill(summary, 
      searching ? `${rows.length} match${rows.length === 1 ? "" : "es"} for “${state.q.trim()}”` : `${rows.length} item${rows.length === 1 ? "" : "s"}`,
      res.capped && !searching ? h("span.muted", null, ` · first ${all.length} loaded`) : null,
    );
    if (!shown.length) {
      fill(list, 
        emptyState({
          icon: searching ? "🔎" : "🗂",
          title: searching ? "No matches" : "Nothing with these filters",
          body: searching ? "Try fewer words, or clear a filter." : "Clear a filter to widen the view.",
        }),
      );
      return;
    }
    const groups = [];
    let cur = null;
    shown.forEach((item, idx) => {
      const b = searching ? "Best matches" : bucket(pathDate(item.path));
      if (!cur || cur.label !== b) {
        cur = { label: b, items: [] };
        groups.push(cur);
      }
      cur.items.push([item, idx]);
    });
    const openPath = ctx.route.params.get("open");
    fill(list, 
      ...groups.map((g) =>
        h(
          "section.lib-group",
          { role: "group", "aria-label": g.label },
          h("h3.lib-group-label", null, g.label, h("span.num", null, String(g.items.length))),
          g.items.map(([item, idx]) => row(item, idx, item.path === openPath, searching)),
        ),
      ),
      rows.length > shown.length
        ? h(
            "button.btn.btn-ghost.lib-more",
            {
              type: "button",
              onclick: () => {
                state.limit += PAGE_ROWS;
                paint();
              },
            },
            `Show ${Math.min(PAGE_ROWS, rows.length - shown.length)} more`,
          )
        : null,
    );
    highlight(false);
  }

  function row(item, idx, isOpen, searching) {
    const when = pathDate(item.path);
    const snippet = searching ? cleanSnippet(item.snippet, item.title) : item.description !== item.title ? item.description : "";
    return h(
      "div.lib-row",
      {
        role: "option",
        id: `lib-${idx}`,
        "aria-selected": String(idx === state.sel),
        class: isOpen ? "is-open" : "",
        dataset: { idx: String(idx), path: item.path },
        onclick: () => {
          state.sel = idx;
          highlight(false);
          ctx.open(item.path);
        },
      },
      h("span.lib-mark", { "aria-hidden": "true", title: item.type }, KIND[item.type]?.emoji || "📄"),
      h(
        "span.lib-text",
        null,
        h("span.lib-title", null, item.title || item.path),
        snippet ? h("span.lib-desc", null, snippet) : null,
      ),
      h(
        "span.lib-meta",
        null,
        item.status && !["decided", "open"].includes(item.status) ? statusChip(item.status) : null,
        item.kind ? h("span.chip.chip-soft", null, item.kind) : null,
        (item.tags || []).slice(0, 2).map((t) => h("span.chip.chip-tag", null, `#${t}`)),
        when ? h("time.lib-date", { datetime: when, title: when }, relTime(when)) : null,
      ),
    );
  }

  function highlight(scroll = true) {
    for (const r of $$(".lib-row", list)) r.setAttribute("aria-selected", String(Number(r.dataset.idx) === state.sel));
    const cur = list.querySelector(`#lib-${state.sel}`);
    if (cur) {
      list.setAttribute("aria-activedescendant", cur.id);
      if (scroll) cur.scrollIntoView({ block: "nearest" });
    }
  }

  function move(delta) {
    const max = Math.min(rows.length, state.limit) - 1;
    if (max < 0) return;
    state.sel = Math.max(0, Math.min(max, state.sel + delta));
    highlight();
  }

  function openSel() {
    const item = rows[state.sel];
    if (item) ctx.open(item.path);
  }

  list.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      if (state.sel === 0) input.focus();
      else move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      openSel();
    }
  });

  const onKey = (e) => {
    if (ctx.route.view !== "library" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      const order = ["", ...TYPES];
      const i = order.indexOf(state.type);
      setFacet({ type: order[(i + (e.key === "]" ? 1 : order.length - 1)) % order.length] });
    }
  };
  document.addEventListener("keydown", onKey);
  const onSelect = (e) => {
    for (const r of $$(".lib-row", list)) r.classList.toggle("is-open", r.dataset.path === e.detail?.path);
  };
  document.addEventListener("mental:select", onSelect);
  // Detach global listeners when this render is superseded.
  const watch = setInterval(() => {
    if (!alive()) {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mental:select", onSelect);
      clearInterval(watch);
    }
  }, 1000);

  fill(el, 
    h(
      "div.page.page-wide",
      null,
      h(
        "header.page-head",
        null,
        h("div", null, h("h1.page-title", null, "Library"), h("p.page-sub", null, "Every note, decision, attention item, and journal in this project.")),
        h("span.page-stat", null, h("kbd.kbd", null, "["), h("kbd.kbd", null, "]"), " switch type"),
      ),
      fieldWrap,
      h("div.lib", null, facets, h("div.lib-main", null, summary, list)),
    ),
  );
  if (state.q) runSearch();
  paint();
}

function cleanSnippet(snippet, title) {
  const lines = String(snippet || "")
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .filter((l) => l && l !== title);
  return lines.join(" ").slice(0, 220);
}
