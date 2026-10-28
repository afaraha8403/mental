import { ageDays, copyText, debounce, emptyState, h, icon, pathDate, relTime, skeleton, statusChip, tagChip, toDate, fill } from "./ui.js";

const PAGE = 100;
const MAX_ITEMS = 1000;
const AGING_DAYS = 7;

/** Page through `/api/list` (100 per call) up to MAX_ITEMS. */
export async function listAll(ctx, params) {
  const items = [];
  let offset = 0;
  for (;;) {
    const data = await ctx.get("/api/list", { ...params, limit: PAGE, offset });
    if (!data) return null;
    items.push(...(data.items || []));
    if (!data.truncated || items.length >= MAX_ITEMS) return { items, total: data.total ?? items.length, capped: !!data.truncated };
    offset += PAGE;
  }
}

function chipGroup(label, options, current, onPick) {
  return h(
    "div.seg",
    { role: "group", "aria-label": label },
    options.map(([value, text, count]) =>
      h(
        "button.seg-btn",
        { type: "button", "aria-pressed": String(current === value), onclick: () => onPick(value) },
        text,
        count != null ? h("span.seg-count.num", null, String(count)) : null,
      ),
    ),
  );
}

function boardCard(ctx, item) {
  const when = pathDate(item.path);
  const age = ageDays(when);
  const open = item.status === "open";
  const aging = open && age != null && age >= AGING_DAYS;
  return h(
    "button.card",
    { type: "button", class: [aging && "is-aging", item.status === "resolved" && "is-done"].filter(Boolean).join(" "), onclick: () => ctx.open(item.path) },
    h("span.card-title", null, item.title || item.path),
    item.description && item.description !== item.title ? h("span.card-desc", null, item.description) : null,
    h(
      "span.card-meta",
      null,
      item.status !== "open" ? statusChip(item.status) : null,
      (item.tags || []).slice(0, 2).map((t) => h("span.chip.chip-tag", null, `#${t}`)),
      h("span.card-spacer"),
      aging ? h("span.chip.chip-aging", { title: `Open for ${age} days: still true? Resolve or keep.` }, `${age}d`) : null,
      when ? h("time.card-age", { datetime: when }, relTime(when)) : null,
    ),
  );
}

const KIND_ORDER = ["verify", "concern", "question", "thread"];
const KIND_LABEL = { verify: "Verify", concern: "Concerns", question: "Questions", thread: "Threads", "": "Other" };
const KIND_HINT = {
  verify: "needs a human check",
  concern: "risks to watch",
  question: "waiting on an answer",
  thread: "work in flight",
  "": "uncategorized",
};

