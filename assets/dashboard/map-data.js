const TAG_PALETTE = [
  "#38bdf8",
  "#f59e0b",
  "#10b981",
  "#a855f7",
  "#f97316",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#ef4444",
  "#84cc16",
];

/**
 * Stable color for a topic slug so the same tag looks the same on every layout.
 * @param {string} slug
 */
export function tagColor(slug) {
  let hash = 0;
  const text = String(slug || "");
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash, 33) ^ text.charCodeAt(i);
  return TAG_PALETTE[(hash >>> 0) % TAG_PALETTE.length];
}

/**
 * Frontmatter topic slugs. The journal marker is a topic when it is present.
 * @param {{ tags?: string[] | string }} node
 */
export function topicTags(node) {
  const raw = Array.isArray(node?.tags) ? node.tags : node?.tags ? [node.tags] : [];
  /** @type {string[]} */
  const tags = [];
  for (const part of raw) {
    const slug = String(part).trim().toLowerCase();
    if (!slug || tags.includes(slug)) continue;
    tags.push(slug);
    if (tags.length === 3) break;
  }
  return tags;
}

/** Sphere / badge color for a catalog type. Matches dashboard chips. */
export const KIND_COLOR = {
  Decision: "#38bdf8", // Sky blue
  Attention: "#f59e0b", // Amber
  Note: "#10b981", // Emerald
  Journal: "#a855f7", // Purple
};

/** Metadata and emoji for each catalog type. */
export const KIND_META = {
  Decision: { emoji: "🎯", label: "Decisions", color: "#38bdf8", angle: -Math.PI / 4 },
  Attention: { emoji: "🚦", label: "Attention", color: "#f59e0b", angle: -3 * Math.PI / 4 },
  Note: { emoji: "📝", label: "Notes", color: "#10b981", angle: Math.PI / 4 },
  Journal: { emoji: "📓", label: "Journals", color: "#a855f7", angle: 3 * Math.PI / 4 },
};

/**
 * Anchor each type in its own region (for backward compatibility).
 */
export const CLUSTER = {
  Decision: { x: 140, y: 70, z: 0 },
  Attention: { x: -140, y: 70, z: 0 },
  Note: { x: 0, y: -80, z: 130 },
  Journal: { x: 0, y: -80, z: -130 },
};

/**
 * Hub layout anchors preserved for test backward compatibility.
 */
export const HUB_LAYOUT = {
  Decision: { x: 320, y: -260, dir: 1, vDir: -1 },
  Note: { x: 320, y: 260, dir: 1, vDir: 1 },
  Attention: { x: -320, y: -260, dir: -1, vDir: -1 },
  Journal: { x: -320, y: 260, dir: -1, vDir: 1 },
};

/**
 * OKF Matter Definitions: Topics, Themes, and Subjects that link documents across types.
 */
