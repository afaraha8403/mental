import { renderFrontmatter, renderMarkdown } from "./markdown.js";
import { startMap } from "./map.js";

const state = {
  id: "",
  type: "",
  status: "",
  kind: "",
  q: "",
  offset: 0,
  limit: 50,
  total: 0,
  path: "",
  currentBody: "",
  view: "list",
  sessionId: "",
  track: null,
};

const TYPES = ["", "Decision", "Attention", "Note", "Journal"];

/** Same marks as CLI `kindMark` (journal, attention, decision, note). */
const KIND = {
  Decision: { emoji: "🎯", label: "Decision" },
  Attention: { emoji: "🚦", label: "Attention" },
  Note: { emoji: "📝", label: "Note" },
  Journal: { emoji: "📓", label: "Journal" },
};

function kindChip(type) {
  const spec = KIND[type];
  const chip = document.createElement("span");
  chip.className = spec ? `kind kind-${type.toLowerCase()}` : "kind";
  if (!spec) {
    chip.textContent = type || "";
    return chip;
  }
  const mark = document.createElement("span");
  mark.className = "mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = spec.emoji;
  chip.append(mark, document.createTextNode(spec.label));
  return chip;
}

function qs(extra = {}) {
  const p = new URLSearchParams();
  if (state.id) p.set("id", state.id);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Theme handling (Dark / Light / Auto)
function initTheme() {
  const saved = localStorage.getItem("mental-dashboard-theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.dataset.theme = saved;
  } else {
    delete document.documentElement.dataset.theme;
  }

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    let next;
    if (!current) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      next = prefersDark ? "light" : "dark";
    } else if (current === "dark") {
      next = "light";
    } else {
      next = "dark";
    }
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mental-dashboard-theme", next);
  });
}

async function loadProjects() {
  const { body } = await api("/api/projects");
  const sel = document.getElementById("project");
  sel.replaceChildren();
  const projects = body?.ok ? body.data.projects || [] : [];
  const active = body?.ok ? body.data.activeId : null;
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "This folder";
  sel.append(blank);
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.append(opt);
  }
  if (!state.id && active) {
    state.id = active;
  }
  sel.value = state.id;
}

function fillFacts(rows) {
  const box = document.getElementById("facts");
  box.replaceChildren();
  for (const [label, value, isGit] of rows) {
    if (!value) continue;
    const row = document.createElement("p");
    const name = document.createElement("span");
    name.className = "fact-label";
    name.textContent = label;
    row.append(name);

    if (isGit) {
      const isDirty = value.includes("dirty");
      const dot = document.createElement("span");
      dot.className = isDirty ? "git-pill-dirty" : "git-pill-clean";
      dot.title = isDirty ? "Working tree dirty" : "Working tree clean";
      row.append(dot);
    }

    row.append(document.createTextNode(value));
    box.append(row);
  }
}

function relWhen(when) {
  if (!when?.date) return "";
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  if (when.date === `${y}-${m}-${d}`) return when.time ? `today ${when.time}` : "today";
  return when.time ? `${when.date} ${when.time}` : when.date;
}

/**
 * @param {string} listId
 * @param {Array<{ title?: string, path?: string }>} items
 * @param {number} total
 * @param {(() => void) | null} onMore
 */
function fillBoard(listId, items, total, onMore) {
  const ul = document.getElementById(listId);
  ul.replaceChildren();
  const shown = items || [];
  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "pulse-empty";
    li.textContent = "None";
    ul.append(li);
    return;
  }
  for (const item of shown) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pulse-item";
    btn.textContent = item.title || "Untitled";
    btn.title = item.title || "Untitled";
    if (item.path) btn.addEventListener("click", () => peek(item.path));
    li.append(btn);
    ul.append(li);
  }
  const extra = Math.max(0, (total || shown.length) - shown.length);
  if (extra > 0 && onMore) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pulse-more";
    btn.textContent = `+${extra} more`;
    btn.addEventListener("click", onMore);
    li.append(btn);
    ul.append(li);
  } else if (extra > 0) {
    const li = document.createElement("li");
    li.className = "pulse-empty";
    li.textContent = `+${extra} more`;
    ul.append(li);
  }
}

