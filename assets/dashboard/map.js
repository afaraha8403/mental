const KIND_COLOR = {
  Decision: "#9ec1ff",
  Attention: "#f6c56b",
  Note: "#8fd6a8",
  Journal: "#d2a8ff",
};

/**
 * Fibonacci sphere, then a short repulsion/spring pass so linked files sit nearer.
 * @param {Array<{ path: string }>} nodes
 * @param {Array<{ from: string, to: string }>} edges
 */
export function layoutNodes(nodes, edges) {
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const pos = new Map();
  const count = nodes.length || 1;
  nodes.forEach((node, i) => {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    pos.set(node.path, {
      x: Math.cos(theta) * radius * 8,
      y: y * 6,
      z: Math.sin(theta) * radius * 8,
    });
  });
  const index = new Map(nodes.map((node, i) => [node.path, i]));
  for (let step = 0; step < 36; step++) {
    const force = nodes.map(() => ({ x: 0, y: 0, z: 0 }));
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i].path);
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j].path);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 < 0.04) dist2 = 0.04;
        const push = 0.2 / dist2;
        dx *= push;
        dy *= push;
        dz *= push;
        force[i].x += dx;
        force[i].y += dy;
        force[i].z += dz;
        force[j].x -= dx;
        force[j].y -= dy;
        force[j].z -= dz;
      }
      force[i].x -= a.x * 0.012;
      force[i].y -= a.y * 0.012;
      force[i].z -= a.z * 0.012;
    }
    for (const edge of edges) {
      const i = index.get(edge.from);
      const j = index.get(edge.to);
      if (i == null || j == null) continue;
      const a = pos.get(nodes[i].path);
      const b = pos.get(nodes[j].path);
      const dx = (b.x - a.x) * 0.02;
      const dy = (b.y - a.y) * 0.02;
      const dz = (b.z - a.z) * 0.02;
      force[i].x += dx;
      force[i].y += dy;
      force[i].z += dz;
      force[j].x -= dx;
      force[j].y -= dy;
      force[j].z -= dz;
    }
    for (let i = 0; i < nodes.length; i++) {
      const point = pos.get(nodes[i].path);
      point.x += Math.max(-0.8, Math.min(0.8, force[i].x));
      point.y += Math.max(-0.8, Math.min(0.8, force[i].y));
      point.z += Math.max(-0.8, Math.min(0.8, force[i].z));
    }
  }
  return pos;
}

/**
 * Orbit a catalog graph. Drag rotates, wheel zooms, click reports a path.
 * @param {HTMLCanvasElement} canvas
 * @param {(path: string) => void} onPick
 */
export function startMap(canvas, onPick) {
  const ctx = canvas.getContext("2d");
  let nodes = [];
  let edges = [];
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  let positions = new Map();
  let yaw = 0.4;
  let pitch = 0.3;
  let distance = 22;
  let selected = "";
  let hover = "";
  let running = false;
  let frame = 0;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {{ x: number, y: number, z: number }} point
   */
  function project(point) {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const x1 = point.x * cosY - point.z * sinY;
    const z1 = point.x * sinY + point.z * cosY;
    const y2 = point.y * cosP - z1 * sinP;
    const z2 = point.y * sinP + z1 * cosP;
    const depth = distance - z2;
    const scale = 280 / Math.max(4, depth);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.width / 2 + x1 * scale,
      y: rect.height / 2 - y2 * scale,
      depth,
      scale,
    };
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (nodes.length === 0) {
      ctx.fillStyle = getComputedStyle(canvas).color || "#9aa0a6";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("No files in this project yet.", 16, 28);
      return;
    }
    const projected = new Map();
    for (const node of nodes) {
      const point = positions.get(node.path);
      if (point) projected.set(node.path, project(point));
    }
    ctx.lineWidth = 1;
    for (const edge of edges) {
      const a = projected.get(edge.from);
      const b = projected.get(edge.to);
      if (!a || !b) continue;
      ctx.strokeStyle = "rgba(154, 160, 166, 0.45)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const ordered = [...nodes].sort((a, b) => (projected.get(b.path)?.depth || 0) - (projected.get(a.path)?.depth || 0));
    for (const node of ordered) {
      const p = projected.get(node.path);
      if (!p) continue;
      const hot = node.path === selected || node.path === hover;
      const radius = hot ? 7 : 4.5;
      ctx.beginPath();
      ctx.fillStyle = KIND_COLOR[node.type] || "#c5d0dc";
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (hot) {
        ctx.fillStyle = getComputedStyle(document.body).color || "#e8eaed";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(node.title, p.x + 10, p.y + 4);
      }
    }
  }

  function tick() {
    if (!running) return;
    if (!dragging) yaw += 0.003;
    draw();
    frame = requestAnimationFrame(tick);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  function pick(x, y) {
    let best = "";
    let bestDist = 16;
    for (const node of nodes) {
      const point = positions.get(node.path);
      if (!point) continue;
      const p = project(point);
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = node.path;
      }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    moved = false;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    if (!dragging) {
      hover = pick(ev.clientX - rect.left, ev.clientY - rect.top);
      return;
    }
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    if (Math.hypot(dx, dy) > 3) moved = true;
    yaw += dx * 0.008;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.008));
    lastX = ev.clientX;
    lastY = ev.clientY;
  });
  canvas.addEventListener("pointerup", (ev) => {
    dragging = false;
    if (moved) return;
    const rect = canvas.getBoundingClientRect();
    const path = pick(ev.clientX - rect.left, ev.clientY - rect.top);
    if (!path) return;
    selected = path;
    onPick(path);
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      distance = Math.max(10, Math.min(60, distance + ev.deltaY * 0.02));
    },
    { passive: false },
  );

  return {
    /**
     * @param {{ nodes?: Array<{ path: string, type?: string, title?: string }>, edges?: Array<{ from: string, to: string }> }} data
     */
    setGraph(data) {
      nodes = data.nodes || [];
      edges = data.edges || [];
      positions = layoutNodes(nodes, edges);
      resize();
    },
    /** @param {string} path */
    select(path) {
      selected = path;
    },
    start() {
      if (running) return;
      running = true;
      resize();
      frame = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}
