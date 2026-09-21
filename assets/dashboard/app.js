import { renderFrontmatter, renderMarkdown } from "./markdown.js";
import { startMap } from "./map.js";

const state = {
  id: "",
  type: "",
  q: "",
  offset: 0,
  limit: 50,
  total: 0,
  path: "",
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

async function loadProjects() {
  const { body } = await api("/api/projects");
  const sel = document.getElementById("project");
  sel.replaceChildren();
  const projects = body?.ok ? body.data.projects || [] : [];
  const active = body?.ok ? body.data.activeId : null;
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Current directory";
  sel.append(blank);
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (🚦 ${p.attentionCount} air · 🎯 ${p.openDecisionCount} open)`;
    sel.append(opt);
  }
  if (!state.id && active) {
    state.id = active;
  }
  sel.value = state.id;
}

async function loadHeartbeat() {
  const { body } = await api(`/api/heartbeat${qs()}`);
  const d = body?.ok ? body.data : null;
  if (!d) {
    setText("strip", "No bundle yet.");
    document.getElementById("track").hidden = true;
    return;
  }
  const resume = d.handoff?.resume || "No journal yet.";
  const outcome = d.handoff?.outcome || "";
  const git = d.git?.branch ? `${d.git.branch}${d.git.dirty ? " dirty" : ""}` : "";
  setText(
    "strip",
    [resume, outcome && `Last: ${outcome}`, git, `🚦 ${d.attentionCount} in the air`, `🎯 ${d.openDecisionCount} open decisions`]
      .filter(Boolean)
      .join(" · "),
  );
  state.track = d.track || null;
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
  setText("page", state.total ? `${start}–${end} of ${state.total}` : "0 of 0");
  const ul = document.getElementById("list");
  ul.replaceChildren();
  for (const row of rows) {
    const li = document.createElement("li");
    if (row.path === state.path) li.className = "active";
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = row.title;
    li.append(kindChip(row.type), title);
    li.addEventListener("click", () => peek(row.path));
    ul.append(li);
  }
  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = end >= state.total;
}

function clearPeek(title, meta) {
  setText("peek-title", title);
  setText("peek-meta", meta);
  const fm = document.getElementById("peek-fm");
  fm.hidden = true;
  fm.replaceChildren();
  document.getElementById("peek-body").replaceChildren();
}

async function peek(path) {
  state.path = path;
  const { body } = await api(`/api/show${qs({ path })}`);
  if (!body?.ok) {
    clearPeek("Not found", "");
    document.getElementById("peek-body").textContent = body?.error?.message || "not found";
    document.getElementById("backlinks").replaceChildren();
    return;
  }
  const d = body.data;
  const title = d.frontmatter?.title || d.path;
  const type = d.frontmatter?.type || "";
  const status = d.frontmatter?.status || "";
  setText("peek-title", title);
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
  map.select(path);
  const ul = document.getElementById("backlinks");
  ul.replaceChildren();
  for (const b of d.backlinks || []) {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = b.title;
    li.append(document.createTextNode("from"), kindChip(b.type), title);
    li.addEventListener("click", () => peek(b.path));
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
      state.offset = 0;
      renderChips();
      loadList();
    });
    box.append(btn);
  }
}

document.getElementById("project").addEventListener("change", (ev) => {
  state.id = ev.target.value;
  state.offset = 0;
  state.path = "";
  clearPeek("Peek", "Select a file.");
  document.getElementById("backlinks").replaceChildren();
  loadHeartbeat();
  loadList();
  if (state.view === "map") loadGraph();
});

document.getElementById("q").addEventListener("input", () => {
  state.q = document.getElementById("q").value.trim();
  state.offset = 0;
  loadList();
});

document.getElementById("prev").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadList();
});
document.getElementById("next").addEventListener("click", () => {
  state.offset += state.limit;
  loadList();
});

const map = startMap(document.getElementById("map"), (path) => peek(path));

function showView(view) {
  state.view = view;
  const mapMode = view === "map";
  document.getElementById("main").classList.toggle("map-mode", mapMode);
  document.getElementById("catalog").hidden = mapMode;
  document.getElementById("map").hidden = !mapMode;
  document.getElementById("map-hint").hidden = !mapMode;
  document.getElementById("view-list").setAttribute("aria-pressed", String(!mapMode));
  document.getElementById("view-map").setAttribute("aria-pressed", String(mapMode));
  if (mapMode) {
    map.start();
    loadGraph();
  } else {
    map.stop();
  }
}

async function loadGraph() {
  const { body } = await api(`/api/graph${qs()}`);
  const data = body?.ok ? body.data : { nodes: [], edges: [] };
  map.setGraph(data);
  const hint = document.getElementById("map-hint");
  const cap = data.truncated ? ` Showing ${data.nodes.length} of ${data.total}.` : "";
  hint.textContent = `Drag to orbit. Scroll to zoom. Click a node.${cap}`;
}

document.getElementById("view-list").addEventListener("click", () => showView("list"));
document.getElementById("view-map").addEventListener("click", () => showView("map"));
document.getElementById("peek-body").addEventListener("click", (ev) => {
  const link = ev.target.closest("a[data-path]");
  if (!link) return;
  ev.preventDefault();
  peek(link.dataset.path.split("#")[0]);
});

state.view = "list";
renderChips();
loadProjects().then(() => {
  loadHeartbeat();
  loadList();
});
setInterval(() => {
  if (!document.getElementById("track").hidden) loadTrack();
}, 20000);
