/**
 * The one drawing Mental keeps in SVG on Claude Desktop: the inline chat card
 * for a `mental …` shell call (`ToolUse` site), plus the brand logo. Panes and
 * bands are native elements (`views.mjs`); a native `Text` takes the host's
 * own theme, while an `Svg` has to carry both themes itself (`themed`).
 *
 * The Desktop app draws `Svg` as an image. Builders here return markup strings
 * and are pure, so tests can check escaping and size.
 */

import { fitChars, wrapLines } from "./format.mjs";
import { LOGO_PNG } from "./logo.mjs";

/** Dashboard tokens (assets/dashboard/style.css). */
const DARK = {
  surface: "#111114",
  border: "#232329",
  ink: "#ededf0",
  ink2: "#a1a1aa",
  ink3: "#6e6e78",
  violet2: "#a78bfa",
  sky: "#38bdf8",
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#fb7185",
  purple: "#a855f7",
};

/** The same tokens for a light host (the dashboard's light theme). */
const LIGHT = {
  surface: "#ffffff",
  border: "#e4e4e7",
  ink: "#18181b",
  ink2: "#52525b",
  ink3: "#71717a",
  violet2: "#6d28d9",
  sky: "#0284c7",
  amber: "#b45309",
  emerald: "#047857",
  rose: "#e11d48",
  purple: "#9333ea",
};

export const PALETTES = { dark: DARK, light: LIGHT };

/** Live tokens. Builders read this; `themed` swaps it for one build. */
export const T = { ...DARK };

export const SVG_MAX = 131072;
const SANS = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PAD = 20;

const TONE_TOKEN = { violet: "violet2", purple: "purple", sky: "sky", amber: "amber", green: "emerald", zinc: "ink2" };

/**
 * Build a drawing in one theme, or in both when the host's theme is unknown:
 * the two share one SVG and a media query shows the one that matches (dark is
 * what shows when styles are ignored).
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

/**
 * @param {number} x
 * @param {number} y
 * @param {string} body already-escaped text
 * @param {{ size?: number, weight?: number, fill?: string, spacing?: number }} [o]
 */
function txt(x, y, body, o = {}) {
  const attrs = [
    `x="${r1(x)}"`,
    `y="${r1(y)}"`,
    `font-size="${o.size || 13}"`,
    o.weight ? `font-weight="${o.weight}"` : "",
    `fill="${o.fill || T.ink}"`,
    o.spacing ? `letter-spacing="${o.spacing}"` : "",
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${body}</text>`;
}

/** The brand logo as a small SVG document (the band's and pane's one accent). */
export function logoSvg(size = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" width="${size}" height="${size}"/></svg>`;
}

/**
 * An inline chat row for a `mental …` shell call: logo, what it did, the title.
 * @param {NonNullable<ReturnType<typeof import("./toolcard.mjs").toolCardOf>>} m
 * @returns {{ source: string, height: number, alt: string }}
 */
export function toolCardSvg(m, { width: W = 460 } = {}) {
  const accent = m.state === "failed" ? T.rose : T[TONE_TOKEN[m.tone]] || T.violet2;
  const left = PAD + 34;
  const inner = W - left - PAD;
  const body = [
    txt(left, 26, esc(m.kind.toUpperCase()), { size: 10, weight: 650, fill: accent, spacing: 1.3 }),
    `<image href="${LOGO_PNG}" xlink:href="${LOGO_PNG}" x="${PAD - 4}" y="16" width="26" height="26"/>`,
  ];
  if (m.state === "running") body.push(`<circle cx="${W - PAD - 4}" cy="22" r="3.5" fill="${accent}"/>`);
  let y = 48;
  for (const line of wrapLines(m.title, fitChars(inner, 14.5), 3)) {
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
  const H = Math.max(58, Math.round(y + 8));
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">`,
    `<defs><clipPath id="tclip"><rect width="${W}" height="${H}" rx="16"/></clipPath></defs>`,
    `<g clip-path="url(#tclip)"><rect width="${W}" height="${H}" fill="${T.surface}"/></g>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${T.border}"/>`,
    `<rect x="0" y="14" width="3.5" height="${H - 28}" rx="1.75" fill="${accent}"/>`,
    ...body,
    "</svg>",
  ].join("");
  return { source, height: H, alt: `Mental — ${m.kind}: ${m.title}${m.detail ? `. ${m.detail}` : ""}` };
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
