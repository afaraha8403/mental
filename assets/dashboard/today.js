import { ageDays, clockTime, copyText, dayLabel, emptyState, h, icon, KIND, pathDate, relTime, skeleton, toDate, fill } from "./ui.js";

const STALE_DAYS = 7;

/** Age source for a heartbeat list item. */
export function itemWhen(item) {
  return item?.timestamp || pathDate(item?.path) || "";
}

/** Compact card used by Today lanes and the Attention board. */
export function itemCard(ctx, item, { showKind = true, type = "" } = {}) {
  const when = itemWhen(item);
  const age = ageDays(when);
  const stale = age != null && age >= STALE_DAYS;
  const t = type || (String(item.path).startsWith("decisions/") ? "Decision" : "Attention");
  return h(
    "button.card",
    {
      type: "button",
      class: stale ? "is-stale" : "",
      dataset: { path: item.path },
      onclick: () => ctx.open(item.path),
    },
    h("span.card-title", null, item.title || item.file || item.path),
    item.against ? h("span.card-against", null, item.against) : null,
    h(
      "span.card-meta",
      null,
      showKind && item.kind ? h("span.chip.chip-soft", null, item.kind) : showKind ? h("span.mark", { "aria-hidden": "true", title: t }, KIND[t]?.emoji) : null,
      item.from ? h("span.card-from", null, `from ${item.from}`) : null,
      h("span.card-spacer"),
      stale ? h("span.chip.chip-stale", { title: `${age} days old` }, "stale") : null,
      when ? h("time.card-age", { datetime: when, title: toDate(when)?.toLocaleString() || when }, relTime(when)) : null,
    ),
  );
}

/** @param {HTMLElement} el */
export async function renderToday(el, ctx, _params, alive) {
  const hb0 = ctx.heartbeat;
  if (!hb0) fill(el, h("div.page", null, h("div.hero.is-skeleton", null, skeleton(3))));
  const [hb, activity] = await Promise.all([ctx.get("/api/heartbeat"), ctx.get("/api/activity", { days: 30 })]);
  if (!alive()) return;
  if (!hb) {
    fill(el, 
      h("div.page", null, emptyState({ icon: "🔌", title: "Couldn't reach this project", body: "The dashboard server may have stopped.", cmd: "mental dashboard" })),
    );
    return;
  }
  fill(el, 
    h(
      "div.page.today",
      null,
      hero(ctx, hb),
      deltaStrip(hb),
      lanes(ctx, hb),
      guardrails(ctx, hb),
      timeline(ctx, activity),
    ),
  );
}

function hero(ctx, hb) {
  const ho = hb.handoff;
  const git = hb.git;
  const gitStrip = git
    ? h(
        "div.git-strip",
        null,
        h(
          "span.git-branch",
          { title: git.dirty ? "Uncommitted changes" : "Working tree clean" },
          icon("branch", 14),
          h("span.mono", null, git.branch || "detached"),
          h(`span.dirty-dot${git.dirty ? ".is-dirty" : ""}`, { "aria-label": git.dirty ? "dirty" : "clean" }),
        ),
        h(
          "ol.git-commits",
          null,
          (git.recent || []).slice(0, 3).map((line) => {
            const [sha, ...msg] = String(line).split(" ");
            return h("li", { title: line }, h("span.mono.sha", null, sha), h("span.commit-msg", null, msg.join(" ")));
          }),
        ),
      )
    : null;

  if (!ho?.resume) {
    return h(
      "section.hero.hero-empty",
      { "aria-label": "Resume point" },
      h("p.eyebrow", null, "Resume point"),
      h("h1.hero-resume", null, "No resume point yet."),
      h("p.hero-sub", null, "Park at the end of a sit-down and Mental will greet you with exactly where to pick up."),
      h("code.empty-cmd", null, 'mental park --resume "…"'),
      gitStrip,
    );
  }
  const whenIso = ho.when?.date ? `${ho.when.date}T${ho.when.time || "00:00"}` : "";
  const outcome = String(ho.outcome || "").toLowerCase();
  return h(
    "section.hero",
    { "aria-label": "Resume point" },
    h("div.hero-glow", { "aria-hidden": "true" }),
    h(
      "div.hero-top",
      null,
      h("p.eyebrow", null, "Pick up where you left off"),
      h(
        "div.hero-chips",
        null,
        ho.outcome ? h(`span.chip.chip-outcome.outcome-${outcome.replace(/[^a-z]/g, "")}`, null, ho.outcome) : null,
        whenIso ? h("span.chip.chip-soft", { title: `${ho.when.date} ${ho.when.time || ""}` }, relTime(whenIso)) : null,
        ho.via ? h("span.chip.chip-soft", null, `via ${ho.via}`) : null,
      ),
    ),
    h("h1.hero-resume", null, ho.resume),
    ho.against || hb.against ? h("p.hero-against", null, h("span.eyebrow", null, "Against"), h("span", null, ho.against || hb.against)) : null,
    h(
      "div.hero-foot",
      null,
      gitStrip,
      h(
        "div.hero-actions",
        null,
        ho.file ? h("button.btn.btn-ghost", { type: "button", onclick: () => ctx.open(ho.file) }, "Open journal") : null,
        h("button.btn.btn-primary", { type: "button", onclick: () => copyText(ho.resume, "Resume copied") }, icon("copy", 15), "Copy resume"),
      ),
    ),
  );
}