export const MATTER_DEFINITIONS = [
  { id: "track", label: "Time & Tracking", emoji: "⏱️", color: "#06b6d4", regex: /\b(track|time|clock|billable|timer|interval|unclocked|hour)\b/i },
  { id: "backup", label: "Backup & Portability", emoji: "📦", color: "#ec4899", regex: /\b(backup|restore|pack|unpack|portable|slice|copy)\b/i },
  { id: "dashboard", label: "Dashboard & Explorer", emoji: "🧭", color: "#8b5cf6", regex: /\b(dashboard|mind[ -]?map|explorer|graph|preview|canvas|3d-force)\b/i },
  { id: "plugins", label: "Plugins & Host Agents", emoji: "🔌", color: "#f97316", regex: /\b(plugin|claude|agent|opencode|cursor|host)\b/i },
  { id: "release", label: "Release & npm", emoji: "🚀", color: "#eab308", regex: /\b(release|publish|npm|version|lockstep|oidc|otp|tag)\b/i },
  { id: "sync", label: "Cross-PC Sync", emoji: "🔄", color: "#14b8a6", regex: /\b(cross-pc|live sync|syncthing)\b/i },
  { id: "doctor", label: "Doctor & Health", emoji: "🩺", color: "#10b981", regex: /\b(doctor|repair|install|uninstall|sanity|fix|exclude)\b/i },
  { id: "search", label: "Search & Retrieval", emoji: "🔍", color: "#6366f1", regex: /\b(search|query|retrieval|fts|prior-attempt)\b/i },
  { id: "receipt", label: "Formatting & Receipts", emoji: "🧾", color: "#d97706", regex: /\b(receipt|format|wrapper|ascii|bullet)\b/i },
  { id: "product", label: "Product & Identity", emoji: "🧠", color: "#a855f7", regex: /\b(slogan|brand|mark|domain|getmental)\b/i },
  { id: "cli", label: "CLI & Protocols", emoji: "⚡", color: "#3b82f6", regex: /\b(cli|heartbeat|pulse|glance|status|where|handoff|park|resume|graphify|residue)\b/i },
  { id: "journal", label: "Work Logs & Sit-downs", emoji: "📓", color: "#9333ea", regex: /\b(journal|work log|sit-down)\b/i },
];

/**
 * Resolves a document's primary OKF Matter from its frontmatter tags, path, title, or keywords.
 * @param {{ path?: string, title?: string, tags?: string[], description?: string, type?: string, against?: string, kind?: string }} node
 */
export function getConceptMatter(node) {
  // 1. Explicit tags in frontmatter (excluding generic "journal" unless it is the only one)
  const explicitTags = (Array.isArray(node.tags) ? node.tags : node.tags ? [node.tags] : [])
    .map(String)
    .filter((t) => t.toLowerCase() !== "journal");

  if (explicitTags.length > 0) {
    const tag = explicitTags[0].toLowerCase();
    const known = MATTER_DEFINITIONS.find((m) => m.id === tag);
    if (known) return known;
    return {
      id: `tag-${tag}`,
      label: tag.charAt(0).toUpperCase() + tag.slice(1),
      emoji: "🏷️",
      color: tagColor(tag),
    };
  }

  // 2. Match against domain subject matter keywords across title, description, hopSummary, path, against, kind
  const searchStr = `${node.path || ""} ${node.title || ""} ${node.description || ""} ${node.hopSummary || ""} ${node.against || ""} ${node.kind || ""}`;
  for (const m of MATTER_DEFINITIONS) {
    if (m.id === "journal") continue;
    if (m.regex.test(searchStr)) return m;
  }

  // 3. Fallback for unclassified journal entries
  if (node.type === "Journal" || (node.path && String(node.path).startsWith("journal/"))) {
    return MATTER_DEFINITIONS.find((m) => m.id === "journal") || { id: "journal", label: "Work Logs & Sit-downs", emoji: "📓", color: "#9333ea" };
  }

  // 4. Default to General & Governance
  return { id: "general", label: "General & Governance", emoji: "📋", color: "#64748b" };
}

/**
 * Node weight grows with how many catalog links touch the file.
 * An unlinked file stays at 1. A file with three links is 16. Capped so one hub cannot fill the view.
 * @param {number} degree
 */
export function nodeWeight(degree) {
  const links = Number.isFinite(degree) ? Math.max(0, degree) : 0;
  return Math.min(48, (1 + links) ** 2);
}

/**
 * Stable offset so files of one type do not start on the same point.
 * @param {string} path
 * @param {number} axis
 */
function hashJitter(path, axis) {
  let hash = axis + 1;
  const text = String(path);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash, 33) ^ text.charCodeAt(i);
  const unit = ((hash >>> 0) % 1000) / 1000;
  return (unit - 0.5) * 36;
}

/**
 * Turn the dashboard graph payload into the `{ nodes, links }` shape.
 * Preserved for test compatibility.
 * @param {{ nodes?: Array<{ path: string, type?: string, title?: string }>, edges?: Array<{ from: string, to: string }> }} payload
 */
