/**
 * Desktop views for the Claude Code panel: SVG cards in the dashboard's
 * palette (dark glass, violet glow, kind colors) plus native buttons.
 *
 * The Desktop app draws `Svg` as an image (SMIL still animates; an
 * `isInteractive` frame scrubs the embedded logo and sizes itself, so the
 * pane never uses it). Every card gets the same explicit width and its own
 * height. Builders here return markup strings and are pure, so tests can
 * check escaping, layout and size.
 */

import { ageOf, clip, clockOf, msOf, oneLine, plural, relPathOf, wrapLines } from "./format.mjs";
import { LOGO_PNG } from "./logo.mjs";
import { bandStateOf, pressureReasonOf, topFiles, PRESSURE_CONTEXT_PCT, PRESSURE_EDITS } from "./model.mjs";

/** Dashboard tokens (assets/dashboard/style.css). */
const DARK = {
  bg: "#09090b",
  surface: "#111114",
  elevated: "#18181c",
  border: "#232329",
  ink: "#ededf0",
  ink2: "#a1a1aa",
  ink3: "#6e6e78",
  violet: "#8b5cf6",
  violet2: "#a78bfa",
  lilac: "#c4b5fd",
  sky: "#38bdf8",
  amber: "#f59e0b",
  green: "#34d399",
  emerald: "#10b981",
  rose: "#fb7185",
  purple: "#a855f7",
  wash: "#ffffff",
  inkA: "#ffffff",
  inkB: "#c9c3e6",
  heroA: "#120d22",
  heroB: "#0a0910",
};

/** The same tokens for a light host (the dashboard's light theme). */
const LIGHT = {
  bg: "#fafafa",
  surface: "#ffffff",
  elevated: "#f4f4f5",
  border: "#e4e4e7",
  ink: "#18181b",
  ink2: "#52525b",
  ink3: "#71717a",
  violet: "#7c3aed",
  violet2: "#6d28d9",
  lilac: "#8b5cf6",
  sky: "#0284c7",
  amber: "#b45309",
  green: "#059669",
  emerald: "#047857",
  rose: "#e11d48",
  purple: "#9333ea",
  wash: "#18181b",
  inkA: "#18181b",
  inkB: "#6d28d9",
  heroA: "#f5f0ff",
  heroB: "#ece8fb",
};

export const PALETTES = { dark: DARK, light: LIGHT };

/** Live tokens. Builders read this; `themed` swaps it for one build. */
export const T = { ...DARK };

/**
 * Build a card in one theme, or in both when the host's theme is unknown: the
 * two drawings share one SVG and a media query shows the one that matches
 * (dark is what shows when styles are ignored).
 * @param {() => { source: string, height: number, alt: string } | null} build
 * @param {"dark" | "light" | "auto"} [theme]
 */
