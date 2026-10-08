import { $, copyText, h, icon, kindChip, pathDate, relTime, skeleton, statusChip, tagChip, tagsOf, KIND, fill } from "./ui.js";
import { renderFrontmatter, renderMarkdown } from "./markdown.js";

const PIN_KEY = "mental-dashboard-pin";
const TYPE_BY_DIR = { decisions: "Decision", attention: "Attention", notes: "Note", journal: "Journal" };

/** Bundle type from frontmatter or the top-level folder. */
export function typeOfPath(path, fm) {
  if (fm?.type && KIND[fm.type]) return fm.type;
  const dir = String(path || "").split("/")[0];
  return TYPE_BY_DIR[dir] || "Note";
}

/**
 * Right-hand detail drawer. One instance; driven by `?open=<path>` in the hash.
 * @param {any} ctx
 */
export function createInspector(ctx) {
  const el = $("#inspector");
  const scrim = $("#scrim");
  const scroll = $("#insp-scroll");
  let current = "";
  let doc = null;
  let returnFocus = null;
  let token = 0;
  let pinned = localStorage.getItem(PIN_KEY) === "1";
  // Drawer history: a card stack. `pos` is the visible card; entries past it are "forward".
  // Each entry: { path, title, type, scroll, pushed } — `pushed` means arriving at it added a
  // browser history entry, so stepping back over it can use history.go and stay in sync.
  /** @type {{ path: string, title: string, type: string, scroll: number, pushed: boolean }[]} */
  let stack = [];
  let pos = -1;
  let pendingPos = -1;
  let stackId = Date.now();
  let trailOpen = false;
  const deck = $("#insp-deck");
  const trail = $("#insp-trail");

  $("#insp-back").append(icon("back", 16));
  $("#insp-back").addEventListener("click", () => back());
  for (const ghost of deck.querySelectorAll(".insp-ghost")) {
    ghost.addEventListener("click", () => back(Number(ghost.dataset.n)));
  }

  $("#insp-copy-path").append(icon("copy", 16));
  $("#insp-copy-md").append(icon("external", 16));
  $("#insp-copy-md").title = "Copy markdown";
  $("#insp-pin").append(icon("pin", 16));
  $("#insp-close").append(icon("close", 16));

  $("#insp-copy-path").addEventListener("click", () => current && copyText(current, "Path copied"));
  $("#insp-copy-md").addEventListener("click", () => doc && copyText(doc.text || doc.body || "", "Markdown copied"));
  $("#insp-close").addEventListener("click", () => api.close());
  $("#insp-pin").addEventListener("click", () => setPinned(!pinned));
  scrim.addEventListener("click", () => api.close());

  // Wiki links inside the body open in place.
  el.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a[data-path]") : null;
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.path.split("#")[0]);
  });

  function setPinned(on) {
    pinned = on;
    localStorage.setItem(PIN_KEY, on ? "1" : "0");
    $("#insp-pin").setAttribute("aria-pressed", String(on));
    $("#insp-pin").title = on ? "Unpin drawer" : "Pin drawer (stays open while you browse)";
    syncChrome();
  }

  function syncChrome() {
    const open = !el.hidden;
    document.body.classList.toggle("insp-open", open);
    document.body.classList.toggle("insp-pinned", open && pinned);
    scrim.hidden = !open;
  }

  function header(path, fm) {
    const type = typeOfPath(path, fm);
    const tags = tagsOf(fm);
    const date = fm?.date || pathDate(path);
    fill($("#insp-kind"), 
      kindChip(type),
      statusChip(fm?.status),
      fm?.kind ? h("span.chip.chip-soft", null, fm.kind) : null,
      date ? h("span.insp-date", { title: date }, relTime(date)) : null,
    );
    return { type, tags };
  }

  function titleOf(path, fm, body) {
    if (fm?.title) return String(fm.title);
    const m = /^#\s+(.+)$/m.exec(body || "");
    if (m) return m[1].trim();
    return String(path).split("/").pop().replace(/\.md$/, "");
  }

  async function load(path, { scrollTo = 0 } = {}) {
    const my = ++token;
    current = path;
    $("#insp-title").textContent = "";
    $("#insp-path").textContent = path;
    fill($("#insp-kind"), kindChip(typeOfPath(path)));
    fill($("#insp-fm"));
    fill($("#insp-body"), skeleton(6));
    $("#insp-backlinks-wrap").hidden = true;
    $("#insp-related-wrap").hidden = true;
    scroll.scrollTop = 0;

    const { body } = await ctx.api(`/api/show${ctx.qs({ path })}`);
    if (my !== token) return;
    if (!body?.ok) {
      doc = null;
      $("#insp-title").textContent = "Not found";
      fill($("#insp-body"), h("p.muted", null, body?.error?.message || "Could not load this file."));
      return;
    }
    doc = body.data;
    const fm = doc.frontmatter || {};
    const { type, tags } = header(doc.path, fm);
    $("#insp-title").textContent = titleOf(doc.path, fm, doc.body);
    $("#insp-path").textContent = doc.path;
    const entry = stack[pos];
    if (entry && entry.path === path) {
      entry.title = $("#insp-title").textContent;
      entry.type = type;
      renderTrail();
    }

    const extras = [];
    if (fm.against) extras.push(h("div.insp-against", null, h("span.eyebrow", null, "Against"), h("span", null, String(fm.against))));
    if (tags.length) extras.push(h("div.insp-tags", null, tags.map((t) => tagChip(t, () => ctx.go("library", { tag: t })))));
    const fmHtml = renderFrontmatter(fm);
    if (fmHtml) extras.push(h("details.insp-fm-details", null, h("summary", null, "Frontmatter"), h("div", { html: fmHtml })));
    fill($("#insp-fm"), ...extras);

    // Drop a leading H1 that repeats the title.
    let md = String(doc.body || "");
    md = md.replace(/^\s*#\s+.+\n?/, (line) => (line.replace(/^\s*#\s+/, "").trim() === $("#insp-title").textContent ? "" : line));
    const html = renderMarkdown(md);
    $("#insp-body").innerHTML = html || '<p class="muted">No body.</p>';

    const back = Array.isArray(doc.backlinks) ? doc.backlinks : [];
    $("#insp-backlinks-wrap").hidden = back.length === 0;
    fill($("#insp-backlinks"), ...back.map((b) => miniRow(b.path, b.type || typeOfPath(b.path), b.title)));
    if (scrollTo) scroll.scrollTop = scrollTo;

    const graph = await ctx.get("/api/graph");
    if (my !== token) return;
    const related = relatedByTag(graph?.nodes || [], doc.path, tags, back);
    $("#insp-related-wrap").hidden = related.length === 0;
    fill($("#insp-related"), ...related.map((n) => miniRow(n.path, n.type, n.title, n.shared)));
    if (scrollTo) scroll.scrollTop = scrollTo;
  }

  function miniRow(path, type, title, shared = null) {
    return h(
      "li",
      null,
      h(
        "button.mini-row",
        { type: "button", onclick: () => navigate(path, { title, type }) },
        h("span.mark", { "aria-hidden": "true" }, KIND[type]?.emoji || "📄"),
        h("span.mini-title", null, title || path),
        shared ? h("span.mini-meta", null, shared.map((t) => `#${t}`).join(" ")) : h("span.mini-meta", null, relTime(pathDate(path))),
      ),
    );
  }

  function entryFor(path, meta = {}) {
    return {
      path,
      title: meta.title || String(path).split("/").pop().replace(/\.md$/, ""),
      type: meta.type || typeOfPath(path),
      scroll: 0,
      pushed: false,
    };
  }

  function remember() {
    if (stack[pos]) stack[pos].scroll = scroll.scrollTop;
  }

  /** Stamp a history entry with the stack it belongs to and its card index. */
  function stamp(i = pos) {
    return { insp: stackId, pos: i };
  }

  /** Step deeper from inside the drawer: drop any forward cards and push a new one. */
  function navigate(path, meta) {
    if (!path || path === current) return;
    remember();
    stack = stack.slice(0, pos + 1);
    stack.push({ ...entryFor(path, meta), pushed: true });
    pos = stack.length - 1;
    trailOpen = false;
    ctx.setParams({ open: path }, { push: true, state: stamp() });
    show("fwd");
  }

  function back(n = 1) {
    goTo(pos - n);
  }

  /** Jump back to an earlier card. Uses browser history when every hop was pushed, so Back stays in sync. */
  function goTo(target) {
    if (target < 0 || target >= pos) return;
    remember();
    if (stack.slice(target + 1, pos + 1).every((e) => e.pushed)) {
      pendingPos = target;
      history.go(target - pos);
      return;
    }
    pos = target;
    ctx.setParams({ open: stack[pos].path }, { state: stamp() });
    show("back");
  }

  /** Match a route-driven path (browser back/forward) to a card in the stack. */
  function syncFromRoute(path) {
    const hinted = pendingPos;
    pendingPos = -1;
    const st = history.state;
    const stamped = st && st.insp === stackId && stack[st.pos]?.path === path ? st.pos : -1;
    if ((stamped >= 0 && stamped === pos) || (stamped < 0 && stack[pos]?.path === path)) return "";
    remember();
    let next = stamped;
    if (next >= 0) {
      /* exact entry from history.state */
    } else if (hinted >= 0 && stack[hinted]?.path === path) next = hinted;
    else if (stack[pos - 1]?.path === path) next = pos - 1;
    else if (stack[pos + 1]?.path === path) next = pos + 1;
    else next = stack.map((e) => e.path).lastIndexOf(path);
    if (next < 0) {
      stackId += 1;
      stack = [entryFor(path)];
      pos = 0;
      ctx.setParams({}, { state: stamp() });
      return "";
    }
    const dir = next < pos ? "back" : "fwd";
    pos = next;
    return dir;
  }

  function show(dir) {
    const entry = stack[pos];
    renderTrail();
    animate(dir);
    document.dispatchEvent(new CustomEvent("mental:select", { detail: { path: entry.path } }));
    load(entry.path, { scrollTo: dir === "back" ? entry.scroll : 0 });
  }

  function animate(dir) {
    scroll.classList.remove("enter-fwd", "enter-back");
    if (!dir) return;
    void scroll.offsetWidth;
    scroll.classList.add(`enter-${dir}`);
  }
  scroll.addEventListener("animationend", () => scroll.classList.remove("enter-fwd", "enter-back"));

  /** Journals share a "Journal — " prefix; the date alone is what tells crumbs apart. */
  function crumbLabel(e) {
    return String(e.title).replace(/^Journal\s*[—–-]\s*/, "") || e.title;
  }

  function renderTrail() {
    const depth = Math.max(0, pos);
    deck.dataset.depth = String(Math.min(depth, 2));
    for (const ghost of deck.querySelectorAll(".insp-ghost")) {
      const under = stack[pos - Number(ghost.dataset.n)];
      ghost.title = under ? `Back to ${under.title}` : "";
    }
    const prev = stack[pos - 1];
    const backBtn = $("#insp-back");
    backBtn.hidden = !prev;
    if (prev) {
      backBtn.title = `Back to ${prev.title} (Backspace)`;
      backBtn.setAttribute("aria-label", `Back to ${prev.title}`);
    }
    trail.hidden = depth < 1;
    trail.classList.toggle("open", trailOpen);
    if (depth < 1) return fill(trail);
    const items = stack.slice(0, pos + 1).map((e, i) => ({ e, i }));
    const shown = !trailOpen && items.length > 4 ? [items[0], null, ...items.slice(-2)] : items;
    const parts = [];
    shown.forEach((item, k) => {
      if (k) parts.push(h("span.crumb-sep", { "aria-hidden": "true" }, icon("chevron", 12)));
      if (!item) {
        const hiddenCount = items.length - 3;
        parts.push(
          h(
            "button.crumb.crumb-more",
            { type: "button", title: `Show ${hiddenCount} more`, "aria-label": `Show ${hiddenCount} more`, onclick: () => ((trailOpen = true), renderTrail()) },
            "…",
          ),
        );
        return;
      }
      const here = item.i === pos;
      parts.push(
        h(
          here ? "span.crumb.crumb-here" : "button.crumb",
          here ? { "aria-current": "page", title: item.e.title } : { type: "button", title: `Back to ${item.e.title}`, onclick: () => goTo(item.i) },
          h("span.crumb-mark", { "aria-hidden": "true" }, KIND[item.e.type]?.emoji || "📄"),
          h("span.crumb-label", null, crumbLabel(item.e)),
        ),
      );
    });
    fill(trail, ...parts);
  }

  const api = {
    isOpen: () => !el.hidden,
    isPinned: () => pinned && !el.hidden,
    current: () => current,
    canGoBack: () => !el.hidden && pos > 0,
    back: () => back(),
    async open(path, { fromRoute = false } = {}) {
      if (!path) return;
      const wasOpen = !el.hidden;
      if (!wasOpen) returnFocus = document.activeElement;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("show"));
      syncChrome();
      let dir = "";
      if (fromRoute) dir = syncFromRoute(path);
      else {
        // Opening from a list, the map or search starts a fresh stack.
        stackId += 1;
        stack = [stack[pos]?.path === path ? { ...stack[pos], pushed: false } : entryFor(path)];
        pos = 0;
        trailOpen = false;
        ctx.setParams({ open: path }, { push: !wasOpen, state: stamp() });
      }
      renderTrail();
      animate(wasOpen ? dir : "");
      document.dispatchEvent(new CustomEvent("mental:select", { detail: { path } }));
      if (path !== current || !doc) await load(path, { scrollTo: dir === "back" ? stack[pos].scroll : 0 });
      if (!wasOpen) $("#insp-close").focus({ preventScroll: true });
    },
    close({ fromRoute = false, force = false } = {}) {
      if (el.hidden) return;
      if (fromRoute && pinned && !force) return;
      el.classList.remove("show");
      el.hidden = true;
      current = "";
      doc = null;
      token++;
      stack = [];
      pos = -1;
      pendingPos = -1;
      renderTrail();
      syncChrome();
      document.dispatchEvent(new CustomEvent("mental:select", { detail: { path: "" } }));
      if (!fromRoute) ctx.setParams({ open: "" });
      if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    },
    reload() {
      if (current) load(current);
    },
  };

  setPinned(pinned);
  return api;
}

/** Up to 6 graph nodes sharing the most tags with this item. */
function relatedByTag(nodes, path, tags, backlinks) {
  if (!tags.length) return [];
  const skip = new Set([path, ...backlinks.map((b) => b.path)]);
  const want = new Set(tags);
  return nodes
    .filter((n) => !skip.has(n.path))
    .map((n) => ({ ...n, shared: tagsOf(n).filter((t) => want.has(t)) }))
    .filter((n) => n.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || String(pathDate(b.path)).localeCompare(String(pathDate(a.path))))
    .slice(0, 6);
}
