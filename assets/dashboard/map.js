import { d3 } from "./vendor/mind-map.js";
import { toMindMapGraph, toClusterGraph } from "./map-data.js";

/**
 * Truncate long strings with ellipsis.
 * @param {string} text
 * @param {number} max
 */
function shortText(text, max = 32) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s || "Untitled";
  return `${s.slice(0, max - 1)}…`;
}

/**
 * D3.js SVG Mind Map.
 * Renders an interactive, hierarchical knowledge graph with a central project root,
 * category hubs (Decisions, Attention, Notes, Journals), leaf concepts arranged in clean non-overlapping columns,
 * smooth organic branch curves, pan/zoom, sticky drag-and-drop, and collapsible branches.
 *
 * @param {HTMLElement} container
 * @param {(path: string) => void} onPick
 */
export function startMap(container, onPick) {
  container.replaceChildren();

  // Root SVG
  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "mind-map-svg")
    .attr("width", "100%")
    .attr("height", "100%");

  // SVG Definitions
  const defs = svg.append("defs");

  // Cross-link directional marker
  defs
    .append("marker")
    .attr("id", "mindmap-cross-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "var(--accent, #38bdf8)");

  // Main viewport for D3 zoom & pan
  const viewport = svg.append("g").attr("class", "mind-map-viewport");
  const bubbleLayer = viewport.append("g").attr("class", "graph-bubble-layer");
  const linksLayer = viewport.append("g").attr("class", "mind-map-links-layer");
  const crossLinksLayer = viewport.append("g").attr("class", "mind-map-cross-links-layer");
  const nodesLayer = viewport.append("g").attr("class", "mind-map-nodes-layer");
  const labelsLayer = viewport.append("g").attr("class", "graph-labels-layer");

  // Floating controls overlay
  const wrap = container.closest("#map-wrap") || container;
  let controls = wrap.querySelector(".map-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "map-controls";
    controls.innerHTML = `
      <button type="button" class="map-ctrl-btn" id="map-zoom-in" title="Zoom In" aria-label="Zoom in">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="map-zoom-out" title="Zoom Out" aria-label="Zoom out">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="map-fit" title="Fit to View" aria-label="Fit to view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><polyline points="21 15 21 21 15 21"></polyline><polyline points="3 9 3 3 9 3"></polyline></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="map-expand" title="Toggle Fullscreen" aria-label="Toggle fullscreen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="map-toggle-all" title="Toggle Expand/Collapse All" aria-label="Toggle expand or collapse all">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M3 12h3m12 0h3M12 3v3m0 12v3"></path></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="map-reset" title="Reset View & Unpin" aria-label="Reset view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
      </button>
    `;
    wrap.append(controls);
  }

  // Floating tooltip element
  let tooltip = wrap.querySelector(".mind-map-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "mind-map-tooltip";
    tooltip.hidden = true;
    wrap.append(tooltip);
  }

  const emptyOverlay = document.getElementById("map-empty");

  // State
  let rawPayload = { nodes: [], edges: [] };
  let selected = "";
  let hoveredId = "";
  let layoutMode = "graph"; // "graph" (default), "organic", or "tree"
  /** @type {ReturnType<typeof d3.forceSimulation> | null} */
  let simulation = null;
  let zoomScale = 0.85;
  const collapsedHubs = new Set();
  let initializedCollapsed = false;
  const pinnedNodes = new Map(); // id -> { x, y }
  let activeNodes = [];
  let activeLinks = [];
  let activeCrossLinks = [];
  let nodeMap = new Map();
  /** @type {Array<any>} */
  let graphNodes = [];
  /** @type {Array<any>} */
  let graphLinks = [];
  /** @type {Array<any>} */
  let graphClusters = [];
  let adjacency = new Map();
  let clusterById = new Map();
  let labelFrame = 0;

  // D3 Zoom configuration
  const zoom = d3
    .zoom()
    .scaleExtent([0.04, 12])
    .on("zoom", (event) => {
      zoomScale = event.transform.k;
      viewport.attr("transform", event.transform);
      if (layoutMode === "graph") scheduleLabels();
    });

  svg.call(zoom).on("dblclick.zoom", null);

  // Zoom control buttons
  const btnIn = controls.querySelector("#map-zoom-in");
  const btnOut = controls.querySelector("#map-zoom-out");
  const btnFit = controls.querySelector("#map-fit");
  const btnExpand = controls.querySelector("#map-expand");
  const btnToggleAll = controls.querySelector("#map-toggle-all");
  const btnReset = controls.querySelector("#map-reset");

  if (btnIn) btnIn.onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.3);
  if (btnOut) btnOut.onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 0.77);
  if (btnFit) btnFit.onclick = () => zoomToFit(true);
  if (btnExpand) {
    btnExpand.onclick = () => {
      wrap.classList.toggle("expanded");
      setTimeout(() => zoomToFit(true), 250);
    };
  }
  if (btnToggleAll) {
    btnToggleAll.onclick = () => {
      const graph = toMindMapGraph(rawPayload, getProjectName(), null, layoutMode);
      const allHubIds = graph.hubs.map((h) => h.id);
      if (collapsedHubs.size > 0) {
        collapsedHubs.clear();
      } else {
        for (const id of allHubIds) {
          collapsedHubs.add(id);
        }
      }
      renderGraph();
      setTimeout(() => zoomToFit(true), 150);
    };
  }
  if (btnReset) {
    btnReset.onclick = () => {
      if (layoutMode === "graph") {
        renderGraph();
        return;
      }
      pinnedNodes.clear();
      activeNodes.forEach((n) => {
        n.x = n.origX;
        n.y = n.origY;
        n.isPinned = false;
      });
      nodesLayer.selectAll(".mindmap-node").classed("pinned", false);
      updateNodePositions();
      updateLinkPositions();
      resetZoom(true);
    };
  }

  function resetZoom(animate = false) {
    const rect = container.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(0.85);
    if (animate) svg.transition().duration(400).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }

  function zoomToFit(animate = false) {
    if (!activeNodes.length) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    if (w < 10 || h < 10) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    if (layoutMode === "graph") {
      fitBoxes(
        graphClusters
          .filter((c) => Number.isFinite(c.cx))
          .map((c) => ({ x0: c.cx - c.R, x1: c.cx + c.R, y0: c.cy - c.R - 22, y1: c.cy + c.R })),
        animate,
        1.4,
      );
      return;
    }
    for (const d of activeNodes) {
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const hw = (d.w || 280) / 2 + 30;
      const hh = (d.h || 34) / 2 + 20;
      minX = Math.min(minX, d.x - hw);
      maxX = Math.max(maxX, d.x + hw);
      minY = Math.min(minY, d.y - hh);
      maxY = Math.max(maxY, d.y + hh);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      resetZoom(animate);
      return;
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    if (dx <= 0 || dy <= 0) {
      resetZoom(animate);
      return;
    }

    const padding = 60;
    const scale = Math.min(1.4, Math.max(0.05, Math.min((w - padding * 2) / dx, (h - padding * 2) / dy)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const t = d3.zoomIdentity
      .translate(w / 2, h / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    if (animate) svg.transition().duration(500).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }

  function zoomToNodes(nodes, animate = false) {
    if (layoutMode === "graph") {
      fitBoxes(
        nodes
          .filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
          .map((n) => ({ x0: n.x - 40, x1: n.x + 40, y0: n.y - 30, y1: n.y + 20 })),
        animate,
        1.6,
      );
      return;
    }
    const prev = activeNodes;
    activeNodes = nodes;
    zoomToFit(animate);
    activeNodes = prev;
  }

  function frameSelection(animate = true) {
    if (!filterTag) {
      zoomToFit(animate);
      return;
    }
    if (layoutMode === "graph") {
      const hits = graphNodes.filter((n) => matchesTag(n));
      if (hits.length) zoomToNodes(hits, animate);
      else zoomToFit(animate);
      return;
    }
    const island = activeNodes.filter((node) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return false;
      if (node.isHub) return matchesTag(node);
      return String(node.tags?.[0] || "").toLowerCase() === filterTag;
    });
    const matched = island.length
      ? island
      : activeNodes.filter((node) => matchesTag(node) && Number.isFinite(node.x) && Number.isFinite(node.y));
    if (matched.length) zoomToNodes(matched, animate);
    else zoomToFit(animate);
  }

  // Smooth organic mind map branch curves (cubic Bezier connecting node perimeter to node perimeter)
  function linkPath(d) {
    const s = typeof d.source === "object" ? d.source : nodeMap.get(d.source);
    const t = typeof d.target === "object" ? d.target : nodeMap.get(d.target);
    if (!s || !t || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      return "";
    }
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const sw = (s.w || 180) / 2;
    const sh = (s.h || 36) / 2;
    const tw = (t.w || 270) / 2;
    const th = (t.h || 34) / 2;

    let sx, sy, tx, ty;
    if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
      const rightward = dx >= 0;
      sx = rightward ? s.x + sw : s.x - sw;
      sy = s.y;
      tx = rightward ? t.x - tw : t.x + tw;
      ty = t.y;
      const cdx = (tx - sx) * 0.45;
      return `M ${sx} ${sy} C ${sx + cdx} ${sy}, ${tx - cdx} ${ty}, ${tx} ${ty}`;
    } else {
      const downward = dy >= 0;
      sx = s.x;
      sy = downward ? s.y + sh : s.y - sh;
      tx = t.x;
      ty = downward ? t.y - th : t.y + th;
      const cdy = (ty - sy) * 0.45;
      return `M ${sx} ${sy} C ${sx} ${sy + cdy}, ${tx} ${ty - cdy}, ${tx} ${ty}`;
    }
  }

  function crossLinkPath(d) {
    const s = typeof d.source === "object" ? d.source : nodeMap.get(d.source);
    const t = typeof d.target === "object" ? d.target : nodeMap.get(d.target);
    if (!s || !t || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      return "";
    }
    const sw = (s.w || 270) / 2;
    const sh = (s.h || 34) / 2;
    const tw = (t.w || 270) / 2;
    const th = (t.h || 34) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;

    let sx, sy, tx, ty;
    if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
      const rightward = dx >= 0;
      sx = rightward ? s.x + sw : s.x - sw;
      sy = s.y;
      tx = rightward ? t.x - tw : t.x + tw;
      ty = t.y;
    } else {
      const downward = dy >= 0;
      sx = s.x;
      sy = downward ? s.y + sh : s.y - sh;
      tx = t.x;
      ty = downward ? t.y - th : t.y + th;
    }

    const dist = Math.hypot(tx - sx, ty - sy);
    const dr = dist * 1.15;
    return `M ${sx} ${sy} A ${dr} ${dr} 0 0,1 ${tx} ${ty}`;
  }

  function updateNodePositions() {
    nodesLayer
      .selectAll(".mindmap-node")
      .attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
  }

  function updateLinkPositions() {
    linksLayer.selectAll(".link-structural").attr("d", linkPath);
    crossLinksLayer.selectAll(".link-cross").attr("d", crossLinkPath);
  }

  let filterTag = "";
  let filterQuery = "";

  function matchesTag(d) {
    if (!filterTag) return true;
    if (d.isHub) {
      const id = String(d.matterId || "").toLowerCase();
      return id === filterTag || id === `tag-${filterTag}`;
    }
    return (d.tags || []).some((tag) => String(tag).toLowerCase() === filterTag);
  }

  function applyFilter() {
    if (layoutMode === "graph") {
      applyGraphFilter();
      return;
    }
    const fQuery = (filterQuery || "").toLowerCase().trim();
    const hasFilter = Boolean(filterTag || fQuery);

    if (!hasFilter) {
      nodesLayer.selectAll(".mindmap-node").classed("dimmed", false).classed("filter-matched", false);
      linksLayer.selectAll(".link-structural").classed("dimmed", false);
      crossLinksLayer.selectAll(".link-cross").classed("dimmed", false);
      return;
    }

    const matchedConceptIds = new Set();
    const matchedHubIds = new Set();

    nodesLayer.selectAll(".node-concept").each(function (d) {
      const qMatch =
        !fQuery ||
        (d.title && d.title.toLowerCase().includes(fQuery)) ||
        (d.path && d.path.toLowerCase().includes(fQuery)) ||
        (d.description && d.description.toLowerCase().includes(fQuery)) ||
        (d.matterLabel && d.matterLabel.toLowerCase().includes(fQuery)) ||
        (Array.isArray(d.tags) && d.tags.some((t) => String(t).toLowerCase().includes(fQuery)));

      const isMatch = matchesTag(d) && qMatch;
      if (isMatch) {
        matchedConceptIds.add(d.id);
        if (d.hubId) matchedHubIds.add(d.hubId);
      }
      d3.select(this)
        .classed("dimmed", !isMatch)
        .classed("filter-matched", isMatch);
    });

    nodesLayer.selectAll(".node-hub").each(function (d) {
      const hubMatchesQuery = fQuery && d.title && d.title.toLowerCase().includes(fQuery);
      const isMatch = matchesTag(d) && (matchedHubIds.has(d.id) || Boolean(hubMatchesQuery) || !fQuery);
      d3.select(this)
        .classed("dimmed", !isMatch)
        .classed("filter-matched", isMatch && !matchedHubIds.has(d.id));
    });

    linksLayer.selectAll(".link-structural").classed("dimmed", (l) => {
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      return !matchedConceptIds.has(targetId) && !matchedHubIds.has(targetId);
    });

    crossLinksLayer.selectAll(".link-cross").classed("dimmed", (l) => {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      return !matchedConceptIds.has(sId) && !matchedConceptIds.has(tId);
    });
  }

  function applyHighlights() {
    if (layoutMode === "graph") {
      applyGraphFocus();
      return;
    }
    const activeId = hoveredId || selected;
    const allLinks = linksLayer.selectAll(".link-structural");
    const allCrossLinks = crossLinksLayer.selectAll(".link-cross");
    const allNodes = nodesLayer.selectAll(".mindmap-node");

    if (!activeId) {
      allLinks.classed("highlighted", false);
      allCrossLinks.classed("highlighted", false);
      allNodes.classed("linked-highlight", false);
      return;
    }

    const connectedIds = new Set([activeId]);
    allLinks.classed("highlighted", (l) => {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      const isMatch = sId === activeId || tId === activeId;
      if (isMatch) {
        connectedIds.add(sId);
        connectedIds.add(tId);
      }
      return isMatch;
    });

    allCrossLinks.classed("highlighted", (l) => {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      const isMatch = sId === activeId || tId === activeId;
      if (isMatch) {
        connectedIds.add(sId);
        connectedIds.add(tId);
      }
      return isMatch;
    });

    allNodes.classed("linked-highlight", (n) => connectedIds.has(n.id) && n.id !== activeId);
  }

  function getProjectName() {
    const sel = document.getElementById("project");
    if (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]?.text) {
      const text = sel.options[sel.selectedIndex].text;
      if (text !== "This folder") return text;
    }
    return "Mental";
  }

  function stopForce() {
    if (!simulation) return;
    simulation.on("tick", null);
    simulation.stop();
    simulation = null;
  }

  const LABEL_FONT = 11;
  const CLUSTER_FONT = 12.5;
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  function nodeRadius(d) {
    return 4.5 + Math.min(9, Math.sqrt(Math.max(0, d.links || 0)) * 2.4);
  }

  /** Bubble = centroid of its members plus the farthest member, so it always hugs what is inside. */
  function updateBubbleGeometry() {
    const acc = new Map();
    for (const n of graphNodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      const a = acc.get(n.cluster) || { sx: 0, sy: 0, n: 0 };
      a.sx += n.x;
      a.sy += n.y;
      a.n += 1;
      acc.set(n.cluster, a);
    }
    for (const c of graphClusters) {
      const a = acc.get(c.id);
      c.cx = a ? a.sx / a.n : c.hx;
      c.cy = a ? a.sy / a.n : c.hy;
      c.R = 0;
    }
    for (const n of graphNodes) {
      const c = clusterById.get(n.cluster);
      if (!c || !Number.isFinite(n.x)) continue;
      c.R = Math.max(c.R, Math.hypot(n.x - c.cx, n.y - c.cy) + nodeRadius(n));
    }
    for (const c of graphClusters) c.R = Math.max(24, c.R + 12);
  }

  function paintBubbles() {
    bubbleLayer
      .selectAll(".graph-bubble")
      .select("circle")
      .attr("cx", (d) => d.cx)
      .attr("cy", (d) => d.cy)
      .attr("r", (d) => d.R);
  }

  function scheduleLabels() {
    if (labelFrame) return;
    labelFrame = requestAnimationFrame(updateLabels);
  }

  /** Semantic zoom: greedy, collision-aware label placement in screen space, most important first. */
  function updateLabels() {
    labelFrame = 0;
    if (layoutMode !== "graph" || !graphNodes.length) return;
    const rect = container.getBoundingClientRect();
    const W = rect.width || 600;
    const H = rect.height || 400;
    const t = d3.zoomTransform(svg.node());
    const k = t.k;
    const placed = [];
    const free = (b) => {
      for (const o of placed) {
        if (b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) return false;
      }
      return true;
    };
    const onScreen = (b) => b.x1 > 0 && b.x0 < W && b.y1 > 0 && b.y0 < H;
    const hasFilter = Boolean(filterTag || filterQuery);
    const activeId = hoveredId || selected;
    const neighbors = activeId ? adjacency.get(activeId) : null;

    for (const c of graphClusters) {
      const el = c.labelEl;
      if (!el || !Number.isFinite(c.cx)) continue;
      const sx = t.applyX(c.cx);
      const sy = t.applyY(c.cy) - c.R * k - 7;
      const w = (c.short.length + String(c.count).length + 2) * CLUSTER_FONT * 0.62;
      const box = { x0: sx - w / 2, x1: sx + w / 2, y0: sy - CLUSTER_FONT, y1: sy + 4 };
      const show = onScreen(box) && free(box);
      if (show) {
        placed.push(box);
        el.setAttribute("x", c.cx);
        el.setAttribute("y", c.cy - c.R - 7 / k);
        el.setAttribute("font-size", CLUSTER_FONT / k);
      }
      el.classList.toggle("visible", show);
    }

    const ranked = [];
    for (const n of graphNodes) {
      if (!n.labelEl) continue;
      let s = (n.links || 0) * 10 + (n.done ? 0 : 5);
      if (n.id === activeId) s += 1e7;
      else if (neighbors && neighbors.has(n.id)) s += 1e5;
      if (hasFilter) {
        if (!n.match) {
          if (n.labelOn) {
            n.labelEl.classList.remove("visible");
            n.labelOn = false;
          }
          continue;
        }
        s += 1e4;
      }
      ranked.push({ n, s });
    }
    ranked.sort((a, b) => b.s - a.s);

    let count = 0;
    const cap = Math.min(260, 24 + k * 45);
    for (const { n } of ranked) {
      const r = nodeRadius(n);
      const forced = n.id === activeId || (neighbors && neighbors.has(n.id));
      let show = false;
      if (forced || (count < cap && (hasFilter || r * k >= 3.6))) {
        const sx = t.applyX(n.x);
        const sy = t.applyY(n.y);
        const box = { x0: sx + r * k + 2, x1: sx + r * k + 8 + n.short.length * 6.4, y0: sy - 9, y1: sy + 9 };
        if (onScreen(box) && (n.id === activeId || free(box))) {
          placed.push(box);
          show = true;
          count += 1;
          n.labelEl.setAttribute("font-size", LABEL_FONT / k);
          n.labelEl.setAttribute("x", n.x + r + 3 / k);
          n.labelEl.setAttribute("y", n.y + (LABEL_FONT * 0.35) / k);
        }
      }
      if (show !== n.labelOn) {
        n.labelEl.classList.toggle("visible", show);
        n.labelOn = show;
      }
    }
  }

  function applyGraphFocus() {
    const activeId = hoveredId || selected;
    const neighbors = activeId ? adjacency.get(activeId) : null;
    const focus = Boolean(neighbors && neighbors.size > 0);
    nodesLayer
      .selectAll(".graph-node")
      .classed("linked-highlight", (d) => focus && neighbors.has(d.id))
      .classed("faded", (d) => focus && d.id !== activeId && !neighbors.has(d.id));
    linksLayer
      .selectAll(".graph-link")
      .classed("highlighted", (l) => Boolean(activeId) && (l.source.id === activeId || l.target.id === activeId))
      .classed("faded", (l) => focus && l.source.id !== activeId && l.target.id !== activeId);
    scheduleLabels();
  }

  function applyGraphFilter() {
    const q = filterQuery;
    const has = Boolean(filterTag || q);
    const liveClusters = new Set();
    for (const n of graphNodes) {
      const qMatch =
        !q ||
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.path && n.path.toLowerCase().includes(q)) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (Array.isArray(n.tags) && n.tags.some((tag) => String(tag).toLowerCase().includes(q)));
      n.match = !has || (matchesTag(n) && Boolean(qMatch));
      if (n.match) liveClusters.add(n.cluster);
    }
    nodesLayer
      .selectAll(".graph-node")
      .classed("dimmed", (d) => has && !d.match)
      .classed("filter-matched", (d) => has && d.match);
    linksLayer.selectAll(".graph-link").classed("dimmed", (l) => has && !(l.source.match && l.target.match));
    bubbleLayer.selectAll(".graph-bubble").classed("dimmed", (c) => has && !liveClusters.has(c.id));
    scheduleLabels();
  }

  function fitBoxes(boxes, animate, maxScale) {
    const rect = container.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    if (w < 10 || h < 10 || !boxes.length) return;
    const minX = Math.min(...boxes.map((b) => b.x0));
    const maxX = Math.max(...boxes.map((b) => b.x1));
    const minY = Math.min(...boxes.map((b) => b.y0));
    const maxY = Math.max(...boxes.map((b) => b.y1));
    const padX = 40;
    const padTop = 58;
    const padBottom = 36;
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const scale = Math.min(maxScale, Math.max(0.05, Math.min((w - padX * 2) / dx, (h - padTop - padBottom) / dy)));
    const t = d3.zoomIdentity
      .translate(w / 2, padTop + (h - padTop - padBottom) / 2)
      .scale(scale)
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    if (animate) svg.transition().duration(500).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }

  function renderForce({ keepView = false } = {}) {
    linksLayer.selectAll(".link-structural").remove();
    crossLinksLayer.selectAll(".link-cross").remove();
    nodesLayer.selectAll(".mindmap-node").remove();
    stopForce();
    wrap.dataset.layout = "graph";

    const graph = toClusterGraph(rawPayload);
    graphNodes = graph.nodes;
    graphLinks = graph.links;
    graphClusters = graph.clusters;
    activeNodes = graphNodes;
    linksLayer.selectAll(".graph-link").remove();
    nodesLayer.selectAll(".graph-node").remove();
    bubbleLayer.selectAll("*").remove();
    labelsLayer.selectAll("*").remove();
    if (!graphNodes.length) {
      if (emptyOverlay) emptyOverlay.hidden = false;
      return;
    }
    if (emptyOverlay) emptyOverlay.hidden = true;

    clusterById = new Map(graphClusters.map((c) => [c.id, c]));
    adjacency = new Map(graphNodes.map((n) => [n.id, new Set()]));
    for (const l of graphLinks) {
      adjacency.get(l.source)?.add(l.target);
      adjacency.get(l.target)?.add(l.source);
    }

    // Pack one circle per cluster, then settle members inside their own circle (deterministic: no animation).
    const members = new Map(graphClusters.map((c) => [c.id, []]));
    for (const n of graphNodes) members.get(n.cluster).push(n);
    for (const c of graphClusters) {
      const list = members.get(c.id).sort((a, b) => (b.links || 0) - (a.links || 0) || a.id.localeCompare(b.id));
      const area = list.reduce((sum, n) => sum + (nodeRadius(n) + 2.5) ** 2, 0);
      c.hr = Math.max(26, Math.sqrt(area / 0.62));
      c.short = shortText(c.label, 26);
    }
    const circles = graphClusters.map((c) => ({ r: c.hr + 30, c }));
    d3.packSiblings(circles);
    for (const circle of circles) {
      circle.c.hx = circle.x;
      circle.c.hy = circle.y;
    }
    for (const c of graphClusters) {
      const list = members.get(c.id);
      list.forEach((n, i) => {
        const rr = c.hr * 0.9 * Math.sqrt((i + 0.5) / list.length);
        const angle = i * 2.399963;
        n.x = c.hx + rr * Math.cos(angle);
        n.y = c.hy + rr * Math.sin(angle);
      });
    }

    const contain = () => {
      for (const n of graphNodes) {
        const c = clusterById.get(n.cluster);
        const dx = n.x - c.hx;
        const dy = n.y - c.hy;
        const dist = Math.hypot(dx, dy) || 1;
        const max = c.hr - nodeRadius(n);
        if (dist > max) {
          const pull = ((dist - max) / dist) * 0.5;
          n.x -= dx * pull;
          n.y -= dy * pull;
        }
      }
    };
    simulation = d3
      .forceSimulation(graphNodes)
      .force("link", d3.forceLink(graphLinks).id((d) => d.id).distance(48).strength(0.015))
      .force("x", d3.forceX((d) => clusterById.get(d.cluster).hx).strength(0.16))
      .force("y", d3.forceY((d) => clusterById.get(d.cluster).hy).strength(0.16))
      .force("collide", d3.forceCollide((d) => nodeRadius(d) + 2.5).iterations(2))
      .force("contain", contain)
      .stop();
    for (let i = 0; i < 300; i++) simulation.tick();
    updateBubbleGeometry();

    const allBubbles = bubbleLayer.selectAll(".graph-bubble").data(graphClusters).enter().append("g").attr("class", "graph-bubble");
    allBubbles
      .append("circle")
      .attr("class", "bubble-fill")
      .attr("fill", (d) => d.color)
      .attr("stroke", (d) => d.color);
    allBubbles.each(function (c) {
      const text = d3.select(this).append("text").attr("class", "bubble-label").attr("fill", c.color);
      text.append("tspan").attr("class", "bubble-name").text(c.short);
      text.append("tspan").attr("class", "bubble-count").attr("dx", 5).text(c.count);
      c.labelEl = text.node();
    });
    allBubbles.on("click", (event, c) => {
      event.stopPropagation();
      zoomToNodes(members.get(c.id), true);
    });

    const allLinks = linksLayer.selectAll(".graph-link").data(graphLinks).enter().append("line").attr("class", "graph-link");
    const allNodes = nodesLayer
      .selectAll(".graph-node")
      .data(graphNodes)
      .enter()
      .append("g")
      .attr("class", (d) => (d.done ? "graph-node done" : "graph-node"));
    allNodes
      .append("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => d.color || "#38bdf8")
      .attr("stroke", (d) => (d.done ? d.color : null));
    allNodes.each(function (d) {
      d.short = shortText(d.title, 30);
      d.labelEl = labelsLayer.append("text").attr("class", "graph-label").text(d.short).node();
      d.labelOn = false;
    });
    allNodes.classed("selected", (d) => d.id === selected);

    const paint = () => {
      allLinks
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      allNodes.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
      updateBubbleGeometry();
      paintBubbles();
      scheduleLabels();
    };
    paint();

    allNodes
      .on("mouseenter", (event, d) => {
        hoveredId = d.id;
        const bits = [d.type, d.status].filter(Boolean).join(" · ");
        const where = clusterById.get(d.cluster)?.label || "";
        const tags = (d.tags || []).length ? `<div class="tt-meta">${escapeHtml(d.tags.join(", "))}</div>` : "";
        tooltip.innerHTML = `<div class="tt-title">${escapeHtml(d.title || d.path)}</div><div class="tt-meta">${escapeHtml(bits)}${where ? ` · ${escapeHtml(where)}` : ""}</div>${tags}<div class="tt-path">${escapeHtml(d.path)}</div>`;
        tooltip.hidden = false;
        positionTooltip(event);
        applyHighlights();
      })
      .on("mousemove", (event) => positionTooltip(event))
      .on("mouseleave", () => {
        hoveredId = "";
        tooltip.hidden = true;
        applyHighlights();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        selected = d.path || "";
        allNodes.classed("selected", (n) => n.id === selected);
        applyHighlights();
        if (d.path) onPick(d.path);
      })
      .call(
        d3
          .drag()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.2).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event) => {
            if (!event.active) simulation.alphaTarget(0);
          }),
      );
    simulation.on("tick", paint);

    svg.on("click", () => {
      selected = "";
      hoveredId = "";
      allNodes.classed("selected", false);
      applyHighlights();
    });

    if (!keepView) zoomToFit(false);
    applyFilter();
    applyHighlights();
  }

  function renderGraph(opts) {
    if (layoutMode === "graph") {
      renderForce(opts);
      return;
    }
    stopForce();
    wrap.dataset.layout = layoutMode;
    graphNodes = [];
    graphClusters = [];
    bubbleLayer.selectAll("*").remove();
    labelsLayer.selectAll("*").remove();
    linksLayer.selectAll(".graph-link").remove();
    nodesLayer.selectAll(".graph-node").remove();

    // Initialize collapsed state on first run so the map opens with a clean, uncrowded overview
    if (!initializedCollapsed) {
      const probe = toMindMapGraph(rawPayload, getProjectName(), null, layoutMode);
      if (probe.hubs.length > 0) {
        initializedCollapsed = true;
        for (const h of probe.hubs) {
          collapsedHubs.add(h.id);
        }
      }
    }

    const graph = toMindMapGraph(rawPayload, getProjectName(), collapsedHubs, layoutMode);

    if (graph.allNodes.length <= 1 && (!rawPayload.nodes || rawPayload.nodes.length === 0)) {
      if (emptyOverlay) emptyOverlay.hidden = false;
      linksLayer.selectAll("*").remove();
      crossLinksLayer.selectAll("*").remove();
      nodesLayer.selectAll("*").remove();
      return;
    }
    if (emptyOverlay) emptyOverlay.hidden = true;

    // Filter nodes based on collapsed hubs
    const hiddenHubIds = new Set(collapsedHubs);

    activeNodes = [
      graph.root,
      ...graph.hubs,
      ...graph.concepts.filter((c) => !hiddenHubIds.has(c.hubId)),
    ];

    // Restore any previously pinned user positions
    for (const node of activeNodes) {
      if (pinnedNodes.has(node.id)) {
        const pin = pinnedNodes.get(node.id);
        node.x = pin.x;
        node.y = pin.y;
        node.isPinned = true;
      }
    }

    nodeMap = new Map(activeNodes.map((n) => [n.id, n]));

    activeLinks = graph.structuralLinks.filter(
      (l) => nodeMap.has(l.source) && nodeMap.has(l.target)
    );

    activeCrossLinks = graph.crossLinks.filter(
      (l) => nodeMap.has(l.source) && nodeMap.has(l.target)
    );

    // Bind structural links
    const linkSel = linksLayer
      .selectAll(".link-structural")
      .data(activeLinks, (d) => `${d.source}->${d.target}`);

    linkSel.exit().remove();

    const linkEnter = linkSel
      .enter()
      .append("path")
      .attr("class", "link-structural")
      .attr("stroke", (d) => d.color || "#64748b");

    const allLinks = linkEnter.merge(linkSel);

    // Bind cross links (semantic OKF brain connections)
    const crossSel = crossLinksLayer
      .selectAll(".link-cross")
      .data(activeCrossLinks, (d) => `${d.source}->${d.target}`);

    crossSel.exit().remove();

    const crossEnter = crossSel
      .enter()
      .append("path")
      .attr("class", (d) => (d.isSameHub ? "link-cross link-intra" : "link-cross link-inter"))
      .attr("marker-end", "url(#mindmap-cross-arrow)");

    const allCrossLinks = crossEnter.merge(crossSel);

    allCrossLinks
      .on("mouseenter", (event, d) => {
        const s = typeof d.source === "object" ? d.source : nodeMap.get(d.source);
        const t = typeof d.target === "object" ? d.target : nodeMap.get(d.target);
        if (!s || !t) return;
        allNodes.classed("linked-highlight", (n) => n.id === s.id || n.id === t.id);
        allCrossLinks.classed("highlighted", (l) => l.id === d.id);
        tooltip.hidden = false;
        tooltip.innerHTML = `
          <div class="tt-title">🔗 OKF Relation: ${d.rel || "related"}</div>
          <div class="tt-meta">${s.typeEmoji || ""} ${s.title || s.path}</div>
          <div class="tt-meta" style="margin-top:2px; color:var(--accent);">↕ ${t.typeEmoji || ""} ${t.title || t.path}</div>
        `;
        positionTooltip(event);
      })
      .on("mousemove", positionTooltip)
      .on("mouseleave", () => {
        applyHighlights();
        tooltip.hidden = true;
      });

    // Bind nodes
    const nodeSel = nodesLayer.selectAll(".mindmap-node").data(activeNodes, (d) => d.id);

    nodeSel.exit().remove();

    const dragBehavior = d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", (d) => {
        if (d.isRoot) return "mindmap-node node-root";
        if (d.isHub) return "mindmap-node node-hub";
        return "mindmap-node node-concept";
      })
      .call(dragBehavior);

    // Render node shapes based on kind and dimensions
    nodeEnter.each(function (d) {
      const g = d3.select(this);

      if (d.isRoot) {
        const w = d.w || 160;
        const h = d.h || 38;
        g.append("rect")
          .attr("x", -w / 2)
          .attr("y", -h / 2)
          .attr("width", w)
          .attr("height", h)
          .attr("rx", h / 2);

        g.append("text")
          .attr("text-anchor", "middle")
          .attr("dy", 5)
          .text(`🧠 ${shortText(d.title, 16)}`);
      } else if (d.isHub) {
        const w = d.w || 180;
        const h = d.h || 36;
        g.append("rect")
          .attr("class", "hub-rect")
          .attr("x", -w / 2)
          .attr("y", -h / 2)
          .attr("width", w)
          .attr("height", h)
          .attr("rx", h / 2)
          .attr("stroke", d.color || "#38bdf8");

        g.append("text")
          .attr("class", "hub-label")
          .attr("text-anchor", "middle")
          .attr("dy", 4.5)
          .attr("fill", "var(--ink-primary)")
          .text(`${d.emoji || "📁"} ${d.title} (${d.count || 0})`);
      } else {
        const w = d.w || 270;
        const h = d.h || 34;
        g.append("rect")
          .attr("class", "pill-bg")
          .attr("x", -w / 2)
          .attr("y", -h / 2)
          .attr("width", w)
          .attr("height", h)
          .attr("rx", h / 2);

        g.append("circle")
          .attr("class", "concept-dot")
          .attr("cx", -w / 2 + 14)
          .attr("cy", 0)
          .attr("r", 4.5)
          .attr("fill", d.color || "#94a3b8");

        g.append("text")
          .attr("class", "concept-title")
          .attr("x", -w / 2 + 27)
          .attr("y", 4.5)
          .text(shortText(d.title, 28));

        const extraTags = (d.tags || []).filter((t) => t !== "journal").slice(1);
        if (extraTags.length > 0) {
          g.append("text")
            .attr("class", "status-badge tag-badge")
            .attr("x", w / 2 - 12)
            .attr("y", 4.5)
            .attr("text-anchor", "end")
            .attr("fill", "var(--ink-secondary, #94a3b8)")
            .text(extraTags[0]);
        } else if (d.links > 0) {
          g.append("text")
            .attr("class", "status-badge link-badge")
            .attr("x", w / 2 - 12)
            .attr("y", 4.5)
            .attr("text-anchor", "end")
            .attr("fill", "var(--accent, #38bdf8)")
            .text(`🔗${d.links}`);
        }
      }
    });

    const allNodes = nodeEnter.merge(nodeSel);

    // Update hub labels on expand/collapse
    allNodes.filter((d) => d.isHub).each(function (d) {
      const isCollapsed = collapsedHubs.has(d.id);
      const g = d3.select(this);
      g.select("rect").attr("stroke-dasharray", isCollapsed ? "4, 3" : null);
      g.select("text").text(
        isCollapsed ? `${d.emoji || "📁"} ${d.title} +${d.count || 0}` : `${d.emoji || "📁"} ${d.title} (${d.count || 0})`
      );
    });

    // Update selection and pinned state
    allNodes
      .filter((d) => d.isConcept)
      .classed("selected", (d) => d.path === selected)
      .classed("pinned", (d) => !!d.isPinned);

    // Double-click to unpin a pinned node back to default tree spot
    allNodes.on("dblclick", (event, d) => {
      event.stopPropagation();
      if (!d.isRoot && d.isPinned) {
        pinnedNodes.delete(d.id);
        d.x = d.origX;
        d.y = d.origY;
        d.isPinned = false;
        d3.select(event.currentTarget).classed("pinned", false);
        updateNodePositions();
        updateLinkPositions();
      }
    });

    // Click events
    allNodes.on("click", (event, d) => {
      event.stopPropagation();
      if (isDragging) return;
      if (d.isHub) {
        if (collapsedHubs.has(d.id)) {
          collapsedHubs.delete(d.id);
        } else {
          collapsedHubs.add(d.id);
        }
        renderGraph();
        setTimeout(() => zoomToFit(true), 150);
      } else if (d.isConcept) {
        selected = d.path;
        allNodes.filter((n) => n.isConcept).classed("selected", (n) => n.path === selected);
        applyHighlights();
        onPick(d.path);
      } else if (d.isRoot) {
        resetZoom(true);
      }
    });

    // Hover events
    allNodes
      .on("mouseenter", (event, d) => {
        hoveredId = d.id;
        applyHighlights();

        if (d.isConcept) {
          tooltip.hidden = false;
          const tagsStr = d.tags && d.tags.length
            ? `<div class="tt-tags">Tags: ${d.tags.map((t) => `<span class="badge">#${t}</span>`).join(" ")}</div>`
            : "";
          tooltip.innerHTML = `
            <div class="tt-title">${d.typeEmoji || ""} ${d.title || d.path}</div>
            <div class="tt-meta">${d.type} · ${d.matterEmoji || ""} ${d.matterLabel || ""}${d.status ? ` · ${d.status}` : ""}${d.links ? ` · ${d.links} connection${d.links === 1 ? "" : "s"}` : ""}</div>
            ${d.description ? `<div class="tt-desc" style="margin-top:4px; font-size:0.75rem; color:var(--ink-secondary); max-width:320px; line-height:1.35;">${d.description}</div>` : ""}
            ${tagsStr}
            <div class="tt-path">${d.path}</div>
            ${d.isPinned ? '<div class="tt-pinned">📌 Pinned (double-click to unpin)</div>' : ""}
          `;
          positionTooltip(event);
        } else if (d.isHub) {
          tooltip.hidden = false;
          const isCollapsed = collapsedHubs.has(d.id);
          tooltip.innerHTML = `
            <div class="tt-title">${d.emoji || "📁"} ${d.title}</div>
            <div class="tt-meta">${d.count} file${d.count === 1 ? "" : "s"} · Click to ${isCollapsed ? "expand" : "collapse"}</div>
          `;
          positionTooltip(event);
        }
      })
      .on("mousemove", (event) => {
        if (!tooltip.hidden) positionTooltip(event);
      })
      .on("mouseleave", () => {
        hoveredId = "";
        applyHighlights();
        tooltip.hidden = true;
      });

    // Canvas background click clears selection
    svg.on("click", () => {
      selected = "";
      hoveredId = "";
      allNodes.filter((n) => n.isConcept).classed("selected", false);
      applyHighlights();
    });

    updateNodePositions();
    updateLinkPositions();
    applyFilter();
    applyHighlights();
  }

  function positionTooltip(event) {
    const wrapRect = wrap.getBoundingClientRect();
    const x = event.clientX - wrapRect.left + 14;
    const y = event.clientY - wrapRect.top + 14;
    const ttRect = tooltip.getBoundingClientRect();

    let left = x;
    let top = y;
    if (left + ttRect.width > wrapRect.width - 10) left = x - ttRect.width - 24;
    if (top + ttRect.height > wrapRect.height - 10) top = y - ttRect.height - 24;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  // Persistent Sticky Dragging — Node stays permanently where dropped, never snaps back
  let isDragging = false;
  let dragStartPos = null;
  function dragstarted(event, d) {
    isDragging = false;
    dragStartPos = { x: d.x, y: d.y };
  }

  function dragged(event, d) {
    isDragging = true;
    d.x = event.x;
    d.y = event.y;
    d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
    updateLinkPositions();
  }

  function dragended(event, d) {
    if (!isDragging) return;
    d.x = event.x;
    d.y = event.y;
    d.isPinned = true;
    pinnedNodes.set(d.id, { x: d.x, y: d.y });
    d3.select(this).classed("pinned", true);
    updateNodePositions();
    updateLinkPositions();
    setTimeout(() => {
      isDragging = false;
    }, 60);
  }

  const resizeObs = new ResizeObserver(() => {
    const rect = container.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20) {
      updateLinkPositions();
      if (layoutMode === "graph") scheduleLabels();
    }
  });
  resizeObs.observe(container);

  // Theme listener to refresh colors
  const themeObserver = new MutationObserver(() => {
    renderGraph({ keepView: true });
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return {
    /**
     * @param {{ nodes?: Array<{ path: string, type?: string, title?: string }>, edges?: Array<{ from: string, to: string }> }} data
     */
    setGraph(data) {
      rawPayload = data || { nodes: [], edges: [] };
      renderGraph();
    },

    /**
     * Select node by path
     * @param {string} path
     */
    select(path) {
      selected = path || "";
      nodesLayer
        .selectAll(".node-concept, .graph-node")
        .classed("selected", (d) => d.path === selected);
      applyHighlights();
    },

    /**
     * Filter or highlight nodes by topic tag or search query.
     * @param {{ tag?: string, query?: string }} filter
     */
    setFilter(filter = {}) {
      const tagChanged = filter.tag !== undefined;
      if (tagChanged) filterTag = String(filter.tag || "").toLowerCase().trim();
      if (filter.query !== undefined) filterQuery = String(filter.query || "").toLowerCase().trim();
      applyFilter();
      if (tagChanged) frameSelection(true);
    },

    /**
     * Switch layout mode: "organic" (radial force constellation) or "tree" (columnar)
     * @param {"graph" | "organic" | "tree"} mode
     */
    setLayoutMode(mode) {
      if (mode && mode !== layoutMode) {
        layoutMode = mode;
        renderGraph();
        setTimeout(() => frameSelection(true), 150);
      }
    },

    start() {
      renderGraph();
      setTimeout(() => zoomToFit(true), 200);
    },

    stop() {
      stopForce();
    },
  };
}