export function themed(build, theme = "auto") {
  const run = (name) => {
    const prev = { ...T };
    Object.assign(T, PALETTES[name]);
    try {
      return build();
    } finally {
      Object.assign(T, prev);
    }
  };
  if (theme === "dark" || theme === "light") return run(theme);
  const d = run("dark");
  const l = run("light");
  if (!d || !l) return d || l;
  const inner = (src) => src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const head = d.source.match(/^<svg[^>]*>/)[0];
  const light = inner(l.source)
    .replace(/\bid="([^"]+)"/g, 'id="$1L"')
    .replace(/url\(#([^)]+)\)/g, "url(#$1L)");
  const source = [
    head,
    "<style>.mL{display:none}@media (prefers-color-scheme:light){.mD{display:none}.mL{display:inline}}</style>",
    `<g class="mD">${inner(d.source)}</g>`,
    `<g class="mL" display="none">${light}</g>`,
    "</svg>",
  ].join("");
  return { source, height: d.height, alt: d.alt };
}

export const SVG_MAX = 131072;
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace";
const PAD = 20;
const MAX_ITEMS = 6;

const toneOf = (tone) =>
  ({ violet: T.violet2, purple: T.purple, sky: T.sky, amber: T.amber, green: T.emerald, zinc: T.ink2 })[tone];
const KIND_LABEL = {
  thread: "Open thread",
  concern: "Concern",
  verify: "Verify",
  direction: "Direction",
};

/** @param {unknown} value */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Characters of `size`px text that fit in `px` (rough; no font metrics here). */
export function fitChars(px, size, mono = false) {
  return Math.max(4, Math.floor(px / (size * (mono ? 0.61 : 0.55))));
}

/** Card width in CSS px from the pane's column count (the slot shrinks it further if needed). */
export function widthOf(columns) {
  const c = Number(columns) || 0;
  if (!c) return 440;
  return Math.max(340, Math.min(500, Math.round(c * 7.4)));
}

/** "just now" / "5m ago". */
function agoOf(ms) {
  const a = ageOf(ms);
  return !a ? "" : a === "now" ? "just now" : `${a} ago`;
}

/** @param {number} n */
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {number} x
 * @param {number} y
 * @param {string} body already-escaped text or tspans
 * @param {{ size?: number, weight?: number, fill?: string, anchor?: string, mono?: boolean, spacing?: number, opacity?: number }} [o]
 */
function txt(x, y, body, o = {}) {
  const attrs = [
    `x="${r1(x)}"`,
    `y="${r1(y)}"`,
    `font-size="${o.size || 13}"`,
    o.weight ? `font-weight="${o.weight}"` : "",
    `fill="${o.fill || T.ink}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : "",
    o.mono ? `font-family="${MONO}"` : "",
    o.spacing ? `letter-spacing="${o.spacing}"` : "",
    o.opacity != null ? `opacity="${o.opacity}"` : "",
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${body}</text>`;
}

/** An uppercase eyebrow label. */
function eyebrow(x, y, label, fill = T.ink3) {
  return txt(x, y, esc(label.toUpperCase()), { size: 10, weight: 650, fill, spacing: 1.3 });
}

/**
 * Wrap the parts in an `<svg>` document with the card chrome.
 * @param {{ id: string, width: number, height: number, body: string[], defs?: string[], hero?: boolean }} o
 */
function card({ id, width: W, height: H, body, defs = [], hero = false }) {
  const radius = hero ? 18 : 16;
  const chrome = hero
    ? [
        `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/>`,
        `<rect width="${W}" height="${H}" fill="url(#${id}dots)"/>`,
        `<ellipse cx="${r1(W * 0.86)}" cy="0" rx="${r1(W * 0.62)}" ry="${r1(Math.max(140, H * 0.8))}" fill="url(#${id}glow)"><animateTransform attributeName="transform" type="translate" values="0 0;-26 18;0 0" dur="16s" repeatCount="indefinite"/></ellipse>`,
        `<ellipse cx="${r1(W * 0.08)}" cy="${H}" rx="${r1(W * 0.5)}" ry="${r1(Math.max(110, H * 0.55))}" fill="url(#${id}glow2)"><animateTransform attributeName="transform" type="translate" values="0 0;20 -12;0 0" dur="19s" repeatCount="indefinite"/></ellipse>`,
      ]
    : [`<rect width="${W}" height="${H}" fill="${T.surface}"/>`];
  const heroDefs = hero
    ? [
        `<linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.heroA}"/><stop offset="1" stop-color="${T.heroB}"/></linearGradient>`,
        `<pattern id="${id}dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="${T.wash}" fill-opacity="0.07"/></pattern>`,
        `<radialGradient id="${id}glow"><stop offset="0" stop-color="${T.violet}" stop-opacity="0.42"/><stop offset="1" stop-color="${T.violet}" stop-opacity="0"/></radialGradient>`,
        `<radialGradient id="${id}glow2"><stop offset="0" stop-color="${T.sky}" stop-opacity="0.16"/><stop offset="1" stop-color="${T.sky}" stop-opacity="0"/></radialGradient>`,
        `<linearGradient id="${id}ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${T.inkA}"/><stop offset="1" stop-color="${T.inkB}"/></linearGradient>`,
      ]
    : [];
  const stroke = hero ? `stroke="${T.violet}" stroke-opacity="0.3"` : `stroke="${T.border}"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">`,
    `<defs><clipPath id="${id}clip"><rect width="${W}" height="${H}" rx="${radius}"/></clipPath>${heroDefs.join("")}${defs.join("")}</defs>`,
    `<g clip-path="url(#${id}clip)">${chrome.join("")}</g>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${radius - 0.5}" fill="none" ${stroke}/>`,
    ...body,
    "</svg>",
  ].join("");
}

/**
 * Live status of the session: label, color, and whether it pulses.
 * @returns {{ state: string, label: string, color: string, pulse: boolean }}
 */
export function statusOf(vm, s, now) {
  const state = bandStateOf(vm, s, now);
  switch (state) {
    case "compacting":
      return { state, label: "Compacting", color: T.violet2, pulse: true };
    case "receipt":
      return { state, label: s.receipt.label, color: toneOf(s.receipt.tone) || T.violet2, pulse: false };
    case "loading":
      return { state, label: "Reading", color: T.ink3, pulse: true };
    case "absent":
      return { state, label: "Not linked", color: T.ink3, pulse: false };
    case "pressure":
      return { state, label: "Hand off soon", color: T.amber, pulse: true };
    case "working":
      return { state, label: "Working", color: T.green, pulse: true };
    case "fresh":
      return { state, label: "Fresh handoff", color: T.violet2, pulse: false };
    default:
      return { state, label: "Idle", color: T.ink2, pulse: false };
  }
}

/** A status pill, right-aligned at `right`. */
function pill(right, cy, st) {
  const w = Math.round(st.label.length * 6.6 + 30);
  const x = right - w;
  const dot = x + 13;
  const pulse = st.pulse
    ? `<circle cx="${dot}" cy="${cy}" r="3.5" fill="none" stroke="${st.color}" stroke-width="1.5"><animate attributeName="r" values="3.5;9" dur="1.6s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite"/></circle>`
    : "";
  return [
    `<rect x="${x}" y="${cy - 11}" width="${w}" height="22" rx="11" fill="${st.color}" fill-opacity="0.12" stroke="${st.color}" stroke-opacity="0.35"/>`,
    pulse,
    `<circle cx="${dot}" cy="${cy}" r="3.5" fill="${st.color}"/>`,
    txt(x + 22, cy + 4, esc(st.label), { size: 11.5, weight: 600, fill: st.color }),
  ].join("");
}

/** Git branch glyph at (x, y) baseline-ish. */
function branchGlyph(x, y, color) {
  return `<g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"><circle cx="${x + 3}" cy="${y - 9}" r="1.8"/><circle cx="${x + 3}" cy="${y + 1}" r="1.8"/><circle cx="${x + 10}" cy="${y - 6}" r="1.8"/><path d="M${x + 3} ${y - 7.2}V${y - 0.8}M${x + 10} ${y - 4.2}c0 3-3 3.4-6.2 4.4"/></g>`;
}

/**
 * Hero: logo, live status, the resume point, last outcome, git.
 * @returns {{ source: string, height: number, alt: string }}
 */
export function heroSvg({ vm, s, now, width: W, error = "", updatedAt = null }) {
  const id = "h";
  const inner = W - PAD * 2;
  const st = statusOf(vm, s, now);
  const body = [
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="${PAD}" y="17" width="26" height="26"/>`,
    txt(PAD + 34, 35, "Mental", { size: 15.5, weight: 680, fill: T.ink, spacing: -0.2 }),
    pill(W - PAD, 30, st),
  ];
  let y = 72;
  let alt = `Mental — ${st.label}.`;

  if (!vm) {
    body.push(eyebrow(PAD, y, "Resume point", T.lilac));
    for (let i = 0; i < 3; i++) {
      const w = inner * [0.92, 0.78, 0.5][i];
      body.push(
        `<rect x="${PAD}" y="${y + 14 + i * 24}" width="${r1(w)}" height="13" rx="6.5" fill="${T.wash}" fill-opacity="0.06"><animate attributeName="fill-opacity" values="0.04;0.11;0.04" dur="1.6s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
      );
    }
    y += 14 + 3 * 24;
    alt += " Reading the thread.";
  } else if (!vm.linked) {
    body.push(eyebrow(PAD, y, "Not linked", T.lilac));
    y += 28;
    for (const line of wrapLines("This folder has no Mental thread yet.", fitChars(inner, 18), 2)) {
      body.push(txt(PAD, y, esc(line), { size: 18, weight: 620, fill: `url(#${id}ink)` }));
      y += 25;
    }
    const hint = error ? `Heartbeat failed: ${error}` : "Ask the agent to link it, or run  mental link";
    for (const line of wrapLines(hint, fitChars(inner, 12.5), 2)) {
      y += 4;
      body.push(txt(PAD, y, esc(line), { size: 12.5, fill: T.ink2 }));
      y += 14;
    }
    alt += " This folder is not linked to Mental.";
  } else {
    const meta = [vm.handoffAge != null ? agoOf(vm.handoffAge) : "", vm.via ? `via ${vm.via}` : ""]
      .filter(Boolean)
      .join("  ·  ");
    body.push(
      txt(
        PAD,
        y,
        `<tspan fill="${T.lilac}" font-weight="650" letter-spacing="1.3">RESUME POINT</tspan>${meta ? `<tspan fill="${T.ink3}" font-weight="500" letter-spacing="0.2">   ${esc(meta)}</tspan>` : ""}`,
        { size: 10 },
      ),
    );
    y += 30;
    const resume = vm.resume || "No resume point yet — park the session to leave one.";
    const lines = wrapLines(resume, fitChars(inner, 18), 5);
    for (const line of lines) {
      body.push(
        txt(PAD, y, esc(line), {
          size: 18,
          weight: 620,
          fill: vm.resume ? `url(#${id}ink)` : T.ink2,
          spacing: -0.2,
        }),
      );
      y += 25;
    }
    alt += ` Resume point: ${vm.resume || "none"}.`;
    if (vm.outcome) {
      y += 4;
      const out = wrapLines(vm.outcome, fitChars(inner - 16, 12.5), 2);
      out.forEach((line, i) => {
        body.push(txt(PAD, y, i === 0 ? "↳" : "", { size: 12.5, fill: T.violet2 }));
        body.push(txt(PAD + 16, y, esc(line), { size: 12.5, fill: T.ink2 }));
        y += 17;
      });
      alt += ` Last outcome: ${vm.outcome}.`;
    }
    y += 10;
    body.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${T.wash}" stroke-opacity="0.07"/>`);
    y += 24;
    // Git foot: branch · changed files · when Mental last read the thread.
    const right = updatedAt ? `↻ ${agoOf(now - updatedAt)}` : "";
    const rightW = right ? right.length * 6.4 + 8 : 0;
    const dirtyText = vm.dirty ? `${vm.changed || ""} changed`.trim() : "clean";
    const dirtyW = dirtyText.length * 6.6 + 18;
    const branchChars = fitChars(inner - 18 - dirtyW - rightW - 12, 11.5, true);
    body.push(branchGlyph(PAD, y, T.ink3));
    body.push(txt(PAD + 18, y, esc(clip(vm.branch || "no branch", branchChars)), { size: 11.5, fill: T.ink2, mono: true }));
    const branchEnd = PAD + 18 + Math.min((vm.branch || "no branch").length, branchChars) * 11.5 * 0.61 + 14;
    body.push(`<circle cx="${r1(branchEnd + 3)}" cy="${y - 4}" r="3" fill="${vm.dirty ? T.amber : T.emerald}"/>`);
    body.push(txt(branchEnd + 11, y, esc(dirtyText), { size: 11.5, fill: T.ink3 }));
    if (right) {
      body.push(
        txt(W - PAD, y, esc(right), {
          size: 11.5,
          fill: T.ink3,
          anchor: "end",
        }),
      );
    }
    y += 4;
    alt += ` Branch ${vm.branch || "none"}, ${dirtyText}.`;
  }
  const height = Math.round(y + PAD);
  return { source: card({ id, width: W, height, body, hero: true }), height, alt };
}

