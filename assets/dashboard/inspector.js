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
    api.open(link.dataset.path.split("#")[0]);
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

  async function load(path) {
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
    const { tags } = header(doc.path, fm);
    $("#insp-title").textContent = titleOf(doc.path, fm, doc.body);
    $("#insp-path").textContent = doc.path;

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

    const graph = await ctx.get("/api/graph");
    if (my !== token) return;
    const related = relatedByTag(graph?.nodes || [], doc.path, tags, back);
    $("#insp-related-wrap").hidden = related.length === 0;
    fill($("#insp-related"), ...related.map((n) => miniRow(n.path, n.type, n.title, n.shared)));
  }

  function miniRow(path, type, title, shared = null) {
    return h(
      "li",
      null,
      h(
        "button.mini-row",
        { type: "button", onclick: () => api.open(path) },
        h("span.mark", { "aria-hidden": "true" }, KIND[type]?.emoji || "📄"),
        h("span.mini-title", null, title || path),
        shared ? h("span.mini-meta", null, shared.map((t) => `#${t}`).join(" ")) : h("span.mini-meta", null, relTime(pathDate(path))),
      ),
    );
  }

  const api = {
    isOpen: () => !el.hidden,
    isPinned: () => pinned && !el.hidden,
    current: () => current,
    async open(path, { fromRoute = false } = {}) {
      if (!path) return;
      const wasOpen = !el.hidden;
      if (!wasOpen) returnFocus = document.activeElement;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("show"));
      syncChrome();
      if (!fromRoute) ctx.setParams({ open: path }, { push: !wasOpen });
      document.dispatchEvent(new CustomEvent("mental:select", { detail: { path } }));
      if (path !== current || !doc) await load(path);
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
