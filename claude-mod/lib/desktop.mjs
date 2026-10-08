/**
 * Desktop views for the Claude Code panel: SVG cards in the dashboard's
 * palette (dark glass, violet glow, kind colors) plus native buttons.
 *
 * The Desktop app draws `Svg` (an image, or a script-less frame when
 * `isInteractive` so SMIL and `<title>` work). Builders here return markup
 * strings and are pure, so tests can check escaping, layout and size.
 */

import { ageOf, clip, clockOf, msOf, oneLine, plural, relPathOf, wrapLines } from "./format.mjs";
import { LOGO_PNG } from "./logo.mjs";
import { bandStateOf, pressureReasonOf, topFiles, PRESSURE_CONTEXT_PCT, PRESSURE_EDITS } from "./model.mjs";

/** Dashboard tokens (assets/dashboard/style.css). */
export const T = {
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
};

export const SVG_MAX = 131072;
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace";
const PAD = 20;
const MAX_ITEMS = 6;

const TONES = { violet: T.violet2, purple: T.purple, sky: T.sky, amber: T.amber, green: T.emerald, zinc: T.ink2 };
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
  if (!c) return 420;
  return Math.max(300, Math.min(640, Math.round(c * 7.4)));
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
        `<linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#120d22"/><stop offset="1" stop-color="#0a0910"/></linearGradient>`,
        `<pattern id="${id}dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="#ffffff" fill-opacity="0.07"/></pattern>`,
        `<radialGradient id="${id}glow"><stop offset="0" stop-color="${T.violet}" stop-opacity="0.42"/><stop offset="1" stop-color="${T.violet}" stop-opacity="0"/></radialGradient>`,
        `<radialGradient id="${id}glow2"><stop offset="0" stop-color="${T.sky}" stop-opacity="0.16"/><stop offset="1" stop-color="${T.sky}" stop-opacity="0"/></radialGradient>`,
        `<linearGradient id="${id}ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9c3e6"/></linearGradient>`,
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
      return { state, label: s.receipt.label, color: TONES[s.receipt.tone] || T.violet2, pulse: false };
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
export function heroSvg({ vm, s, now, width: W, error = "", trackMs = null }) {
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
        `<rect x="${PAD}" y="${y + 14 + i * 24}" width="${r1(w)}" height="13" rx="6.5" fill="#ffffff" fill-opacity="0.06"><animate attributeName="fill-opacity" values="0.04;0.11;0.04" dur="1.6s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
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
    body.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#ffffff" stroke-opacity="0.07"/>`);
    y += 24;
    // Git foot: branch · changed files · tracked time or last commit.
    const right = trackMs != null ? `◷ ${clockOf(trackMs)}` : String(vm.recent?.[0] || "").split(" ")[0];
    const rightW = right ? right.length * 7.2 + 8 : 0;
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
          fill: trackMs != null ? T.violet2 : T.ink3,
          anchor: "end",
          mono: true,
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
    const color = TONES[r.tone] || T.violet2;
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

/**
 * The docked Desktop pane.
 * @param {{ Box: Function, Text: Function, Button: Function, Svg: Function }} E
 */