/** Context ring: arc over a track, percent in the middle. */
function ring(cx, cy, r, pct) {
  const p = pct == null || !Number.isFinite(pct) ? null : Math.max(0, Math.min(100, pct));
  const color = p == null ? T.ink3 : p >= 90 ? T.rose : p >= PRESSURE_CONTEXT_PCT ? T.amber : T.violet2;
  const c = 2 * Math.PI * r;
  const arc =
    p == null
      ? ""
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${r1((c * p) / 100)} ${r1(c)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${T.border}" stroke-width="6"/>`,
    arc,
    txt(cx, cy + 2, p == null ? "—" : `${Math.round(p)}%`, { size: 14, weight: 680, fill: T.ink, anchor: "middle" }),
    txt(cx, cy + 15, "CONTEXT", { size: 7.5, weight: 650, fill: T.ink3, anchor: "middle", spacing: 0.9 }),
  ].join("");
}

/**
 * This session: elapsed, turns, files touched, context ring, edits per turn.
 * @returns {{ source: string, height: number, alt: string }}
 */
export function sessionSvg({ s, now, width: W }) {
  const id = "s";
  const inner = W - PAD * 2;
  const started = new Date(s.startedAt);
  const since = `since ${started.getHours()}:${String(started.getMinutes()).padStart(2, "0")}`;
  const body = [eyebrow(PAD, 30, "This session"), txt(W - PAD, 30, esc(since), { size: 11, fill: T.ink3, anchor: "end" })];
  const ringR = 27;
  const ringCx = W - PAD - ringR - 3;
  const tilesW = inner - ringR * 2 - 22;
  const tiles = [
    { value: clockOf(now - s.startedAt), label: "Elapsed" },
    { value: String(s.turns + (s.working ? 1 : 0)), label: s.working ? "Turn now" : s.turns === 1 ? "Turn" : "Turns" },
    { value: String(s.files.size), label: s.files.size === 1 ? "File" : "Files", sub: s.edits ? plural(s.edits, "edit") : "" },
  ];
  const tw = tilesW / tiles.length;
  tiles.forEach((t, i) => {
    const x = PAD + i * tw;
    if (i > 0) body.push(`<line x1="${r1(x - 8)}" y1="54" x2="${r1(x - 8)}" y2="90" stroke="${T.border}"/>`);
    body.push(txt(x, 78, esc(t.value), { size: 24, weight: 660, fill: T.ink, spacing: -0.5 }));
    body.push(txt(x, 96, esc(t.label.toUpperCase()), { size: 9, weight: 650, fill: T.ink3, spacing: 1 }));
  });
  body.push(ring(ringCx, 74, ringR, s.context?.percent));
  let y = 122;
  const bars = s.perTurn.slice(-28);
  const live = s.working ? s.editsThisTurn : null;
  if (bars.length || live != null) {
    body.push(eyebrow(PAD, y, "Edits per turn"));
    const all = live != null ? [...bars, live] : bars;
    const max = Math.max(1, ...all);
    const n = Math.max(all.length, 12);
    const step = inner / n;
    const bw = Math.max(3, step * 0.62);
    const base = y + 40;
    all.forEach((v, i) => {
      const h = Math.max(2, (v / max) * 28);
      const isLive = live != null && i === all.length - 1;
      const x = PAD + i * step;
      const op = isLive ? 1 : 0.35 + 0.65 * ((i + 1) / all.length);
      body.push(
        `<rect x="${r1(x)}" y="${r1(base - h)}" width="${r1(bw)}" height="${r1(h)}" rx="1.5" fill="${isLive ? T.green : T.violet2}" fill-opacity="${r1(op * 10) / 10}">${isLive ? `<animate attributeName="fill-opacity" values="1;0.45;1" dur="1.4s" repeatCount="indefinite"/>` : ""}</rect>`,
      );
    });
    body.push(`<line x1="${PAD}" y1="${base + 0.5}" x2="${W - PAD}" y2="${base + 0.5}" stroke="${T.border}"/>`);
    y = base + 6;
  } else {
    body.push(txt(PAD, y, "Edits per turn show up here as turns finish.", { size: 12, fill: T.ink3 }));
    y += 4;
  }
  const pressured = (s.context?.percent ?? 0) >= PRESSURE_CONTEXT_PCT || s.edits >= PRESSURE_EDITS;
  if (pressured) {
    y += 14;
    body.push(
      `<rect x="${PAD}" y="${y}" width="${inner}" height="30" rx="9" fill="${T.amber}" fill-opacity="0.1" stroke="${T.amber}" stroke-opacity="0.3"/>`,
    );
    body.push(
      txt(PAD + 12, y + 19.5, esc(`△  ${clip(pressureReasonOf(s), fitChars(inner - 36, 12))}`), {
        size: 12,
        weight: 560,
        fill: T.amber,
      }),
    );
    y += 30;
  }
  const height = Math.round(y + PAD - 4);
  const ctx = s.context?.percent;
  const alt = `This session: ${clockOf(now - s.startedAt)} elapsed, ${plural(s.turns, "turn")}, ${plural(s.files.size, "file")} touched${ctx != null ? `, context ${Math.round(ctx)}%` : ""}.`;
  return { source: card({ id, width: W, height, body }), height, alt };
}