function showCatalog({ type = "", status = "", kind = "" } = {}) {
  state.type = type;
  state.status = status;
  state.kind = kind;
  state.offset = 0;
  state.q = "";
  const q = document.getElementById("q");
  if (q) q.value = "";
  updateSearchClear();
  renderChips();
  showView("list");
  loadList();
}

async function loadHeartbeat() {
  const { body } = await api(`/api/heartbeat${qs()}`);
  const d = body?.ok ? body.data : null;
  if (!d) {
    setText("strip", "No bundle yet.");
    fillFacts([]);
    document.getElementById("board-eyes").hidden = true;
    document.getElementById("board-later").hidden = true;
    fillBoard("air-list", [], 0, null);
    fillBoard("open-list", [], 0, null);
    document.getElementById("track").hidden = true;
    setText("eyes-count", "");
    setText("air-count", "");
    setText("later-count", "");
    setText("open-count", "");
    return;
  }

  setText("strip", d.handoff?.resume || "No journal yet.");
  const when = relWhen(d.handoff?.when);
  const last = d.handoff?.outcome ? `${d.handoff.outcome}${when ? ` (${when})` : ""}` : "";
  const branch = d.git?.branch ? `${d.git.branch} · ${d.git.dirty ? "dirty" : "clean"}` : "";
  const recent = d.git?.recent?.[0] || "";
  const git = [branch, recent].filter(Boolean).join(" — ");

  fillFacts([
    ["Last", last, false],
    ["Git", git, true],
    ["Against", d.against || "", false],
    ["Hops", d.hopsToday ? String(d.hopsToday) : "", false],
  ]);

  const air = (d.attention || []).filter((a) => a.kind !== "verify" && a.status !== "later");
  const airTotal = Math.max(0, (d.attentionCount || 0) - (d.laterCount || 0) - (d.needsEyesCount || 0));

  document.getElementById("board-eyes").hidden = !(d.needsEyesCount > 0);
  document.getElementById("board-later").hidden = !(d.laterCount > 0);

  setText("eyes-count", d.needsEyesCount ? String(d.needsEyesCount) : "");
  setText("air-count", airTotal ? String(airTotal) : "");
  setText("later-count", d.laterCount ? String(d.laterCount) : "");
  setText("open-count", d.openDecisionCount ? String(d.openDecisionCount) : "");

  fillBoard("eyes-list", d.needsEyes || [], d.needsEyesCount || 0, () => showCatalog({ type: "Attention", kind: "verify" }));
  fillBoard("air-list", air, airTotal, () => showCatalog({ type: "Attention", status: "open" }));
  fillBoard("later-list", d.later || [], d.laterCount || 0, () => showCatalog({ type: "Attention", status: "later" }));
  fillBoard("open-list", d.openDecisions || [], d.openDecisionCount || 0, null);

  state.track = d.track || null;
  document.getElementById("view-sessions").hidden = !state.track;
  if (!state.track && state.view === "sessions") showView("list");
  if (state.track) await loadTrack();
  else document.getElementById("track").hidden = true;
}

function clockRow(title, detail) {
  const li = document.createElement("li");
  li.className = "clock";
  const name = document.createElement("span");
  name.textContent = title || "Untitled";
  const time = document.createElement("span");
  time.textContent = detail;
  li.append(name, time);
  return li;
}