/** @param {HTMLElement} el */
export async function renderAttention(el, ctx, search0, alive) {
  const params = Object.fromEntries(search0);
  fill(el, h("div.page", null, pageHead("Attention", "What's in the air — residue that outlives a chat."), skeleton(6, "board-skel")));
  const res = await listAll(ctx, { type: "Attention" });
  if (!alive()) return;
  if (!res) {
    fill(el, h("div.page", null, emptyState({ icon: "🔌", title: "Couldn't load attention" })));
    return;
  }
  const all = res.items;
  if (!all.length) {
    fill(el, 
      h(
        "div.page",
        null,
        pageHead("Attention", "What's in the air — residue that outlives a chat."),
        emptyState({ icon: "🚦", title: "Nothing in the air", body: "Record a concern, question, or thing to verify and it lands here.", cmd: 'mental attention --kind verify --title "…"' }),
      ),
    );
    return;
  }

  const status = params.status || "open";
  const kind = params.kind || "";
  const tag = params.tag || "";
  const age = params.age || "";
  const q = (params.q || "").toLowerCase();

  const byStatus = (s) => all.filter((i) => (s === "all" ? true : i.status === s));
  const scoped = byStatus(status);
  const kinds = [...new Set(all.map((i) => i.kind || ""))].sort((a, b) => rank(a) - rank(b));
  const tags = [...new Set(all.flatMap((i) => i.tags || []))].sort();

  const filtered = scoped.filter((i) => {
    if (kind && (i.kind || "") !== kind) return false;
    if (tag && !(i.tags || []).includes(tag)) return false;
    if (age) {
      const d = ageDays(pathDate(i.path));
      if (age === "aging" && !(d != null && d >= AGING_DAYS)) return false;
      if (age === "week" && !(d != null && d < 7)) return false;
    }
    if (q && !`${i.title} ${i.description} ${(i.tags || []).join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // The default open view is a worklist: fresh items on the board, aging items and directions folded below.
  const split = status === "open" && !age && !kind;
  const isAging = (i) => {
    const d = ageDays(pathDate(i.path));
    return d != null && d >= AGING_DAYS;
  };
  const byNewest = (a, b) => pathDate(b.path).localeCompare(pathDate(a.path));
  const directions = split ? filtered.filter((i) => i.kind === "direction").sort(byNewest) : [];
  const agingItems = split ? filtered.filter((i) => i.kind !== "direction" && isAging(i)).sort(byNewest) : [];
  const boardItems = split ? filtered.filter((i) => i.kind !== "direction" && !isAging(i)) : filtered;
  const boardKinds = split ? kinds.filter((k) => k !== "direction") : kinds;

  const groups = (kind ? [kind] : boardKinds).map((k) => ({
    k,
    items: boardItems.filter((i) => (i.kind || "") === k).sort(byNewest),
  }));

  const set = (patch) => ctx.setParams(patch, { render: true });
  const search = h("input.field-input", {
    type: "search",
    placeholder: "Filter attention…",
    value: params.q || "",
    "data-search": "",
    "aria-label": "Filter attention",
    oninput: debounce((e) => set({ q: e.target.value || null }), 200),
  });

  const toolbar = h(
    "div.toolbar",
    null,
    chipGroup(
      "Status",
      [
        ["open", "Open", byStatus("open").length],
        ["later", "Later", byStatus("later").length],
        ["resolved", "Resolved", byStatus("resolved").length],
        ["all", "All", all.length],
      ],
      status,
      (v) => set({ status: v === "open" ? null : v }),
    ),
    chipGroup(
      "Age",
      [
        ["", "Any age"],
        ["week", "This week"],
        ["aging", "Aging 7d+"],
      ],
      age,
      (v) => set({ age: v || null }),
    ),
    tags.length
      ? h(
          "label.select",
          null,
          h("span.sr-only", null, "Tag"),
          h(
            "select",
            { onchange: (e) => set({ tag: e.target.value || null }) },
            h("option", { value: "" }, "All tags"),
            tags.map((t) => h("option", { value: t, selected: t === tag }, `#${t}`)),
          ),
        )
      : null,
    h("div.field.toolbar-search", null, icon("search", 15), search),
  );

  const kindTabs = h(
    "div.kind-tabs",
    null,
    chipGroup(
      "Kind",
      [["", "All kinds", scoped.length], ...kinds.map((k) => [k, KIND_LABEL[k] || k, scoped.filter((i) => (i.kind || "") === k).length])],
      kind,
      (v) => set({ kind: v || null }),
    ),
  );

  const board = boardItems.length
    ? h(
        "div.board",
        { dataset: { cols: String(groups.length) } },
        groups.map((g) =>
          h(
            `section.column.col-${g.k || "other"}`,
            { "aria-label": KIND_LABEL[g.k] || g.k },
            h(
              "header.lane-head",
              null,
              h("span.lane-dot", { "aria-hidden": "true" }),
              h("h2.lane-title", null, KIND_LABEL[g.k] || g.k),
              h("span.lane-count.num", null, String(g.items.length)),
              h("span.lane-hint", null, KIND_HINT[g.k] || ""),
            ),
            g.items.length ? h("div.lane-cards", null, g.items.map((i) => boardCard(ctx, i))) : h("p.lane-empty", null, "Clear."),
          ),
        ),
      )
    : split && (agingItems.length || directions.length)
      ? h("p.lane-empty", null, "Nothing fresh needs you.")
      : emptyState({ icon: "🌤", title: "Nothing matches these filters", body: "Try another status, kind, or tag." });

  const stat = split
    ? [`${boardItems.length} need you`, agingItems.length ? `${agingItems.length} aging` : "", directions.length ? `${directions.length} directions` : ""].filter(Boolean).join(" · ")
    : `${byStatus("open").length} open`;

  fill(el, 
    h(
      "div.page.page-wide",
      null,
      pageHead("Attention", "What's in the air — residue that outlives a chat.", stat),
      toolbar,
      kindTabs,
      board,
      agingItems.length ? agingSection(ctx, agingItems) : null,
      directions.length ? directionsSection(ctx, directions) : null,
      res.capped ? h("p.muted.small", null, `Showing the first ${all.length} items.`) : null,
    ),
  );
  restoreFocus(el, search, params);
}