/**
 * Items that need the user: needs-eyes, open attention, open decisions.
 * @returns {{ items: { kind: string, label: string, color: string, title: string, at: number | null }[], later: number }}
 */
export function needsOf(vm) {
  if (!vm?.linked) return { items: [], later: 0 };
  const titleOf = (x) => oneLine(x?.title || x?.question || x?.description || x?.file || "");
  const items = [
    ...(vm.needsEyes || []).map((x) => ({ kind: "eyes", label: "Needs eyes", color: T.rose, title: titleOf(x), at: msOf(x?.timestamp) })),
    ...(vm.attention || [])
      .filter((x) => x?.status !== "later")
      .map((x) => ({
        kind: x?.kind || "thread",
        label: KIND_LABEL[x?.kind] || "Attention",
        color: T.amber,
        title: titleOf(x),
        at: msOf(x?.timestamp),
      })),
    ...(vm.decisions || []).map((x) => ({ kind: "decision", label: "Open decision", color: T.sky, title: titleOf(x), at: msOf(x?.timestamp) })),
  ].filter((x) => x.title);
  const later = (vm.attention || []).filter((x) => x?.status === "later").length;
  return { items, later: Math.max(later, Number(vm.laterCount) || 0) };
}

/**
 * The "Needs you" card.
 * @returns {{ source: string, height: number, alt: string }}
 */