export function toGraphData(payload) {
  const nodesIn = payload?.nodes || [];
  const edges = payload?.edges || [];
  /** @type {Map<string, number>} */
  const degree = new Map(nodesIn.map((node) => [node.path, 0]));
  /** @type {Array<{ source: string, target: string }>} */
  const links = [];
  const seen = new Set();
  for (const edge of edges) {
    if (!degree.has(edge.from) || !degree.has(edge.to) || edge.from === edge.to) continue;
    const key = `${edge.from}\0${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    links.push({ source: edge.from, target: edge.to });
  }
  const nodes = nodesIn.map((node) => {
    const home = CLUSTER[node.type] || { x: 0, y: 0, z: 0 };
    return {
      id: node.path,
      path: node.path,
      title: node.title || node.path,
      type: node.type || "",
      links: degree.get(node.path) || 0,
      weight: nodeWeight(degree.get(node.path) || 0),
      x: home.x + hashJitter(node.path, 1),
      y: home.y + hashJitter(node.path, 2),
      z: home.z + hashJitter(node.path, 3),
    };
  });
  return { nodes, links };
}

/**
 * Flat file graph for the Obsidian-style view.
 * One node per catalog file. Links are the edges already on the payload.
 * A missing tags field becomes an empty list. Hubs are not built.
 * @param {{ nodes?: Array<{ path: string, type?: string, title?: string, tags?: string[] | string }>, edges?: Array<{ from: string, to: string, rel?: string }> }} payload
 */
export function toForceGraph(payload) {
  const nodesIn = payload?.nodes || [];
  const edges = payload?.edges || [];
  const hasTopics = nodesIn.some((node) => topicTags(node).length > 0);
  /** @type {Map<string, number>} */
  const degree = new Map(nodesIn.map((node) => [node.path, 0]));
  /** @type {Array<{ id: string, source: string, target: string, rel: string }>} */
  const links = [];
  const seen = new Set();

  function addLink(source, target, rel) {
    if (!source || !target || source === target) return;
    const key = `${source}\0${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (degree.has(source)) degree.set(source, (degree.get(source) || 0) + 1);
    if (degree.has(target)) degree.set(target, (degree.get(target) || 0) + 1);
    links.push({ id: key, source, target, rel });
  }

  /** @type {Map<string, number>} */
  const tagCount = new Map();
  if (hasTopics) {
    for (const node of nodesIn) {
      for (const slug of topicTags(node)) {
        tagCount.set(slug, (tagCount.get(slug) || 0) + 1);
        addLink(node.path, `tag:${slug}`, "topic");
      }
    }
  }

  for (const edge of edges) {
    if (hasTopics && String(edge.rel || "").startsWith("tag:")) continue;
    if (!degree.has(edge.from) || !degree.has(edge.to)) continue;
    addLink(edge.from, edge.to, edge.rel || "link");
  }

  const tagList = [...tagCount.keys()];
  const ring = Math.max(520, tagList.length * 90);
  /** @type {Map<string, { x: number, y: number }>} */
  const homes = new Map();
  tagList.forEach((slug, index) => {
    const angle = (2 * Math.PI * index) / tagList.length - Math.PI / 2;
    homes.set(slug, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring });
  });

  const nodes = nodesIn.map((node) => {
    const linkCount = degree.get(node.path) || 0;
    const tags = topicTags(node);
    const home = homes.get(tags[0]) || { x: 0, y: 0 };
    return {
      id: node.path,
      path: node.path,
      title: node.title || node.path,
      type: node.type || "",
      tags,
      isTag: false,
      color: tags.length ? tagColor(tags[0]) : (KIND_COLOR[node.type] || "#38bdf8"),
      links: linkCount,
      weight: nodeWeight(linkCount),
      homeX: home.x,
      homeY: home.y,
    };
  });

  for (const slug of tagList) {
    const home = homes.get(slug);
    const count = tagCount.get(slug) || 0;
    nodes.push({
      id: `tag:${slug}`,
      path: "",
      title: slug,
      type: "tag",
      tags: [slug],
      isTag: true,
      color: tagColor(slug),
      links: count,
      weight: nodeWeight(count),
      homeX: home.x,
      homeY: home.y,
    });
  }
  return { nodes, links };
}

