/**
 * Mental's SVG drawings on Claude Desktop: the console (pane hero, pulse
 * tiles, band strip, section heads), the inline chat card for a `mental …`
 * shell call (`ToolUse` site) and the brand logo. A native `Text` takes the
 * host's own theme, while an `Svg` has to carry both themes itself (`dual`).
 *
 * The Desktop app draws `Svg` as an image. Builders here return markup strings
 * and are pure, so tests can check escaping and size.
 */

import { clip, fitChars, wrapLines } from "./format.mjs";
import { LOGO_PNG } from "./logo.mjs";

export const SVG_MAX = 131072;
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PAD = 20;

/** @param {unknown} value */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const r1 = (n) => Math.round(n * 10) / 10;

/** The brand logo as a small SVG document (the band's and pane's one accent). */
export function logoSvg(size = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" width="${size}" height="${size}"/></svg>`;
}

/*
 * The console: the Desktop pane and band drawings. They draw no background of
 * their own, so they sit on whatever surface the host gives them, and every
 * colour comes in a light and a dark palette (`dual`). Every
 * drawing is a picture only; the controls under it are native elements,
 * because an `Svg` region cannot be clicked.
 */

/**
 * Console palettes: ink, hairlines, one teal accent, and card surfaces per theme.
 * Cards fill with `card` plus a wash of their tone (`tint` opacity) and edge in
 * that tone (`edge` opacity); the hero runs a teal wash from `heroA` to `heroB`.
 */
const CONSOLE = {
  dark: {
    ink: "#f4f4f5",
    ink2: "#d4d4d8",
    ink3: "#a1a1aa",
    ink4: "#71717a",
    line: "#ffffff",
    lineOpacity: 0.14,
    accent: "#2dd4bf",
    accentSoft: "#5eead4",
    card: "#222b2b",
    heroA: "#123c37",
    heroB: "#1f2a2a",
    tint: 0.1,
    edge: 0.4,
    emerald: "#34d399",
    amber: "#fbbf24",
    rose: "#fb7185",
    sky: "#38bdf8",
    claude: "#e8875f",
    cursor: "#d4d4d8",
    copilot: "#60a5fa",
    codex: "#34d399",
    opencode: "#f472b6",
    other: "#94a3b8",
  },
  light: {
    ink: "#18181b",
    ink2: "#3f3f46",
    ink3: "#52525b",
    ink4: "#71717a",
    line: "#18181b",
    lineOpacity: 0.12,
    accent: "#0d9488",
    accentSoft: "#0f766e",
    card: "#f5faf9",
    heroA: "#d9f2ed",
    heroB: "#f5fbfa",
    tint: 0.07,
    edge: 0.38,
    emerald: "#059669",
    amber: "#b45309",
    rose: "#e11d48",
    sky: "#0284c7",
    claude: "#c2410c",
    cursor: "#52525b",
    copilot: "#2563eb",
    codex: "#059669",
    opencode: "#db2777",
    other: "#64748b",
  },
};

/** Live console tokens. Builders read this; `dual` swaps it for each theme. */
const C = { ...CONSOLE.dark };

/** Agent names for the thread legend (keys from `agentOf`); colours come from the palette. */
export const AGENTS = {
  claude: "Claude",
  cursor: "Cursor",
  copilot: "Copilot",
  codex: "Codex",
  opencode: "OpenCode",
  other: "Other",
  unknown: "Other",
};

const agentColor = (agent) => C[agent] || C.other;
const toneColor = (tone) => ({ ok: C.emerald, warn: C.amber, danger: C.rose, accent: C.accent, info: C.sky })[tone] || C.ink3;
const KIND_COLOR = { eyes: "rose", concern: "amber", decision: "sky", direction: "accent", thread: "accent" };
const KIND_WORD = { eyes: "to check", concern: "concern", decision: "decision", direction: "direction", thread: "thread" };
const MONO = "'JetBrains Mono', 'Cascadia Code', ui-monospace, Consolas, monospace";

/**
 * Build a console drawing in both palettes inside one SVG; a colour-scheme
 * media query shows the one that matches (dark when styles are ignored).
 * @param {() => { source: string, height: number, alt: string }} build
 */