export function needsSvg({ vm, now, width: W }) {
  const id = "n";
  const inner = W - PAD * 2;
  const { items, later } = needsOf(vm);
  const body = [eyebrow(PAD, 30, "Needs you")];
  if (items.length) {
    const n = String(items.length);
    body.push(`<rect x="${PAD + 74}" y="19" width="${10 + n.length * 7}" height="16" rx="8" fill="${T.amber}" fill-opacity="0.16"/>`);
    body.push(txt(PAD + 79 + n.length * 3.5, 31, n, { size: 10.5, weight: 700, fill: T.amber, anchor: "middle" }));
  }
  if (later) body.push(txt(W - PAD, 30, esc(`${later} parked for later`), { size: 11, fill: T.ink3, anchor: "end" }));
  let y = 46;
  if (!items.length) {
    y += 8;
    body.push(`<circle cx="${PAD + 14}" cy="${y + 14}" r="14" fill="${T.emerald}" fill-opacity="0.14"/>`);
    body.push(
      `<path d="M${PAD + 8} ${y + 14.5}l4 4 8-8.5" fill="none" stroke="${T.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    body.push(txt(PAD + 38, y + 11, "All clear", { size: 14, weight: 620, fill: T.ink }));
    body.push(txt(PAD + 38, y + 28, "No open threads or decisions are waiting on you.", { size: 12, fill: T.ink3 }));
    y += 36;
  } else {
    items.slice(0, MAX_ITEMS).forEach((it, i) => {
      const top = y;
      const age = it.at != null ? ageOf(now - it.at) : "";
      const lines = wrapLines(it.title, fitChars(inner - 14, 13.5), 2);
      const h = 18 + lines.length * 19 + 10;
      if (i > 0) body.push(`<line x1="${PAD}" y1="${top}" x2="${W - PAD}" y2="${top}" stroke="${T.border}"/>`);
      body.push(`<g><title>${esc(`${it.label}: ${it.title}`)}</title>`);
      body.push(`<rect x="${PAD}" y="${top + 12}" width="3" height="${h - 22}" rx="1.5" fill="${it.color}"/>`);
      body.push(txt(PAD + 14, top + 24, esc(it.label.toUpperCase()), { size: 9.5, weight: 700, fill: it.color, spacing: 1.1 }));
      if (age) body.push(txt(W - PAD, top + 24, esc(age), { size: 11, fill: T.ink3, anchor: "end" }));
      lines.forEach((line, j) => {
        body.push(txt(PAD + 14, top + 43 + j * 19, esc(line), { size: 13.5, weight: 520, fill: T.ink }));
      });
      body.push("</g>");
      y = top + h;
    });
    if (items.length > MAX_ITEMS) {
      y += 18;
      body.push(txt(PAD + 14, y, esc(`+ ${items.length - MAX_ITEMS} more`), { size: 12, fill: T.ink3 }));
    }
  }
  const height = Math.round(y + PAD - 2);
  const alt = items.length
    ? `Needs you: ${items
        .slice(0, MAX_ITEMS)
        .map((x) => `${x.label} — ${x.title}`)
        .join("; ")}.`
    : "Needs you: all clear.";
  return { source: card({ id, width: W, height, body }), height, alt };
}

/**
 * Files edited this session, with edit-count bars.
 * @returns {{ source: string, height: number, alt: string } | null}
 */
export function filesSvg({ s, cwd, width: W }) {
  if (!s.files.size) return null;
  const id = "f";
  const inner = W - PAD * 2;
  const files = topFiles(s, 5);
  const max = Math.max(1, ...files.map((f) => f.count));
  const body = [
    eyebrow(PAD, 30, "Touched this session"),
    txt(W - PAD, 30, esc(`${plural(s.files.size, "file")} · ${plural(s.edits, "edit")}`), { size: 11, fill: T.ink3, anchor: "end" }),
  ];
  const barW = Math.min(90, inner * 0.24);
  const nameW = inner - barW - 34;
  let y = 56;
  for (const f of files) {
    const rel = relPathOf(f.path, cwd);
    const cut = rel.lastIndexOf("/");
    const name = cut >= 0 ? rel.slice(cut + 1) : rel;
    const dir = cut >= 0 ? rel.slice(0, cut + 1) : "";
    const nameChars = fitChars(nameW, 12, true);
    const shownName = clip(name, nameChars);
    const dirChars = Math.max(0, nameChars - shownName.length - 1);
    body.push(`<g><title>${esc(rel)}</title>`);
    body.push(
      txt(
        PAD,
        y,
        `${dir && dirChars > 3 ? `<tspan fill="${T.ink3}">${esc(clip(dir, dirChars))}</tspan>` : ""}<tspan fill="${T.ink}">${esc(shownName)}</tspan>`,
        { size: 12, mono: true },
      ),
    );
    const bx = W - PAD - barW - 24;
    body.push(`<rect x="${r1(bx)}" y="${y - 7}" width="${r1(barW)}" height="5" rx="2.5" fill="${T.border}"/>`);
    body.push(`<rect x="${r1(bx)}" y="${y - 7}" width="${r1(Math.max(5, (barW * f.count) / max))}" height="5" rx="2.5" fill="${T.violet2}"/>`);
    body.push(txt(W - PAD, y, String(f.count), { size: 11.5, weight: 600, fill: T.ink2, anchor: "end", mono: true }));
    body.push("</g>");
    y += 24;
  }
  if (s.files.size > files.length) {
    body.push(txt(PAD, y, esc(`+ ${s.files.size - files.length} more`), { size: 11.5, fill: T.ink3 }));
    y += 16;
  }
  const height = Math.round(y + PAD - 12);
  const alt = `Touched this session: ${files.map((f) => `${relPathOf(f.path, cwd)} (${f.count})`).join(", ")}.`;
  return { source: card({ id, width: W, height, body }), height, alt };
}

/**
 * What Mental recorded during this session (receipts), newest first.
 * @returns {{ source: string, height: number, alt: string } | null}
 */
export function activitySvg({ log, now, width: W }) {
  if (!log?.length) return null;
  const id = "a";
  const inner = W - PAD * 2;
  const rows = [...log].reverse().slice(0, 5);
  const body = [eyebrow(PAD, 30, "Recorded in Mental")];
  let y = 56;
  rows.forEach((r, i) => {
    const color = toneOf(r.tone) || T.violet2;
    if (i < rows.length - 1) body.push(`<line x1="${PAD + 4}" y1="${y + 4}" x2="${PAD + 4}" y2="${y + 20}" stroke="${T.border}" stroke-width="1.5"/>`);
    body.push(`<circle cx="${PAD + 4}" cy="${y - 4}" r="4" fill="${color}"/>`);
    const label = r.label;
    const age = ageOf(now - r.at);
    body.push(txt(PAD + 16, y, esc(label), { size: 12.5, weight: 640, fill: color }));
    const titleX = PAD + 16 + label.length * 7.2 + 8;
    const chars = fitChars(W - PAD - titleX - age.length * 7 - 8, 12.5);
    if (r.title) body.push(txt(titleX, y, esc(clip(r.title, chars)), { size: 12.5, fill: T.ink2 }));
    body.push(txt(W - PAD, y, esc(age), { size: 11, fill: T.ink3, anchor: "end" }));
    y += 24;
  });
  void inner;
  const height = Math.round(y + PAD - 12);
  const alt = `Recorded in Mental this session: ${rows.map((r) => `${r.label}${r.title ? ` — ${r.title}` : ""}`).join("; ")}.`;
  return { source: card({ id, width: W, height, body }), height, alt };
}

/**
 * Guardrails: decided rules the work should honor.
 * @returns {{ source: string, height: number, alt: string } | null}
 */
export function guardrailsSvg({ vm, width: W }) {
  const list = vm?.linked ? (vm.guardrails || []).filter((g) => g?.title) : [];
  if (!list.length) return null;
  const id = "g";
  const inner = W - PAD * 2;
  const shown = list.slice(0, 3);
  const total = Math.max(list.length, Number(vm.guardrailCount) || 0);
  const body = [eyebrow(PAD, 30, "Guardrails"), txt(W - PAD, 30, esc(`${total} decided`), { size: 11, fill: T.ink3, anchor: "end" })];
  let y = 54;
  for (const g of shown) {
    body.push(`<g><title>${esc(g.title)}</title>`);
    body.push(`<rect x="${PAD + 1}" y="${y - 9}" width="7" height="7" rx="1.5" transform="rotate(45 ${PAD + 4.5} ${y - 5.5})" fill="none" stroke="${T.sky}" stroke-width="1.4"/>`);
    body.push(txt(PAD + 16, y, esc(clip(g.title, fitChars(inner - 16, 12.5))), { size: 12.5, fill: T.ink2 }));
    body.push("</g>");
    y += 22;
  }
  const height = Math.round(y + PAD - 10);
  const alt = `Guardrails: ${shown.map((g) => g.title).join("; ")}.`;
  return { source: card({ id, width: W, height, body }), height, alt };
}

/** "14:05" in local time. */
function hhmm(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Time tracking (Mental Track), only when the project turned it on: the
 * focused clock, where it sits in today, and whether it needs a hand.
 * @returns {{ source: string, height: number, alt: string } | null}
 */
export function trackSvg({ vm, now, width: W }) {
  const t = vm?.linked ? vm.track : null;
  if (!t) return null;
  const id = "t";
  const inner = W - PAD * 2;
  const running = t.startedAt != null && t.runningCount > 0;
  const stale = running && (t.stale || t.staleCount > 0);
  const st = stale
    ? { label: "Looks stale", color: T.amber, pulse: false }
    : running
      ? { label: "Clock running", color: T.green, pulse: true }
      : t.unclocked
        ? { label: "Unclocked today", color: T.amber, pulse: false }
        : { label: "No clock", color: T.ink3, pulse: false };
  const body = [eyebrow(PAD, 30, "Time tracking"), pill(W - PAD, 26, st)];
  const elapsed = running ? now - t.startedAt : 0;
  const big = running ? clockOf(elapsed) : "0:00";
  body.push(
    txt(PAD, 84, esc(big), {
      size: 38,
      weight: 680,
      fill: running ? `url(#${id}ink)` : T.ink3,
      spacing: -1,
    }),
  );
  const bigW = big.length * 38 * 0.56;
  body.push(txt(PAD + bigW + 8, 84, running ? "h:mm" : "", { size: 11, weight: 600, fill: T.ink3, spacing: 0.6 }));
  let sub = "";
  if (stale) sub = "No activity for a while. Stop it and it closes at now.";
  else if (running) sub = `Started ${hhmm(t.startedAt)} · billable equals wall when you stop`;
  else if (t.unclocked) sub = "You worked here today without a clock. Mental won't guess the hours.";
  else sub = "Start a clock to record this sit-down.";
  if (t.runningCount > 1) sub = `${t.runningCount} clocks running · ${sub}`;
  let y = 108;
  for (const line of wrapLines(sub, fitChars(inner, 12), 2)) {
    body.push(txt(PAD, y, esc(line), { size: 12, fill: stale || (!running && t.unclocked) ? T.amber : T.ink2 }));
    y += 16;
  }
  // Today's timeline, 6:00 → 24:00, with this clock's slice and a live head.
  y += 16;
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const d0 = day.getTime() + 6 * 3600_000;
  const d1 = day.getTime() + 24 * 3600_000;
  const xOf = (ms) => PAD + ((Math.max(d0, Math.min(d1, ms)) - d0) / (d1 - d0)) * inner;
  body.push(`<rect x="${PAD}" y="${y}" width="${inner}" height="8" rx="4" fill="${T.wash}" fill-opacity="0.05"/>`);
  for (const h of [9, 12, 15, 18, 21]) {
    const x = xOf(day.getTime() + h * 3600_000);
    body.push(`<line x1="${r1(x)}" y1="${y + 12}" x2="${r1(x)}" y2="${y + 16}" stroke="${T.ink3}" stroke-opacity="0.6"/>`);
    body.push(txt(x, y + 28, String(h), { size: 9.5, fill: T.ink3, anchor: "middle" }));
  }
  if (running) {
    const x0 = xOf(Math.max(t.startedAt, d0));
    const x1 = Math.max(x0 + 6, xOf(now));
    const color = stale ? T.amber : T.violet;
    body.push(`<rect x="${r1(x0)}" y="${y}" width="${r1(x1 - x0)}" height="8" rx="4" fill="url(#${id}seg)"/>`);
    body.push(`<circle cx="${r1(x1)}" cy="${y + 4}" r="5" fill="${color}" fill-opacity="0.25"><animate attributeName="r" values="5;10;5" dur="2.4s" repeatCount="indefinite"/><animate attributeName="fill-opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite"/></circle>`);
    body.push(`<circle cx="${r1(x1)}" cy="${y + 4}" r="4" fill="${T.surface}" stroke="${color}" stroke-width="2"/>`);
  } else {
    const x = xOf(now);
    body.push(`<line x1="${r1(x)}" y1="${y - 3}" x2="${r1(x)}" y2="${y + 11}" stroke="${T.ink3}" stroke-dasharray="2 2"/>`);
  }
  y += 28;
  const defs = [
    `<linearGradient id="${id}ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${T.inkA}"/><stop offset="1" stop-color="${T.lilac}"/></linearGradient>`,
    `<linearGradient id="${id}seg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${stale ? T.amber : T.violet}" stop-opacity="0.35"/><stop offset="1" stop-color="${stale ? T.amber : T.violet2}"/></linearGradient>`,
  ];
  const height = Math.round(y + PAD - 4);
  const alt = running
    ? `Time tracking: clock running ${clockOf(elapsed)} since ${hhmm(t.startedAt)}${stale ? ", looks stale" : ""}.`
    : `Time tracking: no clock running${t.unclocked ? ", worked today without a clock" : ""}.`;
  return { source: card({ id, width: W, height, body, defs }), height, alt };
}