async function loadTrack() {
  const trackEl = document.getElementById("track");
  const glance = await api(`/api/track/glance${qs()}`);
  if (glance.status !== 200 || !glance.body.ok) {
    trackEl.hidden = true;
    return;
  }
  const g = glance.body.data;
  trackEl.hidden = false;
  const note = [];
  if (state.track?.unclocked) note.push("A hop today has no clock.");
  if (g.truncated) note.push("List is capped.");
  setText("track-note", note.join(" "));
  document.getElementById("track-note").hidden = note.length === 0;

  const running = document.getElementById("track-running");
  running.replaceChildren();
  const runningRows = g.running || [];
  const summary = document.getElementById("clock-summary");
  if (runningRows.length === 0) {
    summary.textContent = "No clock running";
  } else {
    const row = runningRows.find((item) => item.focused) || runningRows[0];
    const extra = runningRows.length > 1 ? ` · ${runningRows.length} running` : "";
    summary.textContent = `${row.live_wall || "0:00"} · ${row.title_internal || "Untitled"}${extra}`;
  }
  if (runningRows.length === 0) running.append(clockRow("None running", ""));
  for (const row of runningRows) {
    const flags = [row.focused ? "focused" : "", row.stale ? "stale" : ""].filter(Boolean).join(", ");
    const hours = row.live_wall || "0:00";
    running.append(clockRow(row.title_internal, flags ? `${hours} · ${flags}` : hours));
  }
  const stopped = document.getElementById("track-stopped");
  stopped.replaceChildren();
  const stoppedRows = g.stoppedToday || [];
  if (stoppedRows.length === 0) stopped.append(clockRow("Nothing stopped today", ""));
  for (const row of stoppedRows) {
    stopped.append(clockRow(row.title_internal, `${row.wall || "0:00"} wall · ${row.billable || "0:00"} billable`));
  }
}

async function loadList() {
  const extra = {
    offset: state.offset,
    limit: state.limit,
    type: state.type,
    status: state.status,
    kind: state.kind,
  };
  const path = state.q
    ? `/api/search${qs({ ...extra, q: state.q })}`
    : `/api/list${qs(extra)}`;
  const { body } = await api(path);
  const data = body?.ok ? body.data : { items: [], hits: [], total: 0, offset: 0, limit: 50 };
  const rows = data.items || data.hits || [];
  state.total = data.total || 0;
  const start = state.total === 0 ? 0 : state.offset + 1;
  const end = state.offset + rows.length;
  const filters = [state.status, state.kind].filter(Boolean).join(" · ");
  const range = state.total ? `${start}–${end} of ${state.total}` : "0 of 0";
  setText("page", filters ? `${range} · ${filters}` : range);

  const ul = document.getElementById("list");
  ul.replaceChildren();

  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "pulse-empty";
    li.textContent = state.q ? "No matches found." : "No items in this category.";
    ul.append(li);
  }

  for (const row of rows) {
    const li = document.createElement("li");
    if (row.path === state.path) li.className = "active";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.dataset.path = row.path;
    if (row.path === state.path) btn.setAttribute("aria-current", "true");
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = row.title;
    btn.append(kindChip(row.type), title);
    btn.addEventListener("click", () => peek(row.path));
    li.append(btn);
    ul.append(li);
  }
  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = end >= state.total;
}

function clearPeek(title, meta) {
  state.currentBody = "";
  setText("peek-title", title);
  setText("peek-meta", meta);
  const fm = document.getElementById("peek-fm");
  fm.hidden = true;
  fm.replaceChildren();
  document.getElementById("peek-body").replaceChildren();
  document.getElementById("backlinks-label").hidden = true;
  document.getElementById("backlinks").replaceChildren();
  const backlinksSec = document.getElementById("backlinks-section");
  if (backlinksSec) backlinksSec.hidden = true;

  const emptyState = document.getElementById("peek-empty");
  if (emptyState) emptyState.hidden = false;

  const docActions = document.getElementById("doc-actions");
  if (docActions) docActions.hidden = true;
}