export function paneDesktop(E, ctx) {
  const { Box, Text, Button, Svg } = E;
  const { vm, s, now, columns, updatedAt, cwd, log = [], error = "" } = ctx;
  const width = widthOf(columns);
  const trackMs = vm?.track?.startedAt != null ? now - vm.track.startedAt : null;
  const svg = (built, interactive) =>
    built
      ? Svg({
          source: built.source,
          alt: built.alt,
          ...(interactive ? { isInteractive: true } : {}),
        })
      : null;
  const linked = !!vm?.linked;
  const actions = Box({
    key: "actions",
    flexDirection: "row",
    gap: 1,
    children: [
      ...(linked
        ? [
            Button({ key: "park", label: "◆ Park", onPress: ctx.onPark }),
            Button({ key: "handoff", label: "⇢ Hand off", onPress: ctx.onHandoff }),
          ]
        : []),
      Button({ key: "refresh", label: "↻ Refresh", onPress: ctx.onRefresh }),
    ],
  });
  const updated = updatedAt ? `Updated ${agoOf(now - updatedAt)}` : "Reading…";
  const children = [
    svg(heroSvg({ vm, s, now, width, error, trackMs }), true),
    actions,
    svg(sessionSvg({ s, now, width }), !!s.working),
    linked ? svg(needsSvg({ vm, now, width }), true) : null,
    svg(filesSvg({ s, cwd, width }), true),
    svg(activitySvg({ log, now, width }), false),
    svg(guardrailsSvg({ vm, width }), true),
    Text({
      color: T.ink3,
      wrap: "truncate-end",
      children: [`${updated}  ·  Park and Hand off fill your prompt — the agent writes it`],
    }),
  ].filter(Boolean);
  return Box({ flexDirection: "column", gap: 1, children });
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
  const { vm, s, now, isOpen, modes = [] } = ctx;
  const st = statusOf(vm, s, now);
  const { items } = needsOf(vm);
  const parts = ["Mental", st.label];
  if (items.length) parts.push(`${items.length} for you`);
  const children = [
    Svg ? Svg({ source: logoSvg(16), alt: "Mental", width: 16, height: 16 }) : null,
    Button({
      key: "mental-toggle",
      label: `${isOpen ? "◧" : "◨"} ${parts.join(" · ")}`,
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
  const { vm, s, now, columns, maxRows = 2, isOpen } = ctx;
  const st = statusOf(vm, s, now);
  const cols = Math.max(40, Number(columns) || 100);
  const { items } = needsOf(vm);
  const counts = [];
  const eyes = items.filter((x) => x.kind === "eyes").length;
  const att = items.filter((x) => x.color === T.amber).length;
  const dec = items.filter((x) => x.kind === "decision").length;
  if (eyes) counts.push({ text: `${eyes} need eyes`, color: T.rose });
  if (att) counts.push({ text: `${att} open`, color: T.amber });
  if (dec) counts.push({ text: plural(dec, "decision"), color: T.sky });
  const button = Button({
    key: "toggle",
    label: isOpen ? "Hide panel" : "Open panel",
    onPress: ctx.onToggle,
  });
  let message = "";
  if (st.state === "absent") message = "Not linked — ask the agent to link this folder";
  else if (st.state === "loading") message = "Reading the thread…";
  else if (vm?.linked) message = vm.resume ? `Resume · ${vm.resume}` : "No resume point yet";
  const fixed = 6 + 1 + st.label.length + 3 + counts.reduce((n, c) => n + c.text.length + 2, 0) + 14;
  const head = Box({
    key: "head",
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    children: [
      Svg ? Svg({ source: logoSvg(18), alt: "Mental", width: 18, height: 18 }) : Text({ children: ["🧠"] }),
      Text({ bold: true, color: T.ink, children: ["Mental"] }),
      Text({ color: st.color, children: [`● ${st.label}`] }),
      Box({
        key: "msg",
        flexGrow: 1,
        flexShrink: 1,
        children: [Text({ color: T.ink2, wrap: "truncate-end", children: [clip(message, Math.max(8, cols - fixed))] })],
      }),
      ...counts.map((c) => Text({ color: c.color, bold: true, children: [c.text] })),
      button,
    ],
  });
  let second = "";
  let secondColor = T.ink3;
  if (st.state === "pressure") {
    second = `△ ${pressureReasonOf(s)}`;
    secondColor = T.amber;
  } else if (st.state === "receipt" && s.receipt?.title) {
    second = `${s.receipt.glyph} ${s.receipt.label} · ${s.receipt.title}`;
    secondColor = st.color;
  } else if (st.state === "compacting") {
    second = "Compacting context — the resume point is safe in Mental";
    secondColor = T.violet2;
  }
  const rows = [head];
  if (second && maxRows >= 2) {
    rows.push(Text({ color: secondColor, wrap: "truncate-end", children: [clip(second, cols)] }));
  }
  return Box({ flexDirection: "column", children: rows });
}
