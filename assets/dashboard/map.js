import { d3 } from "./vendor/mind-map.js";
import { toMindMapGraph, toForceGraph } from "./map-data.js";

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
  const linksLayer = viewport.append("g").attr("class", "mind-map-links-layer");
  const crossLinksLayer = viewport.append("g").attr("class", "mind-map-cross-links-layer");
  const nodesLayer = viewport.append("g").attr("class", "mind-map-nodes-layer");

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

  // D3 Zoom configuration
  const zoom = d3
    .zoom()
    .scaleExtent([0.04, 12])
    .on("zoom", (event) => {
      zoomScale = event.transform.k;
      viewport.attr("transform", event.transform);
      nodesLayer.selectAll(".graph-label").classed("visible", (d) => d.isTag || zoomScale >= 1.15);
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

    const graphMode = layoutMode === "graph";
    for (const d of activeNodes) {
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const hw = graphMode ? (d.isTag ? 56 : 18) : (d.w || 280) / 2 + 30;
      const hh = graphMode ? (d.isTag ? 22 : 14) : (d.h || 34) / 2 + 20;
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
    const island = activeNodes.filter((node) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return false;
      if (node.isTag) return (node.tags || []).some((tag) => String(tag).toLowerCase() === filterTag);
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
    const fQuery = (filterQuery || "").toLowerCase().trim();
    const hasFilter = Boolean(filterTag || fQuery);

    if (!hasFilter) {
      nodesLayer.selectAll(".mindmap-node, .graph-node").classed("dimmed", false).classed("filter-matched", false);
      linksLayer.selectAll(".link-structural, .graph-link").classed("dimmed", false);
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

    const matchedGraphIds = new Set();
    nodesLayer.selectAll(".graph-node").each(function (d) {
      const qMatch =
        !fQuery ||
        (d.title && d.title.toLowerCase().includes(fQuery)) ||
        (d.path && d.path.toLowerCase().includes(fQuery)) ||
        (Array.isArray(d.tags) && d.tags.some((t) => String(t).toLowerCase().includes(fQuery)));
      const isMatch = matchesTag(d) && qMatch;
      if (isMatch) matchedGraphIds.add(d.id);
      d3.select(this).classed("dimmed", !isMatch).classed("filter-matched", isMatch);
    });
    linksLayer.selectAll(".graph-link").classed("dimmed", (l) => {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      return !matchedGraphIds.has(sId) && !matchedGraphIds.has(tId);
    });
  }

  function applyHighlights() {
    const activeId = hoveredId || selected;
    const allLinks = linksLayer.selectAll(".link-structural, .graph-link");
    const allCrossLinks = crossLinksLayer.selectAll(".link-cross");
    const allNodes = nodesLayer.selectAll(".mindmap-node, .graph-node");

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

  function graphRadius(linkCount) {
    const n = Number.isFinite(linkCount) ? Math.max(0, linkCount) : 0;
    return 5 + Math.min(11, n);
  }

  function graphSeed(path, axis) {
    let hash = axis + 1;
    const text = String(path);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash, 33) ^ text.charCodeAt(i);
    return ((hash >>> 0) % 1000) / 1000;
  }

  function renderForce() {
    linksLayer.selectAll(".link-structural").remove();
    crossLinksLayer.selectAll(".link-cross").remove();
    nodesLayer.selectAll(".mindmap-node").remove();
    stopForce();

    const graph = toForceGraph(rawPayload);
    if (!graph.nodes.length) {
      if (emptyOverlay) emptyOverlay.hidden = false;
      linksLayer.selectAll(".graph-link").remove();
      nodesLayer.selectAll(".graph-node").remove();
      return;
    }
    if (emptyOverlay) emptyOverlay.hidden = true;

    for (const node of graph.nodes) {
      const spread = node.isTag ? 0 : 140;
      node.x = (node.homeX || 0) + (graphSeed(node.id, 1) - 0.5) * spread;
      node.y = (node.homeY || 0) + (graphSeed(node.id, 2) - 0.5) * spread;
    }
    activeNodes = graph.nodes;

    const linkSel = linksLayer.selectAll(".graph-link").data(graph.links, (d) => d.id);
    linkSel.exit().remove();
    const linkEnter = linkSel.enter().append("line").attr("class", "graph-link");
    const allLinks = linkEnter.merge(linkSel);

    const nodeSel = nodesLayer.selectAll(".graph-node").data(graph.nodes, (d) => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter().append("g").attr("class", "graph-node");
    nodeEnter.append("circle");
    nodeEnter.append("text").attr("class", "graph-label").attr("dx", 12).attr("dy", 4);
    const allNodes = nodeEnter.merge(nodeSel);

    allNodes.classed("tag", (d) => d.isTag);
    allNodes
      .select("circle")
      .attr("r", (d) => (d.isTag ? Math.max(16, Math.min(28, 12 + Math.sqrt(d.links || 0) * 2)) : graphRadius(d.links)))
      .attr("fill", (d) => d.color || "#38bdf8");
    allNodes.select(".graph-label").text((d) => shortText(d.title, d.isTag ? 18 : 28));
    allNodes.classed("selected", (d) => d.path && d.path === selected);
    nodesLayer.selectAll(".graph-label").classed("visible", (d) => d.isTag || zoomScale >= 1.15);

    allNodes
      .on("mouseenter", (event, d) => {
        hoveredId = d.id;
        tooltip.hidden = false;
        const tagLine = d.isTag ? "Topic" : (d.tags || []).join(", ");
        tooltip.innerHTML = `<div class="tt-title">${d.title || d.path}</div><div class="tt-path">${d.path || tagLine}</div>`;
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
        allNodes.classed("selected", (n) => n.path === selected);
        applyHighlights();
        if (d.path) onPick(d.path);
      })
      .call(
        d3.drag()
          .on("start", (event, d) => {
            if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active && simulation) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    simulation = d3
      .forceSimulation(graph.nodes)
      .force(
        "link",
        d3
          .forceLink(graph.links)
          .id((d) => d.id)
          .distance((d) => (d.rel === "topic" ? 72 : 180))
          .strength((d) => {
            if (d.rel !== "topic") return 0.03;
            const source = typeof d.source === "object" ? d.source : null;
            const target = typeof d.target === "object" ? d.target : null;
            if (!source || !target) return 0.2;
            const file = source.isTag ? target : source;
            const hub = source.isTag ? source : target;
            const first = String(file.tags?.[0] || "");
            return first && String(hub.tags?.[0] || "") === first ? 0.45 : 0.02;
          }),
      )
      .force("charge", d3.forceManyBody().strength((d) => (d.isTag ? -280 : -18)).distanceMax(420))
      .force("x", d3.forceX((d) => d.homeX || 0).strength((d) => (d.isTag ? 0.6 : 0.28)))
      .force("y", d3.forceY((d) => d.homeY || 0).strength((d) => (d.isTag ? 0.6 : 0.28)))
      .force("collide", d3.forceCollide((d) => (d.isTag ? 40 : graphRadius(d.links)) + 10).iterations(2))
      .on("tick", () => {
        allLinks
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        allNodes.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
      });
    zoomToFit(false);

    applyFilter();
    applyHighlights();
  }

  function renderGraph() {
    if (layoutMode === "graph") {
      renderForce();
      return;
    }
    stopForce();
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
    }
  });
  resizeObs.observe(container);

  // Theme listener to refresh colors
  const themeObserver = new MutationObserver(() => {
    renderGraph();
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