function dual(build) {
  const prev = { ...C };
  const run = (name) => {
    Object.assign(C, CONSOLE[name]);
    try {
      return build();
    } finally {
      Object.assign(C, prev);
    }
  };
  const d = run("dark");
  const l = run("light");
  const inner = (src) => src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const light = inner(l.source)
    .replace(/\bid="([^"]+)"/g, 'id="$1L"')
    .replace(/url\(#([^)]+)\)/g, "url(#$1L)");
  const source = [
    d.source.match(/^<svg[^>]*>/)[0],
    "<style>.mL{display:none}@media (prefers-color-scheme:light){.mD{display:none}.mL{display:inline}}</style>",
    `<g class="mD">${inner(d.source)}</g>`,
    `<g class="mL" display="none">${light}</g>`,
    "</svg>",
  ].join("");
  return { source, height: d.height, alt: d.alt };
}

/**
 * Pixel width for a drawing that fills a pane `columns` cells wide.
 * @param {number | undefined} columns
 */
export function widthOf(columns) {
  const c = Number(columns) || 0;
  if (!c) return 440;
  return Math.max(260, Math.min(960, Math.round((c - 4) * 7.8)));
}

/** A `<text>` in the console palette. `body` is escaped here. */
function say(x, y, body, o = {}) {
  const attrs = [
    `x="${r1(x)}"`,
    `y="${r1(y)}"`,
    `font-size="${o.size || 13}"`,
    o.weight ? `font-weight="${o.weight}"` : "",
    `fill="${o.fill || C.ink}"`,
    o.spacing ? `letter-spacing="${o.spacing}"` : "",
    o.anchor ? `text-anchor="${o.anchor}"` : "",
    o.mono ? `font-family="${MONO}"` : "",
    o.tabular ? `font-variant-numeric="tabular-nums"` : "",
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${esc(body)}</text>`;
}

const hair = (o = 1) => `stroke="${C.line}" stroke-opacity="${r1(C.lineOpacity * o * 100) / 100}"`;

/** Small caps label with a fading accent rule after it. */
function eyebrow(x, y, label, right, id) {
  const w = label.length * 7.3;
  return [
    say(x, y, label.toUpperCase(), { size: 10, weight: 650, fill: C.accent, spacing: 1.6 }),
    `<rect x="${r1(x + w + 8)}" y="${r1(y - 3.5)}" width="${r1(Math.max(0, right - x - w - 8))}" height="1" fill="url(#${id}rule)"/>`,
  ].join("");
}

/** A ring that pulses out from a dot while something is live. */
function pulseRing(cx, cy, color, to = 9) {
  return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="3.5" fill="none" stroke="${color}" stroke-width="1.5"><animate attributeName="r" values="3.5;${to}" dur="1.8s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite"/></circle>`;
}

/** The status capsule, right-aligned at `right`: an outline, a dot, a word. */
function capsule(right, cy, status, working) {
  const w = Math.round(status.label.length * 6.4 + 30);
  const x = right - w;
  const dot = toneColor(status.tone);
  return [
    `<rect x="${x + 0.5}" y="${cy - 10.5}" width="${w - 1}" height="21" rx="10.5" fill="none" ${hair(1.4)}/>`,
    working ? pulseRing(x + 13, cy, dot) : "",
    `<circle cx="${x + 13}" cy="${cy}" r="3.5" fill="${dot}"/>`,
    say(x + 22, cy + 4, status.label, { size: 11, weight: 560, fill: C.ink2 }),
  ].join("");
}

function doc(W, H, defs, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">`,
    `<defs>${defs}</defs>`,
    body,
    "</svg>",
  ].join("");
}

/** Shared gradients for a drawing: the eyebrow rule and the thread's wire. */
function strokes(id) {
  return [
    `<linearGradient id="${id}rule" x1="0" x2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="${id}hero" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${C.heroA}"/><stop offset="1" stop-color="${C.heroB}"/></linearGradient>`,
    `<linearGradient id="${id}wire" x1="0" x2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity="0.15"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0.9"/></linearGradient>`,
  ].join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (ms) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
const agoWords = (ms) => {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/**
 * The hero: project, live status, branch, where to pick up, and the thread of
 * recent hops coloured by the agent that left each one.
 * @param {ReturnType<typeof import("./model.mjs").paneModelOf>} m
 * @param {{ width: number, now: number, working?: boolean }} o
 * @returns {{ source: string, height: number, alt: string }}
 */
export function heroSvg(m, o) {
  return dual(() => heroOf(m, o));
}

function heroOf(m, { width: W, now, working = false }) {
  const id = `hero${W}`;
  const pad = W < 340 ? 14 : PAD;
  const inner = W - pad * 2;
  const h = m.header;
  const capW = Math.round(h.status.label.length * 6.4 + 30);
  const body = [
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="${pad}" y="16" width="26" height="26"/>`,
    say(pad + 36, 28, clip(h.title, fitChars(inner - capW - 44, 15)), { size: 15, weight: 650 }),
    h.meta ? say(pad + 36, 44, clip(h.meta, fitChars(inner - capW - 44, 11, true)), { size: 11, fill: C.ink3, mono: true }) : "",
    capsule(W - pad, 29, h.status, working),
  ];
  let y = 80;
  let alt = `${h.title} — ${h.status.label}.`;

  if (m.linked === false) {
    body.push(eyebrow(pad, y, "Not linked", W - pad, id));
    y += 28;
    for (const line of wrapLines(m.message, fitChars(inner, 16), 2)) {
      body.push(say(pad, y, line, { size: 16, weight: 560 }));
      y += 23;
    }
    if (m.hint) body.push(say(pad, y + 2, clip(m.hint, fitChars(inner, 12)), { size: 12, fill: C.ink3 }));
    y += 22;
    alt += ` ${m.message}`;
  } else {
    body.push(eyebrow(pad, y, "Pick up here", W - pad, id));
    y += 28;
    const text = m.resume?.text || "No resume point yet. Park when you pause and Mental keeps your place.";
    const size = W < 340 ? 15 : 16.5;
    for (const line of wrapLines(text, Math.floor(inner / (size * 0.5)), 4)) {
      body.push(say(pad, y, line, { size, weight: 560, fill: m.resume ? C.ink : C.ink3 }));
      y += size * 1.42;
    }
    if (m.resume?.detail) {
      y += 2;
      body.push(say(pad, y, clip(m.resume.detail, fitChars(inner, 12)), { size: 12, fill: C.ink3 }));
      y += 6;
    }
    alt += ` Pick up here: ${text}`;

    const hops = m.thread?.hops || [];
    if (hops.length >= 2) {
      const agents = m.thread.agents;
      const names = agents.map((a) => AGENTS[a] || AGENTS.other);
      y += 30;
      const count = `${hops.length} hops · ${agents.length} agent${agents.length === 1 ? "" : "s"}`;
      body.push(eyebrow(pad, y, "The thread", W - pad - count.length * 5.6 - 10, id));
      body.push(say(W - pad, y, count, { size: 10.5, fill: C.ink4, anchor: "end" }));
      y += 26;
      const x0 = pad + 7;
      const x1 = W - pad - 7;
      const step = (x1 - x0) / (hops.length - 1);
      body.push(`<rect x="${x0}" y="${y - 1}" width="${r1(x1 - x0)}" height="2" rx="1" fill="url(#${id}wire)"/>`);
      hops.forEach((hop, i) => {
        const cx = x0 + i * step;
        const color = agentColor(hop.agent);
        if (i === hops.length - 1) {
          body.push(pulseRing(cx, y, color, 15), `<circle cx="${r1(cx)}" cy="${y}" r="6.5" fill="${color}"/>`);
        } else {
          body.push(`<circle cx="${r1(cx)}" cy="${y}" r="${hops.length > 10 ? 3.5 : 4.5}" fill="${color}" fill-opacity="${r1(0.5 + (0.5 * i) / hops.length)}"/>`);
        }
      });
      y += 24;
      body.push(say(x0 - 4, y, dayOf(hops[0].at), { size: 10.5, fill: C.ink4 }));
      body.push(say(x1 + 4, y, agoWords(now - hops[hops.length - 1].at), { size: 10.5, weight: 600, fill: C.accent, anchor: "end" }));
      y += 22;
      let lx = pad;
      agents.forEach((a, i) => {
        const wide = 13 + names[i].length * 6.6 + 16;
        if (lx + wide > W - pad && lx > pad) {
          lx = pad;
          y += 18;
        }
        body.push(`<circle cx="${lx + 4}" cy="${y - 4}" r="4" fill="${agentColor(a)}"/>`, say(lx + 13, y, names[i], { size: 11.5, fill: C.ink2 }));
        lx += wide;
      });
      alt += ` The thread: ${hops.length} hops across ${names.join(", ")}.`;
    }
  }
  if (h.error) {
    y += 22;
    body.push(say(pad, y, clip(`△ ${h.error}`, fitChars(inner, 12)), { size: 12, fill: C.rose }));
  }
  const H = Math.round(y + 22);
  const frame = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#${id}hero)" stroke="${C.accent}" stroke-opacity="${C.edge}"/>`;
  return { source: doc(W, H, strokes(id), frame + body.join("")), height: H, alt };
}

/** A ring split into coloured arcs, one per kind; all clear draws it green. */
function ring(cx, cy, r, parts) {
  const total = parts.reduce((n, p) => n + p.n, 0);
  const circ = 2 * Math.PI * r;
  const out = [`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${hair(0.9)} stroke-width="5"/>`];
  if (!total) return out.concat(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.emerald}" stroke-width="5"/>`).join("");
  const shown = parts.filter((p) => p.n);
  const gap = shown.length > 1 ? 3 : 0;
  let at = 0;
  for (const p of shown) {
    const len = (p.n / total) * circ;
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C[p.color]}" stroke-width="5" stroke-dasharray="${r1(Math.max(0.1, len - gap))} ${r1(circ)}" stroke-dashoffset="${r1(-at)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    );
    at += len;
  }
  return out.join("");
}

/** A 270° gauge for a percentage; the track alone when unknown. */
function gauge(cx, cy, r, pct) {
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const color = pct >= 80 ? C.rose : pct >= 60 ? C.amber : C.accent;
  const fill = pct == null ? 0 : (Math.min(100, Math.max(0, pct)) / 100) * arc;
  const track = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${hair(0.9)} stroke-width="5" stroke-linecap="round" stroke-dasharray="${r1(arc)} ${r1(circ)}" transform="rotate(135 ${cx} ${cy})"/>`;
  if (!fill) return track;
  return `${track}<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${r1(fill)} ${r1(circ)}" transform="rotate(135 ${cx} ${cy})"/>`;
}

function shield(x, y) {
  return (
    `<path d="M${x} ${y - 14} l11 4 v7 c0 7 -5 12 -11 14 c-6 -2 -11 -7 -11 -14 v-7 z" fill="${C.accent}" fill-opacity="0.12" stroke="${C.accent}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M${x - 4.5} ${y - 1} l3.2 3.2 l6 -6.4" fill="none" stroke="${C.accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function bars(cx, cy, turns) {
  const n = Math.min(5, Math.max(1, turns));
  return [0.35, 0.6, 0.45, 0.8, 1]
    .map((b, i) => `<rect x="${r1(cx - 15 + i * 6.5)}" y="${r1(cy + 12 - b * 24)}" width="4" height="${r1(b * 24)}" rx="2" fill="${C.accent}" fill-opacity="${i < n ? r1(0.35 + i * 0.15) : 0.15}"/>`)
    .join("");
}

/**
 * The pulse: four tiles for what Mental is holding for this repo — what needs
 * you, the decisions in force, the context window and this session. Two
 * across in a narrow pane, four across in a wide one.
 * @param {ReturnType<typeof import("./model.mjs").paneModelOf>} m
 * @param {{ width: number, now: number }} o
 */
export function pulseSvg(m, o) {
  return dual(() => pulseOf(m, o));
}

function pulseOf(m, { width: W, now }) {
  const cols = W >= 560 ? 4 : 2;
  const gap = 10;
  const tw = (W - gap * (cols - 1)) / cols;
  const th = 86;
  const art = tw >= 140;
  const counts = { eyes: 0, concern: 0, decision: 0, direction: 0, thread: 0 };
  for (const x of m.needs.items) counts[x.kind in counts ? x.kind : "thread"] += 1;
  const breakdown = Object.entries(counts)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${KIND_WORD[k]}${n > 1 && k !== "eyes" ? "s" : ""}`)
    .slice(0, 2)
    .join(" · ");
  const st = m.stats || { turns: 0, files: 0, startedAt: now };
  const tiles = [
    {
      label: "Needs you",
      value: String(m.needs.total),
      sub: m.needs.total ? breakdown || "open items" : m.needs.later ? `all clear · ${m.needs.later} later` : "all clear",
      tone: m.needs.total ? C.rose : C.emerald,
      art: (cx, cy) => ring(cx, cy, 16, Object.entries(counts).map(([k, n]) => ({ n, color: KIND_COLOR[k] }))),
    },
    { label: "Decisions in force", value: String(m.guardrails || 0), sub: "guarding this repo", tone: C.sky, art: shield },
    {
      label: "Context",
      value: m.context == null ? "—" : `${m.context}%`,
      sub: "of the window",
      tone: (m.context || 0) >= 80 ? C.amber : C.accent,
      art: (cx, cy) => gauge(cx, cy, 16, m.context),
    },
    {
      label: "This session",
      value: String(st.turns),
      sub: `turn${st.turns === 1 ? "" : "s"} · ${st.files} file${st.files === 1 ? "" : "s"} edited`,
      art: (cx, cy) => bars(cx, cy, st.turns),
    },
  ];
  const rows = Math.ceil(tiles.length / cols);
  const H = rows * th + (rows - 1) * gap;
  const body = tiles.map((t, i) => {
    const x = (i % cols) * (tw + gap);
    const y = Math.floor(i / cols) * (th + gap);
    return [
      `<rect x="${r1(x + 0.5)}" y="${y + 0.5}" width="${r1(tw - 1)}" height="${th - 1}" rx="12" fill="${C.card}"/>`,
      `<rect x="${r1(x + 0.5)}" y="${y + 0.5}" width="${r1(tw - 1)}" height="${th - 1}" rx="12" fill="${t.tone || C.accent}" fill-opacity="${C.tint}" stroke="${t.tone || C.accent}" stroke-opacity="${C.edge}"/>`,
      say(x + 14, y + 23, clip(t.label.toUpperCase(), fitChars(tw - 28, 9.5)), { size: 9.5, weight: 650, fill: C.ink3, spacing: 1.2 }),
      say(x + 14, y + 56, t.value, { size: 26, weight: 650, tabular: true }),
      say(x + 14, y + 74, clip(t.sub, fitChars(tw - 28, 10.5)), { size: 10.5, fill: C.ink4 }),
      art ? t.art(r1(x + tw - 32), y + 48) : "",
    ].join("");
  });
  const alt = tiles.map((t) => `${t.label}: ${t.value} (${t.sub})`).join(". ");
  return { source: doc(W, H, "", body.join("")), height: H, alt };
}

/**
 * The band strip above the prompt: logo, project, live status and the resume
 * line, drawn straight onto the host's band with no fill of its own.
 * @param {ReturnType<typeof import("./model.mjs").bandModelOf>} b
 * @param {{ width: number, name?: string }} o
 */
export function bandSvg(b, o) {
  return dual(() => bandOf(b, o));
}

function bandOf(b, { width: W, name = "Mental" }) {
  const H = 24;
  const dot = toneColor(b.status.tone);
  const shown = clip(name, 20);
  const statusX = 24 + shown.length * 7.3 + 12;
  const msgX = statusX + 12 + b.status.label.length * 6.3 + 16;
  const body = [
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="0" y="4" width="16" height="16"/>`,
    say(24, 16.5, shown, { size: 12.5, weight: 650 }),
    b.working ? pulseRing(statusX + 3.5, 12, dot, 8) : "",
    `<circle cx="${r1(statusX + 3.5)}" cy="12" r="3.5" fill="${dot}"/>`,
    say(statusX + 12, 16, b.status.label, { size: 11.5, weight: 560, fill: C.ink2 }),
    `<rect x="${r1(msgX - 8)}" y="6" width="1" height="12" fill="${C.line}" fill-opacity="${C.lineOpacity * 1.5}"/>`,
    say(msgX, 16.5, clip(b.message, fitChars(W - msgX - 4, 12.5)), { size: 12.5, fill: C.ink3 }),
  ];
  return { source: doc(W, H, "", body.join("")), height: H, alt: `${name} — ${b.status.label}. ${b.message}` };
}

/**
 * A section header in the hero's voice: teal small caps, a fading rule, and an
 * optional count or note on the right.
 * @param {{ label: string, right?: string, tone?: "accent" | "rose" | "amber" | "emerald" }} h
 * @param {{ width: number }} o
 */
export function headSvg(h, o) {
  return dual(() => headOf(h, o));
}

function headOf({ label, right = "", tone = "accent" }, { width: W }) {
  const id = `head${W}${label.replace(/\W/g, "")}`;
  const H = 22;
  const end = W - (right ? right.length * 6.4 + 12 : 0);
  const body = [
    eyebrow(0, 15, label, end, id),
    right ? say(W, 15, right, { size: 11, weight: 650, fill: C[tone] || C.accent, anchor: "end" }) : "",
  ];
  return { source: doc(W, H, strokes(id), body.join("")), height: H, alt: right ? `${label} · ${right}` : label };
}

const TONE_KEY = { ok: "emerald", warn: "amber", danger: "rose", info: "sky", accent: "accent", muted: "ink4" };

/**
 * A page header for the panel's list and entry pages: an eyebrow, a large
 * title, a line under it, an optional status capsule, and an optional bar that
 * splits the page's entries by status with a legend.
 * @param {{ eyebrow: string, title: string, sub?: string, status?: { label: string, tone: string } | null, segments?: { label: string, n: number, tone: string }[] }} p
 * @param {{ width: number }} o
 */
export function pageHeadSvg(p, o) {
  return dual(() => pageHeadOf(p, o));
}

function pageHeadOf({ eyebrow: label, title, sub = "", status = null, segments = [] }, { width: W }) {
  const id = `page${W}`;
  const capW = status ? Math.round(status.label.length * 6.4 + 30) : 0;
  const body = [eyebrow(0, 14, label, W - (capW ? capW + 12 : 0), id)];
  if (status) body.push(capsule(W, 10, status, false));
  let y = 46;
  const size = W < 340 ? 19 : 22;
  for (const line of wrapLines(title, Math.floor(W / (size * 0.52)), 3)) {
    body.push(say(0, y, line, { size, weight: 680 }));
    y += size * 1.3;
  }
  if (sub) {
    body.push(say(0, y + 2, clip(sub, fitChars(W, 12)), { size: 12, fill: C.ink3 }));
    y += 20;
  }
  const total = segments.reduce((n, s) => n + s.n, 0);
  let alt = `${label}: ${title}${sub ? `. ${sub}` : ""}${status ? `. ${status.label}` : ""}`;
  if (total) {
    y += 6;
    let x = 0;
    const shown = segments.filter((s) => s.n);
    shown.forEach((s, i) => {
      const w = (s.n / total) * W - (i < shown.length - 1 ? 3 : 0);
      body.push(`<rect x="${r1(x)}" y="${y}" width="${r1(Math.max(2, w))}" height="6" rx="3" fill="${C[TONE_KEY[s.tone] || "accent"]}"/>`);
      x += w + 3;
    });
    y += 24;
    let lx = 0;
    for (const s of shown) {
      const text = `${s.label} ${s.n}`;
      const wide = 12 + text.length * 6.5 + 14;
      if (lx + wide > W && lx > 0) {
        lx = 0;
        y += 18;
      }
      body.push(`<circle cx="${lx + 4}" cy="${y - 4}" r="4" fill="${C[TONE_KEY[s.tone] || "accent"]}"/>`, `<text x="${r1(lx + 12)}" y="${r1(y)}" font-size="11.5" fill="${C.ink2}">${esc(s.label)} <tspan font-weight="650" fill="${C.ink}">${s.n}</tspan></text>`);
      lx += wide;
    }
    alt += `. ${shown.map((s) => `${s.n} ${s.label.toLowerCase()}`).join(", ")}`;
  }
  const H = Math.round(y + 10);
  return { source: doc(W, H, strokes(id), body.join("")), height: H, alt };
}

/** Card heights: one line when the summary fits beside the command, else two. */
const CARD_ONE = 32;
const CARD_TWO = 46;

/**
 * The inline chat card for a `mental …` shell call: a hairline row as wide as
 * the chat, with the command in teal mono, what it did, and a detail at the
 * right. It goes to two lines only when the summary cannot fit on one.
 * @param {NonNullable<ReturnType<typeof import("./toolcard.mjs").toolCardOf>>} m
 * @param {{ width?: number }} [o]
 * @returns {{ source: string, height: number, alt: string }}
 */
export function toolCardSvg(m, { width = 640 } = {}) {
  return dual(() => toolCardOf(m, Math.round(width)));
}

function toolCardOf(m, W) {
  const pad = 12;
  const failed = m.state === "failed";
  const running = m.state === "running";
  const labelX = pad + 22;
  const labelW = m.kind.length * 11 * 0.61;
  const right = W - pad - (running ? 18 : 0);
  const titleW = (m.title.length + 1) * 13 * 0.55;
  const detailW = m.detail ? m.detail.length * 11 * 0.61 + 12 : 0;
  const inlineX = labelX + labelW + 10;
  const one = inlineX + titleW + (detailW ? detailW + 16 : 0) <= right;
  const H = one || (!m.detail && right - inlineX >= 140) ? CARD_ONE : CARD_TWO;
  const accent = failed ? C.rose : C.accent;
  const titleFill = running ? C.ink3 : failed ? C.rose : C.ink;
  const dot = m.tone !== "accent" && !failed ? toneColor(m.tone) : "";
  const body = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" ${hair(1.3)}/>`,
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="${pad}" y="9" width="14" height="14"/>`,
    say(labelX, 20, clip(m.kind, fitChars(W - labelX - pad, 11, true)), { size: 11, weight: 600, fill: accent, mono: true }),
  ];
  const detail = (x, y, room) => {
    if (!m.detail || room < 40) return "";
    const text = clip(m.detail, fitChars(room - (dot ? 10 : 0), 11, true));
    const w = text.length * 11 * 0.61;
    const at = H === CARD_ONE ? right - w : x + (dot ? 10 : 0);
    return [dot ? `<circle cx="${r1(at - 7)}" cy="${y - 3.5}" r="3" fill="${dot}"/>` : "", say(at, y, text, { size: 11, fill: C.ink3, mono: true })].join("");
  };
  if (H === CARD_ONE) {
    const room = right - inlineX - (detailW ? Math.min(detailW, (right - inlineX) / 2) + 16 : 0);
    body.push(say(inlineX, 20.5, clip(m.title, fitChars(room, 13)), { size: 13, weight: 560, fill: titleFill }));
    body.push(detail(0, 20, Math.min(detailW, (right - inlineX) / 2)));
  } else if (right - inlineX >= 140) {
    // Title beside the command, detail under the title.
    body.push(say(inlineX, 20.5, clip(m.title, fitChars(right - inlineX, 13)), { size: 13, weight: 560, fill: titleFill }));
    body.push(detail(inlineX, 36, right - inlineX));
  } else {
    // Narrow: the command owns line one, the title takes line two.
    body.push(say(labelX, 37, clip(m.title, fitChars(right - labelX, 13)), { size: 13, weight: 560, fill: titleFill }));
  }
  if (running) body.push(pulseRing(W - pad - 6, 16, C.accent, 8), `<circle cx="${W - pad - 6}" cy="16" r="3.5" fill="${C.accent}"/>`);
  const alt = `${m.kind}: ${failed ? "failed. " : ""}${m.title}${m.detail ? `. ${m.detail}` : ""}`;
  return { source: doc(W, H, "", body.join("")), height: H, alt };
}

/**
 * The chat row as an element: one Svg as wide as the chat.
 * @param {{ Svg: Function, Box: Function }} E
 * @param {{ model: NonNullable<ReturnType<typeof import("./toolcard.mjs").toolCardOf>>, columns?: number }} ctx
 */
export function toolRowDesktop({ Svg, Box }, ctx) {
  const width = ctx.columns ? widthOf(ctx.columns) : 640;
  const built = toolCardSvg(ctx.model, { width });
  return Box({
    flexDirection: "column",
    children: [Svg({ source: built.source, alt: built.alt, width, height: built.height })],
  });
}
