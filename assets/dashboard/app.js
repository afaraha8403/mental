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
    opt.textContent = `${p.name} (${p.attentionCount} air · ${p.openDecisionCount} open)`;
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
    [resume, outcome && `Last: ${outcome}`, git, `${d.attentionCount} in the air`, `${d.openDecisionCount} open decisions`]
      .filter(Boolean)
      .join(" · "),
  );
  const trackEl = document.getElementById("track");
  if (d.track) {
    const glance = await api(`/api/track/glance${qs()}`);
    if (glance.status === 200 && glance.body.ok) {
      const g = glance.body.data;
      trackEl.hidden = false;
      trackEl.textContent = `Track · ${g.runningCount} running · ${g.stoppedToday?.length || 0} stopped today`;
    } else {
      trackEl.hidden = true;
    }
  } else {
    trackEl.hidden = true;
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
    li.textContent = `[${row.type}] ${row.title}`;
    li.addEventListener("click", () => peek(row.path));
    ul.append(li);
  }
  document.getElementById("prev").disabled = state.offset <= 0;
  document.getElementById("next").disabled = end >= state.total;
}

async function peek(path) {
  state.path = path;
  const { body } = await api(`/api/show${qs({ path })}`);
  if (!body?.ok) {
    setText("peek-title", "Not found");
    setText("peek-meta", "");
    setText("peek-body", body?.error?.message || "not found");
    document.getElementById("backlinks").replaceChildren();
    return;
  }
  const d = body.data;
  const title = d.frontmatter?.title || d.path;
  const type = d.frontmatter?.type || "";
  const status = d.frontmatter?.status || "";
  setText("peek-title", title);
  setText("peek-meta", [d.path, type, status].filter(Boolean).join(" · "));
  setText("peek-body", d.text || d.body || "");
  const ul = document.getElementById("backlinks");
  ul.replaceChildren();
  for (const b of d.backlinks || []) {
    const li = document.createElement("li");
    li.textContent = `from [${b.type}] ${b.title}`;
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
    btn.textContent = t || "All";
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
  setText("peek-title", "Peek");
  setText("peek-meta", "Select a file.");
  setText("peek-body", "");
  document.getElementById("backlinks").replaceChildren();
  loadHeartbeat();
  loadList();
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

renderChips();
loadProjects().then(() => {
  loadHeartbeat();
  loadList();
});