function deltaStrip(hb) {
  const d = hb.delta;
  if (!d) return null;
  const parts = [
    ["writes", d.writes, "write", "writes"],
    ["attention", d.attention, "attention item", "attention items"],
    ["decisions", d.decisions, "decision", "decisions"],
    ["parks", d.parks, "park", "parks"],
  ].filter(([, n]) => n > 0);
  const since = d.since ? relTime(d.since) : "";
  return h(
    "section.delta",
    { "aria-label": "Since you last looked" },
    h("span.delta-label", null, icon("sparkle", 14), "Since you last looked", since ? h("span.muted", null, ` · ${since}`) : null),
    parts.length
      ? h(
          "span.delta-items",
          null,
          parts.map(([key, n, one, many]) => h(`span.delta-item.delta-${key}`, null, h("b.num", null, String(n)), ` ${n === 1 ? one : many}`)),
        )
      : h("span.delta-quiet", null, "All quiet — nothing new."),
    hb.hopsToday ? h("span.delta-hops", { title: "Journal entries today" }, `${hb.hopsToday} hop${hb.hopsToday === 1 ? "" : "s"} today`) : null,
  );
}

function lane(ctx, { key, title, hint, items, total, empty, more, type }) {
  const shown = items.slice(0, 6);
  const count = total ?? items.length;
  return h(
    `section.lane.lane-${key}`,
    { "aria-label": title },
    h(
      "header.lane-head",
      null,
      h("span.lane-dot", { "aria-hidden": "true" }),
      h("h2.lane-title", null, title),
      h("span.lane-count.num", null, String(count)),
      h("span.lane-hint", null, hint),
    ),
    shown.length
      ? h("div.lane-cards", null, shown.map((it) => itemCard(ctx, it, { type })))
      : h("p.lane-empty", null, empty),
    count > shown.length && more ? h("button.lane-more", { type: "button", onclick: more }, `View all ${count}`, icon("chevron", 14)) : null,
  );
}