async function peek(path) {
  state.path = path;
  const { body } = await api(`/api/show${qs({ path })}`);
  if (!body?.ok) {
    clearPeek("Not found", "");
    document.getElementById("peek-body").textContent = body?.error?.message || "not found";
    return;
  }
  const d = body.data;
  state.currentBody = d.body || "";
  const title = d.frontmatter?.title || d.path;
  const type = d.frontmatter?.type || "";
  const status = d.frontmatter?.status || "";

  setText("peek-title", title);

  const emptyState = document.getElementById("peek-empty");
  if (emptyState) emptyState.hidden = true;

  const docActions = document.getElementById("doc-actions");
  if (docActions) docActions.hidden = false;

  // Sync active row in catalog
  document.querySelectorAll("#list li").forEach((li) => {
    const btn = li.querySelector("button.row");
    const active = btn && btn.dataset.path === path;
    li.classList.toggle("active", active);
    if (btn) {
      if (active) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
  });

  const meta = document.getElementById("peek-meta");
  meta.replaceChildren(document.createTextNode(d.path));
  if (type) meta.append(document.createTextNode(" · "), kindChip(type));
  if (status) meta.append(document.createTextNode(` · ${status}`));

  const fm = document.getElementById("peek-fm");
  const fmHtml = renderFrontmatter(d.frontmatter);
  fm.hidden = !fmHtml;
  fm.innerHTML = fmHtml;

  const preview = document.getElementById("peek-body");
  const rendered = renderMarkdown(d.body || "");
  preview.innerHTML = rendered || "<p class=\"muted\">No body.</p>";

  // Enhance code blocks with copy buttons
  preview.querySelectorAll(".md-code").forEach((codeBlock) => {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "doc-btn";
    copyBtn.style.position = "absolute";
    copyBtn.style.top = "0.4rem";
    copyBtn.style.right = "0.4rem";
    copyBtn.style.padding = "0.15rem 0.45rem";
    copyBtn.style.fontSize = "0.6875rem";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      const codeText = codeBlock.querySelector("code")?.textContent || "";
      navigator.clipboard.writeText(codeText).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
    });
    codeBlock.append(copyBtn);
  });

  map.select(path);

  const links = d.backlinks || [];
  const backlinksLabel = document.getElementById("backlinks-label");
  const backlinksSec = document.getElementById("backlinks-section");
  if (backlinksLabel) backlinksLabel.hidden = links.length === 0;
  if (backlinksSec) backlinksSec.hidden = links.length === 0;

  const ul = document.getElementById("backlinks");
  ul.replaceChildren();
  for (const b of links) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    const bTitle = document.createElement("span");
    bTitle.className = "row-title";
    bTitle.textContent = b.title;
    btn.append(document.createTextNode("from "), kindChip(b.type), bTitle);
    btn.addEventListener("click", () => peek(b.path));
    li.append(btn);
    ul.append(li);
  }
  await loadList();
}

function renderChips() {
  const box = document.getElementById("chips");
  box.replaceChildren();
  for (const t of TYPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    const spec = KIND[t];
    btn.className = spec ? `kind kind-${t.toLowerCase()}` : "kind kind-all";
    btn.textContent = spec ? `${spec.emoji} ${spec.label}` : "🧠 All";
    btn.setAttribute("aria-pressed", String(state.type === t));
    btn.addEventListener("click", () => {
      state.type = t;
      state.status = "";
      state.kind = "";
      state.offset = 0;
      renderChips();
      loadList();
      map.setFilter({ type: state.type, query: state.q });
    });
    box.append(btn);
  }
}

function updateSearchClear() {
  const clearBtn = document.getElementById("q-clear");
  const q = document.getElementById("q");
  if (clearBtn && q) {
    clearBtn.hidden = !q.value.trim();
  }
}

document.getElementById("project").addEventListener("change", (ev) => {
  state.id = ev.target.value;
  state.offset = 0;
  state.path = "";
  state.sessionId = "";
  document.getElementById("timeline").replaceChildren();
  clearPeek("No file open", "Select a file.");
  loadHeartbeat();
  loadList();
  if (state.view === "map") loadGraph();
  if (state.view === "sessions") loadSessions();
});

const searchInput = document.getElementById("q");
searchInput.addEventListener("input", () => {
  state.q = searchInput.value.trim();
  state.offset = 0;
  updateSearchClear();
  loadList();
  map.setFilter({ type: state.type, query: state.q });
});