/**
 * The dashboard: what it is, and whether it is serving right now.
 * @param {{ width: number, dash?: { state: "running" | "starting" | "stopped" | "other" | "unknown", url?: string } }} o
 * @returns {{ source: string, height: number, alt: string }}
 */
export function dashSvg({ width: W, dash = { state: "unknown" } }) {
  const id = "d";
  const st =
    dash.state === "running"
      ? { label: "Serving", color: T.green, pulse: true }
      : dash.state === "starting"
        ? { label: "Starting", color: T.violet2, pulse: true }
        : dash.state === "other"
          ? { label: "Port in use", color: T.amber, pulse: false }
          : { label: "Not running", color: T.ink3, pulse: false };
  const H = 112;
  const art = W - PAD - 92;
  // A small living graph: journals, decisions, residue, as on the dashboard.
  const nodes = [
    [art + 14, 40, 5, T.violet2],
    [art + 52, 28, 4, T.sky],
    [art + 78, 54, 6, T.purple],
    [art + 40, 72, 4, T.amber],
    [art + 76, 88, 3.5, T.emerald],
    [art + 12, 86, 3, T.violet2],
  ];
  const edges = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 2],
    [3, 4],
    [3, 5],
    [2, 4],
  ];
  const body = [eyebrow(PAD, 30, "Dashboard")];
  for (const [a, b] of edges) {
    const [x1, y1] = nodes[a];
    const [x2, y2] = nodes[b];
    body.push(`<line x1="${r1(x1)}" y1="${y1}" x2="${r1(x2)}" y2="${y2}" stroke="${T.lilac}" stroke-opacity="0.22"/>`);
  }
  nodes.forEach(([x, y, r, c], i) => {
    body.push(
      `<circle cx="${r1(x)}" cy="${y}" r="${r}" fill="${c}"><animate attributeName="fill-opacity" values="1;0.55;1" dur="${3 + i * 0.7}s" repeatCount="indefinite"/></circle>`,
    );
  });
  body.push(txt(PAD, 58, "Explore every journal, decision", { size: 14, weight: 620, fill: T.ink }));
  body.push(txt(PAD, 77, "and the project graph", { size: 14, weight: 620, fill: T.ink }));
  const where =
    dash.state === "running"
      ? (dash.url || "localhost:3847").replace(/^https?:\/\//, "").replace(/\/$/, "")
      : dash.state === "other"
        ? "another project is on 3847"
        : "opens in your browser";
  body.push(`<circle cx="${PAD + 4}" cy="${96}" r="3.5" fill="${st.color}"/>`);
  if (st.pulse) {
    body.push(
      `<circle cx="${PAD + 4}" cy="96" r="3.5" fill="none" stroke="${st.color}" stroke-width="1.5"><animate attributeName="r" values="3.5;9" dur="1.6s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite"/></circle>`,
    );
  }
  body.push(
    txt(PAD + 14, 100, `<tspan fill="${st.color}" font-weight="600">${esc(st.label)}</tspan><tspan fill="${T.ink3}">  ·  ${esc(where)}</tspan>`, {
      size: 11.5,
    }),
  );
  const alt = `Dashboard: ${st.label.toLowerCase()}${dash.state === "running" ? ` at ${where}` : ""}.`;
  return { source: card({ id, width: W, height: H, body }), height: H, alt };
}

