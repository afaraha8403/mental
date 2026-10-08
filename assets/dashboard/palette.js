import { $, debounce, fuzzyScore, h, icon, KIND, pathDate, relTime, fill } from "./ui.js";

const MAX_ITEMS = 8;

/**
 * ⌘K palette: items, projects, views, and `>` commands.
 * @param {any} ctx
 * @param {{ commands: () => any[], pickProject: (id: string) => void, views: any[] }} opts
 */
export function createPalette(ctx, { commands, pickProject }) {
  const dlg = $("#palette");
  const input = $("#palette-input");
  const list = $("#palette-list");
  let rows = [];
  let active = 0;
  let searchHits = [];
  let searchFor = "";

  $("#palette-icon").append(icon("search", 17));

  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close();
  });
  dlg.addEventListener("close", () => {
    input.value = "";
    searchHits = [];
  });
  input.addEventListener("input", () => {
    active = 0;
    render();
    fullText();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(rows[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  const fullText = debounce(async () => {
    const q = input.value.trim();
    if (q.startsWith(">") || q.length < 3) return;
    const { body } = await ctx.api(`/api/search${ctx.qs({ q, limit: 12 })}`);
    if (input.value.trim() !== q || !body?.ok) return;
    searchFor = q;
    searchHits = body.data.hits || [];
    render();
  }, 180);

  function move(delta) {
    if (!rows.length) return;
    active = (active + delta + rows.length) % rows.length;
    paintActive();
  }

  function paintActive() {
    const items = [...list.querySelectorAll("[role=option]")];
    items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    const cur = items[active];
    if (cur) {
      input.setAttribute("aria-activedescendant", cur.id);
      cur.scrollIntoView({ block: "nearest" });
    }
  }

  function run(row) {
    if (!row) return;
    close();
    row.run();
  }

  async function nodes() {
    const graph = await ctx.get("/api/graph");
    return graph?.nodes || [];
  }

  let nodeCache = [];

  function itemRow(n, meta) {
    return {
      group: "Items",
      label: n.title || n.path,
      meta: meta ?? relTime(pathDate(n.path)),
      emoji: KIND[n.type]?.emoji || "📄",
      run: () => ctx.open(n.path),
    };
  }

  function render() {
    const raw = input.value;
    const q = raw.trim();
    const cmdMode = q.startsWith(">");
    fill($("#palette-icon"), icon(cmdMode ? "sparkle" : "search", 17));
    /** @type {any[]} */
    let out = [];
    if (cmdMode) {
      const cq = q.slice(1).trim();
      out = commands()
        .map((c) => ({ c, s: cq ? fuzzyScore(cq, c.label) : 0 }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(({ c }) => ({ group: "Commands", label: c.label, hint: c.hint, iconName: c.icon, run: c.run }));
    } else if (!q) {
      const recent = [...nodeCache].sort((a, b) => pathDate(b.path).localeCompare(pathDate(a.path))).slice(0, 6);
      out = [
        ...recent.map((n) => itemRow(n)),
        ...commands()
          .filter((c) => c.id.startsWith("view:"))
          .map((c) => ({ group: "Jump to", label: c.label.replace(/^Go to /, ""), hint: c.hint, iconName: c.icon, run: c.run })),
      ];
      out.forEach((r) => {
        if (r.group === "Items") r.group = "Recent";
      });
    } else {
      const scored = nodeCache
        .map((n) => ({ n, s: Math.max(fuzzyScore(q, n.title), fuzzyScore(q, n.path) - 50) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_ITEMS);
      const seen = new Set(scored.map((x) => x.n.path));
      out.push(...scored.map(({ n }) => itemRow(n)));
      if (searchFor === q) {
        for (const hit of searchHits) {
          if (seen.has(hit.path) || out.length >= MAX_ITEMS + 4) continue;
          seen.add(hit.path);
          out.push({ ...itemRow(hit, ""), group: "Mentions", snippet: hit.snippet || hit.description || "" });
        }
      }
      const projects = ctx.projects
        .map((p) => ({ p, s: fuzzyScore(q, p.name) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);
      out.push(
        ...projects.map(({ p }) => ({
          group: "Projects",
          label: p.name,
          meta: p.lastTouched ? relTime(p.lastTouched) : "",
          iconName: "projects",
          run: () => pickProject(p.id),
        })),
      );
      const cmds = commands()
        .map((c) => ({ c, s: fuzzyScore(q, c.label) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);
      out.push(...cmds.map(({ c }) => ({ group: "Commands", label: c.label, hint: c.hint, iconName: c.icon, run: c.run })));
    }
    rows = out;
    if (active >= rows.length) active = 0;

    const frag = [];
    let group = "";
    rows.forEach((r, i) => {
      if (r.group !== group) {
        group = r.group;
        frag.push(h("li.palette-group", { role: "presentation" }, group));
      }
      frag.push(
        h(
          "li.palette-row",
          {
            role: "option",
            id: `pal-${i}`,
            "aria-selected": String(i === active),
            onclick: () => run(r),
            onmousemove: () => {
              if (active !== i) {
                active = i;
                paintActive();
              }
            },
          },
          h("span.palette-mark", { "aria-hidden": "true" }, r.emoji || (r.iconName ? icon(r.iconName, 16) : "")),
          h("span.palette-text", null, h("span.palette-label", null, highlight(r.label, cmdMode ? q.slice(1).trim() : q)), r.snippet ? h("span.palette-snippet", null, r.snippet) : null),
          r.meta ? h("span.palette-meta", null, r.meta) : null,
          r.hint ? h("kbd.kbd", null, r.hint) : null,
        ),
      );
    });
    if (!rows.length) frag.push(h("li.palette-empty", null, q ? `No matches for “${q}”` : "Nothing here yet"));
    fill(list, ...frag);
    paintActive();
  }

  async function open(prefill = "") {
    if (dlg.open) return;
    input.value = prefill;
    active = 0;
    dlg.showModal();
    input.focus();
    render();
    nodeCache = await nodes();
    if (dlg.open) render();
  }

  function close() {
    if (dlg.open) dlg.close();
  }

  return {
    open,
    close,
    toggle: () => (dlg.open ? close() : open()),
  };
}

/** Bold the matched substring (case-insensitive) without using innerHTML. */
function highlight(text, q) {
  const s = String(text || "");
  if (!q) return s;
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return s;
  return [s.slice(0, i), h("mark", null, s.slice(i, i + q.length)), s.slice(i + q.length)];
}

/** Render the `?` shortcut sheet. */
export function renderShortcutSheet(root, groups) {
  fill(root, 
    ...groups.map(([title, rows]) =>
      h(
        "section.shortcut-group",
        null,
        h("h3.eyebrow", null, title),
        h(
          "dl",
          null,
          rows.map(([keys, label]) =>
            h("div.shortcut-row", null, h("dt", null, keys.split(" ").map((k) => h("kbd.kbd", null, k))), h("dd", null, label)),
          ),
        ),
      ),
    ),
  );
}