/**
 * Nudge overlapping node boxes apart until zero intersections remain.
 * @param {Array<{ x: number, y: number, w?: number, h?: number, isRoot?: boolean, isPinned?: boolean }>} nodes
 * @param {number} [iterations]
 */
export function resolveBoxCollisions(nodes, iterations = 16) {
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.isRoot) continue;
      const aw = (a.w || 270) / 2 + 10;
      const ah = (a.h || 34) / 2 + 8;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.isRoot) continue;
        const bw = (b.w || 270) / 2 + 10;
        const bh = (b.h || 34) / 2 + 8;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = (aw + bw) - Math.abs(dx);
        const overlapY = (ah + bh) - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const shift = (overlapX + 2) / 2;
            const sign = dx >= 0 ? 1 : -1;
            if (!a.isPinned) a.x -= sign * shift;
            if (!b.isPinned) b.x += sign * shift;
          } else {
            const shift = (overlapY + 2) / 2;
            const sign = dy >= 0 ? 1 : -1;
            if (!a.isPinned) a.y -= sign * shift;
            if (!b.isPinned) b.y += sign * shift;
          }
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Transforms a catalog graph payload into an interactive Mind Map.
 * Supports "organic" (radial force constellation) and "tree" (columnar) layouts.
 * Guarantees zero bounding-box overlaps through calculated placement with comfortable gutters.
 *
 * @param {{ nodes?: Array<{ path: string, type?: string, title?: string, status?: string, kind?: string, tags?: string[], description?: string }>, edges?: Array<{ from: string, to: string, rel?: string }> }} payload
 * @param {string} [projectName]
 * @param {Set<string> | null} [collapsedHubIds]
 * @param {"organic" | "tree"} [layoutMode]
 */