/**
 * The docked Desktop pane: a dark column of same-width cards, each with its
 * own actions under it. Native buttons cannot be colored, so they sit in
 * short rows right under the card they act on.
 * @param {{ Box: Function, Text: Function, Button: Function, Svg: Function }} E
 */
export function paneDesktop(E, ctx) {
  const { Box, Button, Svg } = E;
  const { vm, s, now, columns, updatedAt, cwd, log = [], error = "", dash, theme = "auto" } = ctx;
  const width = widthOf(columns);
  const svg = (make) => {
    const built = themed(make, theme);
    return built ? Svg({ source: built.source, alt: built.alt, width, height: built.height }) : null;
  };
  const row = (key, buttons) =>
    buttons.length ? Box({ key, flexDirection: "row", gap: 1, children: buttons }) : null;
  const linked = !!vm?.linked;
  const track = linked && vm.track ? vm.track : null;
  const running = !!track && track.runningCount > 0;
  const dashState = dash?.state || "unknown";
  const children = [
    svg(() => heroSvg({ vm, s, now, width, error, updatedAt })),
    row("actions", [
      ...(linked
        ? [
            Button({ key: "park", label: "◆ Park", onPress: ctx.onPark }),
            Button({ key: "handoff", label: "⇢ Hand off", onPress: ctx.onHandoff }),
          ]
        : []),
      Button({ key: "refresh", label: "↻ Refresh", onPress: ctx.onRefresh }),
    ]),
    linked ? svg(() => needsSvg({ vm, now, width })) : null,
    svg(() => sessionSvg({ s, now, width })),
    svg(() => trackSvg({ vm, now, width })),
    track
      ? row("track", [
          running
            ? Button({ key: "track-stop", label: "■ Stop clock", onPress: ctx.onTrackStop })
            : Button({ key: "track-start", label: "▶ Start clock", onPress: ctx.onTrackStart }),
        ])
      : null,
    svg(() => filesSvg({ s, cwd, width })),
    svg(() => activitySvg({ log, now, width })),
    svg(() => guardrailsSvg({ vm, width })),
    svg(() => dashSvg({ width, dash })),
    row("dash", [
      Button({
        key: "dashboard",
        label: dashState === "running" ? "↗ Open dashboard" : dashState === "starting" ? "… Starting" : "▶ Start dashboard",
        onPress: ctx.onDashboard,
      }),
    ]),
  ].filter(Boolean);
  return Box({
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 1,
    paddingX: 2,
    paddingY: 1,
    children,
  });
}

/**
 * The persistent opener in the Desktop prompt footer (the `SessionMode` site,
 * the one always-on spot the Desktop raises): logo, one-word status, what
 * needs you, and the button that opens or hides the docked pane. Keeps the
 * footer's own mode labels after it.
 * @param {{ Box: Function, Text: Function, Button: Function, Svg?: Function }} E
 */