function lanes(ctx, hb) {
  const needs = hb.needsEyes || [];
  const later = hb.later || [];
  const needsPaths = new Set(needs.map((x) => x.path));
  const inAir = (hb.attention || []).filter((a) => !needsPaths.has(a.path) && a.kind !== "verify" && a.status !== "later");
  const decisions = hb.openDecisions || [];
  const inAirTotal = Math.max(inAir.length, (hb.attentionCount || 0) - (hb.needsEyesCount || 0) - (hb.laterCount || 0));
  return h(
    "div.lanes",
    null,
    lane(ctx, {
      key: "eyes",
      title: "Needs your eyes",
      hint: "verify before trusting",
      items: needs,
      total: hb.needsEyesCount ?? needs.length,
      empty: "Nothing waiting on you.",
      more: () => ctx.go("attention", { kind: "verify" }),
    }),
    lane(ctx, {
      key: "air",
      title: "In the air",
      hint: "open threads",
      items: inAir,
      total: inAirTotal,
      empty: "No loose threads.",
      more: () => ctx.go("attention"),
    }),
    lane(ctx, {
      key: "unsettled",
      title: "Unsettled",
      hint: "open decisions",
      items: decisions,
      total: hb.openDecisionCount ?? decisions.length,
      empty: "Every decision is settled.",
      more: () => ctx.go("decisions"),
      type: "Decision",
    }),
    lane(ctx, {
      key: "later",
      title: "Later",
      hint: "parked on purpose",
      items: later,
      total: hb.laterCount ?? later.length,
      empty: "Nothing parked for later.",
      more: () => ctx.go("attention", { status: "later" }),
    }),
  );
}

function guardrails(ctx, hb) {
  const list = hb.guardrails || [];
  if (!list.length) return null;
  const total = hb.guardrailCount ?? list.length;
  const shown = list.slice(0, 10);
  return h(
    "section.guardrails",
    { "aria-label": "Guardrails" },
    h(
      "header.section-head",
      null,
      h("h2.section-title", null, h("span.mark", { "aria-hidden": "true" }, "🛡"), "Guardrails"),
      h("span.section-sub", null, "Settled decisions agents should not relitigate"),
      h("button.link-btn", { type: "button", onclick: () => ctx.go("decisions") }, `All ${total}`, icon("chevron", 13)),
    ),
    h(
      "div.pill-row",
      null,
      shown.map((g) => h("button.pill", { type: "button", title: g.title, onclick: () => ctx.open(g.path) }, h("span.pill-text", null, g.title))),
      total > shown.length ? h("button.pill.pill-more", { type: "button", onclick: () => ctx.go("decisions") }, `+${total - shown.length} more`) : null,
    ),
  );
}

function timeline(ctx, activity) {
  const hops = activity?.hops || [];
  const head = h(
    "header.section-head",
    null,
    h("h2.section-title", null, h("span.mark", { "aria-hidden": "true" }, "📓"), "Activity"),
    h("span.section-sub", null, "Journal hops, last 30 days"),
  );
  if (!hops.length) {
    return h(
      "section.activity",
      null,
      head,
      emptyState({ icon: "📓", title: "No journal hops yet", body: "Each park, handoff, or journal entry shows up here.", cmd: "mental journal --title \"…\"" }),
    );
  }
  /** @type {Map<string, any[]>} */
  const byDay = new Map();
  for (const hop of hops) {
    const key = hop.date || String(hop.at || "").slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(hop);
  }
  return h(
    "section.activity",
    null,
    head,
    h(
      "ol.timeline",
      null,
      [...byDay.entries()].map(([day, list]) =>
        h(
          "li.tl-day",
          null,
          h("h3.tl-day-label", null, dayLabel(day), h("span.tl-day-count.num", null, String(list.length))),
          h(
            "ol.tl-hops",
            null,
            list.map((hop) =>
              h(
                "li.tl-hop",
                { class: hop.kind ? `hop-${String(hop.kind).toLowerCase().replace(/[^a-z]/g, "")}` : "" },
                h("span.tl-node", { "aria-hidden": "true" }),
                h(
                  "button.tl-card",
                  { type: "button", onclick: () => ctx.open(String(hop.path).split("#")[0]) },
                  h(
                    "span.tl-row",
                    null,
                    h("time.tl-time.mono", { datetime: hop.at || "" }, hop.time || clockTime(hop.at)),
                    h("span.tl-title", null, hop.title || "Journal entry"),
                    hop.kind ? h("span.chip.chip-soft", null, hop.kind) : null,
                    hop.via ? h("span.tl-via", null, hop.via) : null,
                  ),
                  hop.summary ? h("span.tl-summary", null, hop.summary) : null,
                  hop.resume ? h("span.tl-resume", null, hop.resume) : null,
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    activity?.truncated ? h("p.muted.small", null, "Older hops are in the Library under Journals.") : null,
  );
}