const clearBtn = document.getElementById("q-clear");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.q = "";
    state.offset = 0;
    updateSearchClear();
    searchInput.focus();
    loadList();
    map.setFilter({ type: state.type, query: state.q });
  });
}

// Global keyboard shortcut '/' to focus search, and 'Escape' to clear/blur
window.addEventListener("keydown", (ev) => {
  const activeEl = document.activeElement;
  const inInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");

  if (ev.key === "/" && !inInput) {
    ev.preventDefault();
    searchInput.focus();
    searchInput.select();
  } else if (ev.key === "Escape" && inInput && activeEl === searchInput) {
    if (searchInput.value) {
      searchInput.value = "";
      state.q = "";
      state.offset = 0;
      updateSearchClear();
      loadList();
      map.setFilter({ type: state.type, query: state.q });
    } else {
      searchInput.blur();
    }
  }
});

// Copy path & copy markdown buttons
const copyPathBtn = document.getElementById("copy-path-btn");
if (copyPathBtn) {
  copyPathBtn.addEventListener("click", () => {
    if (!state.path) return;
    navigator.clipboard.writeText(state.path).then(() => {
      const textSpan = copyPathBtn.querySelector(".btn-text");
      if (textSpan) textSpan.textContent = "Copied!";
      copyPathBtn.classList.add("copied");
      setTimeout(() => {
        if (textSpan) textSpan.textContent = "Copy path";
        copyPathBtn.classList.remove("copied");
      }, 1500);
    });
  });
}

const copyBodyBtn = document.getElementById("copy-body-btn");
if (copyBodyBtn) {
  copyBodyBtn.addEventListener("click", () => {
    if (!state.currentBody) return;
    navigator.clipboard.writeText(state.currentBody).then(() => {
      const textSpan = copyBodyBtn.querySelector(".btn-text");
      if (textSpan) textSpan.textContent = "Copied!";
      copyBodyBtn.classList.add("copied");
      setTimeout(() => {
        if (textSpan) textSpan.textContent = "Copy markdown";
        copyBodyBtn.classList.remove("copied");
      }, 1500);
    });
  });
}

document.getElementById("prev").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadList();
});
document.getElementById("next").addEventListener("click", () => {
  state.offset += state.limit;
  loadList();
});

const map = startMap(document.getElementById("map"), (path) => peek(path));

let mapFilterType = "";
const mapQ = document.getElementById("map-q");
if (mapQ) {
  mapQ.addEventListener("input", () => {
    map.setFilter({ type: mapFilterType, query: mapQ.value.trim() });
  });
}

const mapChips = document.querySelectorAll("#map-chips button");
mapChips.forEach((btn) => {
  btn.addEventListener("click", () => {
    const t = btn.dataset.type || "";
    mapFilterType = t;
    mapChips.forEach((b) => b.classList.toggle("active", (b.dataset.type || "") === mapFilterType));
    map.setFilter({ type: mapFilterType, query: mapQ ? mapQ.value.trim() : "" });
  });
});

const btnLayoutOrganic = document.getElementById("btn-layout-organic");
const btnLayoutTree = document.getElementById("btn-layout-tree");
if (btnLayoutOrganic && btnLayoutTree) {
  btnLayoutOrganic.addEventListener("click", () => {
    btnLayoutOrganic.classList.add("active");
    btnLayoutTree.classList.remove("active");
    map.setLayoutMode("organic");
  });
  btnLayoutTree.addEventListener("click", () => {
    btnLayoutTree.classList.add("active");
    btnLayoutOrganic.classList.remove("active");
    map.setLayoutMode("tree");
  });
}