/** Quote a title for a shell; null when it has characters that differ between bash and PowerShell. */
function shellQuote(title) {
  if (/[$`\\"\r\n]/.test(title)) return null;
  return `"${title}"`;
}

/** Commands that close attention items; the dashboard is read-only, so the user runs them. */
export function resolveCommands(items) {
  return items
    .map((i) => {
      const q = shellQuote(String(i.title || ""));
      return q ? `mental attention --title ${q} --status resolved --via dashboard --json` : `# edit by hand: ${i.path}`;
    })
    .join("\n");
}

/** Open items older than AGING_DAYS: a "still true?" review, not an alarm. */
function agingSection(ctx, items) {
  const picked = new Set();
  const count = h("span.num", null, "0");
  const copy = h(
    "button.btn.btn-primary",
    { type: "button", disabled: true, onclick: () => copyText(resolveCommands(items.filter((i) => picked.has(i.path))), "Resolve commands copied") },
    icon("copy", 15),
    "Copy resolve commands (",
    count,
    ")",
  );
  const sync = () => {
    count.textContent = String(picked.size);
    copy.disabled = picked.size === 0;
  };
  const boxes = [];
  const rows = items.map((i) => {
    const box = h("input", {
      type: "checkbox",
      "aria-label": `Select ${i.title}`,
      onchange: (e) => {
        if (e.target.checked) picked.add(i.path);
        else picked.delete(i.path);
        sync();
      },
    });
    boxes.push(box);
    const when = pathDate(i.path);
    return h(
      "li.aging-row",
      null,
      box,
      h("button.aging-title", { type: "button", onclick: () => ctx.open(i.path) }, i.title || i.path),
      h("span.chip.chip-soft", null, i.kind || "other"),
      h("time.card-age", { datetime: when }, relTime(when)),
    );
  });
  const all = h(
    "button.btn.btn-ghost",
    {
      type: "button",
      onclick: () => {
        const on = picked.size < items.length;
        boxes.forEach((b, n) => {
          b.checked = on;
          if (on) picked.add(items[n].path);
          else picked.delete(items[n].path);
        });
        sync();
      },
    },
    "Select all",
  );
  return h(
    "details.aging",
    { "aria-label": "Aging attention" },
    h("summary.aging-head", null, h("span.section-title", null, "Aging"), h("span.section-sub", null, `${items.length} open ${AGING_DAYS}+ days. Still true? Keep it, or resolve it.`)),
    h("div.aging-actions", null, all, copy),
    h("ul.aging-list", null, rows),
    h("p.muted.small", null, "Paste the commands into a terminal in this project. The dashboard stays read-only."),
  );
}

/** Directions are standing context, so they sit outside the "needs you" count. */
function directionsSection(ctx, items) {
  return h(
    "details.aging.directions",
    { "aria-label": "Directions" },
    h("summary.aging-head", null, h("span.section-title", null, "Directions"), h("span.section-sub", null, `${items.length} standing guidance, not a to-do`)),
    h("div.card-grid", null, items.map((i) => boardCard(ctx, i))),
  );
}

function rank(k) {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? 99 : i;
}

function pageHead(title, sub, stat) {
  return h(
    "header.page-head",
    null,
    h("div", null, h("h1.page-title", null, title), h("p.page-sub", null, sub)),
    stat ? h("span.page-stat", null, stat) : null,
  );
}

/** Keep typing focus in the search box across param-driven re-renders. */
function restoreFocus(root, input, params) {
  if (params.q != null && document.activeElement === document.body) {
    input.focus();
    const n = input.value.length;
    input.setSelectionRange(n, n);
  }
}