export function toMindMapGraph(payload, projectName = "Mental", collapsedHubIds = null, layoutMode = "tree") {
  const nodesIn = payload?.nodes || [];
  const edges = payload?.edges || [];

  /** @type {Map<string, number>} */
  const degree = new Map(nodesIn.map((node) => [node.path, 0]));
  for (const edge of edges) {
    if (!degree.has(edge.from) || !degree.has(edge.to) || edge.from === edge.to) continue;
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }

  // Group nodes by OKF Matter (tags / subject matter)
  const matterMap = new Map();
  for (const n of nodesIn) {
    const matter = getConceptMatter(n);
    if (!matterMap.has(matter.id)) {
      matterMap.set(matter.id, { meta: matter, items: [] });
    }
    matterMap.get(matter.id).items.push(n);
  }

  // Sort matter clusters by item count descending, and distribute evenly across Right and Left wings
  const sortedMatters = Array.from(matterMap.values()).sort((a, b) => b.items.length - a.items.length);

  const rightWing = [];
  const leftWing = [];
  let rightCount = 0;
  let leftCount = 0;

  for (const m of sortedMatters) {
    if (rightCount <= leftCount) {
      rightWing.push(m);
      rightCount += m.items.length;
    } else {
      leftWing.push(m);
      leftCount += m.items.length;
    }
  }

  const itemsPerCol = 5;
  const colStepX = 310;
  const rowStepY = 54;
  const nodeW = 270;
  const nodeH = 34;

  const isOrganic = layoutMode === "organic";

  /**
   * Layout each wing with guaranteed vertical clearance so expanded clusters never overlap.
   * Dynamically adapts to collapsed/expanded hub states for comfortable view sizing.
   * @param {Array<{ meta: any, items: any[], hubX?: number, hubY?: number, dir?: number }>} wingMatters
   * @param {number} dir
   */
  function layoutWing(wingMatters, dir) {
    const halfHeights = wingMatters.map((m) => {
      const isCollapsed = collapsedHubIds ? collapsedHubIds.has(`hub-${m.meta.id}`) : false;
      if (isCollapsed) return 22;
      const rows = Math.max(1, Math.min(itemsPerCol, m.items.length));
      return Math.max(22, ((rows - 1) * rowStepY) / 2 + nodeH / 2);
    });

    let totalH = 0;
    for (let i = 0; i < wingMatters.length; i++) {
      totalH += halfHeights[i] * 2;
      if (i > 0) {
        const prevCollapsed = collapsedHubIds ? collapsedHubIds.has(`hub-${wingMatters[i - 1].meta.id}`) : false;
        const curCollapsed = collapsedHubIds ? collapsedHubIds.has(`hub-${wingMatters[i].meta.id}`) : false;
        totalH += (prevCollapsed && curCollapsed) ? 14 : 70;
      }
    }

    let curY = -totalH / 2;
    for (let i = 0; i < wingMatters.length; i++) {
      const m = wingMatters[i];
      const hh = halfHeights[i];
      const hubY = curY + hh;
      const curCollapsed = collapsedHubIds ? collapsedHubIds.has(`hub-${m.meta.id}`) : false;
      const nextCollapsed = (i < wingMatters.length - 1 && collapsedHubIds)
        ? collapsedHubIds.has(`hub-${wingMatters[i + 1].meta.id}`)
        : false;
      curY += hh * 2 + (curCollapsed && nextCollapsed ? 14 : 70);

      m.hubX = dir * 260;
      m.hubY = hubY;
      m.dir = dir;
    }
  }

  if (isOrganic) {
    const N = sortedMatters.length || 1;
    const radiusHub = Math.max(520, N * 34);
    sortedMatters.forEach((m, idx) => {
      const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
      m.hubX = Math.round(Math.cos(angle) * (radiusHub * 1.15));
      m.hubY = Math.round(Math.sin(angle) * radiusHub);
      m.dir = Math.cos(angle) >= 0 ? 1 : -1;
      m.angle = angle;
    });
  } else {
    layoutWing(rightWing, 1);
    layoutWing(leftWing, -1);
  }

  const rootNode = {
    id: "root",
    isRoot: true,
    title: projectName || "Mental",
    type: "Project",
    totalNodes: nodesIn.length,
    radius: 30,
    w: 160,
    h: 38,
    x: 0,
    y: 0,
    origX: 0,
    origY: 0,
  };

  const hubNodes = [];
  const structuralLinks = [];
  const conceptNodes = [];

  const allActiveMatters = isOrganic ? sortedMatters : [...rightWing, ...leftWing];

  for (const m of allActiveMatters) {
    const hubId = `hub-${m.meta.id}`;
    const hubW = 180;
    const hubH = 36;

    const hubNode = {
      id: hubId,
      isHub: true,
      matterId: m.meta.id,
      type: m.meta.id,
      title: m.meta.label,
      emoji: m.meta.emoji,
      color: m.meta.color,
      count: m.items.length,
      dir: m.dir,
      x: m.hubX,
      y: m.hubY,
      origX: m.hubX,
      origY: m.hubY,
      radius: 24,
      w: hubW,
      h: hubH,
    };
    hubNodes.push(hubNode);

    // Root -> Hub link
    structuralLinks.push({
      id: `root->${hubId}`,
      source: "root",
      target: hubId,
      isRootLink: true,
      color: m.meta.color,
      dir: m.dir,
    });

    const totalInMatter = m.items.length;
    for (let i = 0; i < totalInMatter; i++) {
      const node = m.items[i];
      const deg = degree.get(node.path) || 0;
      const colIdx = Math.floor(i / itemsPerCol);
      const rowIdx = i % itemsPerCol;

      let nodeX;
      let nodeY;
      let sourceId = hubId;

      if (isOrganic) {
        const baseAngle = m.angle != null ? m.angle : 0;
        const ux = Math.cos(baseAngle);
        const uy = Math.sin(baseAngle);
        const itemsInThisCol = Math.min(itemsPerCol, totalInMatter - colIdx * itemsPerCol);
        const rowOffset = rowIdx - (itemsInThisCol - 1) / 2;
        const out = 220 + colIdx * (nodeW + 36);
        const side = rowOffset * (nodeH + 18);
        nodeX = Math.round(m.hubX + ux * out - uy * side);
        nodeY = Math.round(m.hubY + uy * out + ux * side);
      } else {
        const itemsInThisCol = Math.min(itemsPerCol, totalInMatter - colIdx * itemsPerCol);
        const colTotalHeight = (itemsInThisCol - 1) * rowStepY;
        const startY = m.hubY - colTotalHeight / 2;

        nodeX = m.hubX + m.dir * (250 + colIdx * colStepX);
        nodeY = startY + rowIdx * rowStepY;

        if (colIdx > 0) {
          const prevColItems = Math.min(itemsPerCol, totalInMatter - (colIdx - 1) * itemsPerCol);
          const parentRow = Math.min(rowIdx, prevColItems - 1);
          const parentNode = m.items[(colIdx - 1) * itemsPerCol + parentRow];
          if (parentNode) {
            sourceId = parentNode.path;
          }
        }
      }

      const typeColor = KIND_COLOR[node.type] || "#38bdf8";
      const typeMeta = KIND_META[node.type] || { emoji: "📄", label: node.type || "Note" };

      conceptNodes.push({
        id: node.path,
        path: node.path,
        isConcept: true,
        type: node.type || "Note",
        typeEmoji: typeMeta.emoji,
        typeLabel: typeMeta.label,
        title: node.title || node.path,
        status: node.status || "",
        kind: node.kind || "",
        tags: node.tags || [],
        description: node.description || "",
        matterId: m.meta.id,
        matterLabel: m.meta.label,
        matterEmoji: m.meta.emoji,
        links: deg,
        weight: nodeWeight(deg),
        color: m.meta.color,
        typeColor,
        hubId,
        colIdx,
        rowIdx,
        dir: m.dir,
        x: nodeX,
        y: nodeY,
        origX: nodeX,
        origY: nodeY,
        w: nodeW,
        h: nodeH,
      });

      structuralLinks.push({
        id: `${sourceId}->${node.path}`,
        source: sourceId,
        target: node.path,
        isStructural: true,
        color: m.meta.color,
        dir: m.dir,
      });
    }
  }

  if (isOrganic) {
    resolveBoxCollisions([...hubNodes, ...conceptNodes], 16);
    for (const n of [...hubNodes, ...conceptNodes]) {
      n.origX = n.x;
      n.origY = n.y;
    }
  }

  // Cross links: semantic OKF connections between documents across clusters
  const conceptMap = new Map(conceptNodes.map((n) => [n.path, n]));
  const crossLinks = [];
  const seenEdges = new Set();

  for (const edge of edges) {
    const srcNode = conceptMap.get(edge.from);
    const dstNode = conceptMap.get(edge.to);
    if (!srcNode || !dstNode || edge.from === edge.to) continue;

    if (edge.rel && String(edge.rel).startsWith("tag:")) continue;
    const isSameHub = srcNode.hubId === dstNode.hubId;

    const key = [edge.from, edge.to].sort().join("\0");
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    crossLinks.push({
      id: `cross-${key}`,
      source: edge.from,
      target: edge.to,
      rel: edge.rel || "link",
      isCrossLink: true,
      isSameHub,
    });
  }

  return {
    root: rootNode,
    hubs: hubNodes,
    concepts: conceptNodes,
    allNodes: [rootNode, ...hubNodes, ...conceptNodes],
    structuralLinks,
    crossLinks,
    allLinks: [...structuralLinks, ...crossLinks],
  };
}