export function footerDesktop(E, ctx) {
  const { Box, Text, Button, Svg } = E;
  const { vm, s, now, isOpen, modes = [], bandSeen = false } = ctx;
  const st = statusOf(vm, s, now);
  const { items } = needsOf(vm);
  // With the band above the prompt already showing status, the footer is just
  // the opener; without it, the footer carries the status itself.
  const parts = ["Mental"];
  if (!bandSeen) {
    parts.push(st.label);
    if (items.length) parts.push(`${items.length} need${items.length === 1 ? "s" : ""} you`);
  }
  const children = [
    Svg ? Svg({ source: logoSvg(16), alt: "Mental", width: 16, height: 16 }) : null,
    Button({
      key: "mental-toggle",
      label: `${parts.join(" · ")}  ${isOpen ? "◧" : "◨"}`,
      onPress: ctx.onToggle,
    }),
    modes.length ? Text({ dimColor: true, children: [modes.join(" & ")] }) : null,
  ].filter(Boolean);
  return Box({ flexDirection: "row", alignItems: "center", gap: 1, children });
}

/** 20px brain logo for the band. */
export function logoSvg(size = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" width="${size}" height="${size}"/></svg>`;
}

/**
 * The band above the prompt on Desktop: logo, status, resume, counts, and the
 * always-present Open/Hide button for the docked pane.
 * @param {{ Box: Function, Text: Function, Button: Function, Svg?: Function }} E
 */
export function bandDesktop(E, ctx) {
  const { Box, Text, Button, Svg } = E;
  const { vm, s, now, columns, maxRows = 2 } = ctx;
  const st = statusOf(vm, s, now);
  const cols = Math.max(40, Number(columns) || 100);
  const { items } = needsOf(vm);
  // The band sits on the host's own chrome (light or dark), so primary text
  // takes the host's color and only accents carry a hex.
  const needs = items.length ? `${items.length} need${items.length === 1 ? "s" : ""} you` : "";
  const needsColor = items.some((x) => x.kind === "eyes") ? T.rose : T.amber;
  let message = "";
  if (st.state === "absent") message = "Not linked here. Ask the agent to link this folder.";
  else if (st.state === "loading") message = "Reading the thread…";
  else if (vm?.linked) message = vm.resume ? vm.resume : "No resume point yet";
  const fixed = 2 + 7 + 3 + st.label.length + (needs ? needs.length + 3 : 0) + 6;
  const head = Box({
    key: "head",
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    children: [
      Svg ? Svg({ source: logoSvg(16), alt: "Mental", width: 16, height: 16 }) : Text({ children: ["🧠"] }),
      Text({ bold: true, children: ["Mental"] }),
      Text({ color: st.color, children: [`● ${st.label}`] }),
      Box({
        key: "msg",
        flexGrow: 1,
        flexShrink: 1,
        children: [Text({ dimColor: true, wrap: "truncate-end", children: [clip(message, Math.max(8, cols - fixed))] })],
      }),
      needs && Button && ctx.onNeeds
        ? Button({ key: "band-needs", label: `${needs} ›`, onPress: ctx.onNeeds })
        : needs
          ? Text({ color: needsColor, bold: true, children: [needs] })
          : null,
    ].filter(Boolean),
  });
  let second = "";
  let secondColor = "";
  if (st.state === "pressure") {
    second = `△ ${pressureReasonOf(s)}`;
    secondColor = T.amber;
  } else if (st.state === "receipt" && s.receipt?.title) {
    second = `${s.receipt.glyph} ${s.receipt.label} · ${s.receipt.title}`;
    secondColor = st.color;
  } else if (st.state === "compacting") {
    second = "Compacting context. The resume point is safe in Mental.";
    secondColor = T.violet2;
  } else if (items.length) {
    second = `${items[0].label} · ${items[0].title}${items.length > 1 ? `  +${items.length - 1} more` : ""}`;
    secondColor = items[0].color;
  }
  const rows = [head];
  if (second && maxRows >= 2) {
    rows.push(Text({ color: secondColor, wrap: "truncate-end", children: [clip(second, cols)] }));
  }
  return Box({ flexDirection: "column", children: rows });
}

/**
 * An inline chat row for a `mental …` shell call: logo, what it did, the title.
 * @param {NonNullable<ReturnType<typeof import("./toolcard.mjs").toolCardOf>>} m
 * @returns {{ source: string, height: number, alt: string }}
 */
export function toolCardSvg(m, { width: W = 460 } = {}) {
  const id = "t";
  const accent = m.state === "failed" ? T.rose : toneOf(m.tone) || T.violet2;
  const left = PAD + 34;
  const inner = W - left - PAD;
  const body = [
    `<rect x="0" y="14" width="3.5" height="H" rx="1.75" fill="${accent}"/>`,
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="${PAD - 4}" y="16" width="26" height="26"/>`,
    txt(left, 26, esc(m.kind.toUpperCase()), { size: 10, weight: 650, fill: accent, spacing: 1.3 }),
  ];
  if (m.state === "running") {
    body.push(
      `<circle cx="${W - PAD - 4}" cy="22" r="3.5" fill="${accent}"><animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></circle>`,
    );
  }
  let y = 48;
  const lines = wrapLines(m.title, fitChars(inner, 14.5), 3);
  for (const line of lines) {
    body.push(txt(left, y, esc(line), { size: 14.5, weight: 600, fill: m.state === "running" ? T.ink2 : T.ink }));
    y += 20;
  }
  if (m.detail) {
    y += 1;
    for (const line of wrapLines(m.detail, fitChars(inner, 11.5), 2)) {
      body.push(txt(left, y, esc(line), { size: 11.5, fill: T.ink3 }));
      y += 16;
    }
  }
  const height = Math.max(58, Math.round(y + 8));
  const fixed = body.map((b) => b.replace('height="H"', `height="${height - 28}"`));
  return {
    source: card({ id, width: W, height, body: fixed }),
    height,
    alt: `Mental — ${m.kind}: ${m.title}${m.detail ? `. ${m.detail}` : ""}`,
  };
}

/** The chat row as an element: one themed Svg. */
export function toolRowDesktop({ Svg, Box }, ctx) {
  const width = ctx.width || 460;
  const built = themed(() => toolCardSvg(ctx.model, { width }), ctx.theme);
  if (!built) return null;
  return Box({
    flexDirection: "column",
    children: [Svg({ source: built.source, alt: built.alt, width, height: built.height })],
  });
}