/** @param {HTMLElement} el */
export async function renderDecisions(el, ctx, search0, alive) {
  const params = Object.fromEntries(search0);
  fill(el, h("div.page", null, pageHead("Decisions", "Why things are the way they are."), skeleton(6)));
  const res = await listAll(ctx, { type: "Decision" });
  if (!alive()) return;
  if (!res) {
    fill(el, h("div.page", null, emptyState({ icon: "🔌", title: "Couldn't load decisions" })));
    return;
  }
  const all = res.items;
  if (!all.length) {
    fill(el, 
      h(
        "div.page",
        null,
        pageHead("Decisions", "Why things are the way they are."),
        emptyState({ icon: "🎯", title: "No decisions recorded", body: "Record the why behind a choice git can't explain.", cmd: 'mental decide --title "…" --why "…"' }),
      ),
    );
    return;
  }
  const q = (params.q || "").toLowerCase();
  const tag = params.tag || "";
  const showSuperseded = params.superseded !== "0";
  const match = (i) =>
    (!q || `${i.title} ${i.description} ${(i.tags || []).join(" ")}`.toLowerCase().includes(q)) && (!tag || (i.tags || []).includes(tag));
  const byDate = (a, b) => pathDate(b.path).localeCompare(pathDate(a.path));

  const unsettled = all.filter((i) => (i.status === "open" || i.status === "deferred") && match(i)).sort(byDate);
  const settled = all.filter((i) => i.status !== "open" && i.status !== "deferred" && match(i) && (showSuperseded || i.status !== "superseded")).sort(byDate);
  const counts = { decided: 0, superseded: 0, open: 0, deferred: 0 };
  for (const i of all) counts[i.status] = (counts[i.status] || 0) + 1;

  /** @type {Map<string, any[]>} */
  const months = new Map();
  for (const i of settled) {
    const d = toDate(pathDate(i.path));
    const key = d ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Undated";
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(i);
  }

  const set = (patch) => ctx.setParams(patch, { render: true });
  const search = h("input.field-input", {
    type: "search",
    placeholder: "Filter decisions…",
    value: params.q || "",
    "data-search": "",
    "aria-label": "Filter decisions",
    oninput: debounce((e) => set({ q: e.target.value || null }), 200),
  });
  const tags = [...new Set(all.flatMap((i) => i.tags || []))].sort();

  fill(el, 
    h(
      "div.page",
      null,
      pageHead("Decisions", "Why things are the way they are.", `${counts.decided} decided · ${counts.open + counts.deferred} open`),
      h(
        "div.toolbar",
        null,
        h("div.field.toolbar-search", null, icon("search", 15), search),
        tags.length
          ? h(
              "label.select",
              null,
              h("span.sr-only", null, "Tag"),
              h(
                "select",
                { onchange: (e) => set({ tag: e.target.value || null }) },
                h("option", { value: "" }, "All tags"),
                tags.map((t) => h("option", { value: t, selected: t === tag }, `#${t}`)),
              ),
            )
          : null,
        counts.superseded
          ? h(
              "label.toggle",
              null,
              h("input", { type: "checkbox", checked: showSuperseded, onchange: (e) => set({ superseded: e.target.checked ? null : "0" }) }),
              h("span", null, `Show superseded (${counts.superseded})`),
            )
          : null,
      ),
      h(
        "section.unsettled",
        { "aria-label": "Unsettled decisions" },
        h("header.section-head", null, h("h2.section-title", null, "Unsettled"), h("span.section-sub", null, "Open or deferred — still up for debate")),
        unsettled.length
          ? h("div.card-grid", null, unsettled.map((i) => boardCard(ctx, i)))
          : h("p.lane-empty.settled-note", null, icon("sparkle", 14), "Every decision is settled."),
      ),
      h(
        "section.decided",
        { "aria-label": "Decided" },
        h("header.section-head", null, h("h2.section-title", null, "Decided"), h("span.section-sub", null, "Newest first")),
        settled.length
          ? h(
              "ol.dtl",
              null,
              [...months.entries()].map(([month, list]) =>
                h(
                  "li.dtl-month",
                  null,
                  h("h3.dtl-month-label", null, month),
                  h(
                    "ol.dtl-items",
                    null,
                    list.map((i) =>
                      h(
                        "li.dtl-item",
                        { class: i.status === "superseded" ? "is-superseded" : "" },
                        h("span.tl-node", { "aria-hidden": "true" }),
                        h(
                          "button.dtl-card",
                          { type: "button", onclick: () => ctx.open(i.path) },
                          h("span.dtl-title", null, i.title),
                          h(
                            "span.dtl-meta",
                            null,
                            i.status === "superseded" ? statusChip("superseded") : null,
                            (i.tags || []).slice(0, 3).map((t) => tagChip(t)),
                            h("span.card-spacer"),
                            h("time.card-age", { datetime: pathDate(i.path) }, shortDate(pathDate(i.path))),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : emptyState({ icon: "🔎", title: "No decisions match", body: "Clear the filter to see them all." }),
      ),
    ),
  );
  restoreFocus(el, search, params);
}

function shortDate(ymd) {
  const d = toDate(ymd);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}