function showView(view) {
  state.view = view;
  const mapMode = view === "map";
  const sessions = view === "sessions";
  document.body.classList.toggle("view-map", mapMode);
  document.getElementById("main").classList.toggle("map-mode", mapMode);
  document.getElementById("catalog").hidden = view !== "list";
  document.getElementById("map-wrap").hidden = !mapMode;
  document.getElementById("map-hint").hidden = !mapMode;
  document.getElementById("sessions").hidden = !sessions;
  document.getElementById("timeline").hidden = !sessions;
  document.getElementById("timeline-heading").hidden = !sessions;
  const timelineWrap = document.getElementById("timeline-wrap");
  if (timelineWrap) timelineWrap.hidden = !sessions;

  document.getElementById("view-list").setAttribute("aria-pressed", String(view === "list"));
  document.getElementById("view-map").setAttribute("aria-pressed", String(mapMode));
  document.getElementById("view-sessions").setAttribute("aria-pressed", String(sessions));
  if (mapMode) {
    map.start();
    map.setFilter({ type: state.type, query: state.q });
    loadGraph();
  } else {
    map.stop();
  }
  if (sessions) loadSessions();
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function loadSessions() {
  const { body } = await api(`/api/sessions${qs()}`);
  const sessions = body?.ok ? body.data.sessions || [] : [];
  const ul = document.getElementById("session-list");
  const empty = document.getElementById("session-empty");
  ul.replaceChildren();
  empty.hidden = sessions.length > 0;
  for (const row of sessions) {
    const li = document.createElement("li");
    li.dataset.id = row.id;
    if (row.id === state.sessionId) li.className = "active";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    if (row.id === state.sessionId) btn.setAttribute("aria-current", "true");
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = row.title;
    const when = document.createElement("span");
    when.className = "session-when";
    const hours = row.status === "running" ? `${row.wall} running` : `${row.wall} wall`;
    when.textContent = `${formatWhen(row.started)} · ${hours}`;
    btn.append(title, when);
    btn.addEventListener("click", () => openSession(row.id));
    li.append(btn);
    ul.append(li);
  }
  if (!state.sessionId && sessions[0]) openSession(sessions[0].id);
}

async function openSession(id) {
  state.sessionId = id;
  const { body } = await api(`/api/sessions${qs({ session: id })}`);
  const ol = document.getElementById("timeline");
  ol.replaceChildren();
  if (!body?.ok) {
    const li = document.createElement("li");
    li.textContent = body?.error?.message || "Session not found";
    ol.append(li);
    return;
  }
  const events = body.data.events || [];
  if (events.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nothing recorded during this sit-down.";
    ol.append(li);
  }
  for (const event of events) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    const time = document.createElement("time");
    time.dateTime = event.at;
    time.textContent = formatWhen(event.at);
    btn.append(time, kindChip(event.type), document.createTextNode(event.title));
    btn.addEventListener("click", () => peek(event.path));
    li.append(btn);
    ol.append(li);
  }
  for (const li of document.querySelectorAll("#session-list li")) {
    li.classList.toggle("active", li.dataset.id === id);
  }
}

async function loadGraph() {
  const { body } = await api(`/api/graph${qs()}`);
  const data = body?.ok ? body.data : { nodes: [], edges: [] };
  map.setGraph(data);
  const cap = data.truncated ? ` Showing ${data.nodes.length} of ${data.total}.` : "";
  document.getElementById("map-help").textContent = `Scroll to zoom. Drag to pan or rearrange. Click a hub to fold/unfold. Click a node to peek.${cap}`;
}

document.getElementById("view-list").addEventListener("click", () => showView("list"));
document.getElementById("view-map").addEventListener("click", () => showView("map"));
document.getElementById("view-sessions").addEventListener("click", () => showView("sessions"));

document.getElementById("peek-body").addEventListener("click", (ev) => {
  const link = ev.target.closest("a[data-path]");
  if (!link) return;
  ev.preventDefault();
  peek(link.dataset.path.split("#")[0]);
});

state.view = "list";
initTheme();
renderChips();
loadProjects().then(() => {
  loadHeartbeat();
  loadList();
});
setInterval(() => {
  if (!document.getElementById("track").hidden) loadTrack();
}, 20000);
