/**
 * Pure element builders for the Claude Code panel. They take the resolved
 * constructors `{ Box, Text, Button }` (from `$.ui.resolve(e)`, or fakes in
 * tests) and plain data, and return a RenderElement tree. Only props from the
 * Mods allowlist are used — one unknown prop throws the whole tree out.
 */

import {
  ageOf,
  barOf,
  clip,
  clockOf,
  dialOf,
  fitSegments,
  plural,
  relPathOf,
  sparklineOf,
  wrapLines,
} from "./format.mjs";
import { bandStateOf, pressureReasonOf, topFiles } from "./model.mjs";

/** Dashboard palette (dark). */
export const C = {
  violet: "#a78bfa",
  violetDeep: "#8b5cf6",
  sky: "#38bdf8",
  amber: "#f59e0b",
  green: "#10b981",
  purple: "#a855f7",
  rose: "#e11d48",
  zinc: "#71717a",
  ink: "#ededf0",
  ink2: "#a1a1aa",
  ink3: "#6e6e78",
  rule: "#3f3f46",
};

const TONE = { violet: C.violet, purple: C.purple, sky: C.sky, amber: C.amber, green: C.green, zinc: C.ink2 };
const BREATH = ["∙", "•", "●", "•"];
const KIND_GLYPH = { verify: "◎", thread: "↺", direction: "➜", concern: "△" };

export const TABS = [
  { id: "now", label: "Now", hotkey: "n" },
  { id: "residue", label: "Residue", hotkey: "r" },
  { id: "decisions", label: "Decisions", hotkey: "d" },
  { id: "session", label: "Session", hotkey: "s" },
  { id: "time", label: "Time", hotkey: "t" },
];

/**
 * @typedef {{ Box: Function, Text: Function, Button: Function }} Elements
 */

/** @param {Elements} el */
function span(el, color, children, extra = {}) {
  return el.Text({ color, ...extra, children });
}

/** @param {Elements} el */
function line(el, parts) {
  return el.Text({ wrap: "truncate-end", children: parts });
}

function contextTone(pct) {
  if (pct == null) return C.ink3;
  if (pct >= 75) return C.amber;
  if (pct >= 50) return C.violet;
  return C.violetDeep;
}

/**
 * The meta strip under the band headline: sparkline, counts, dial, timer.
 * @returns {{ text: string, color: string, priority: number, bold?: boolean }[]}
 */
export function metaSegments(vm, s, now) {
  /** @type {{ text: string, color: string, priority: number, bold?: boolean }[]} */
  const segs = [];
  if (s.perTurn.length) segs.push({ text: sparklineOf(s.perTurn, 12), color: C.violet, priority: 3 });
  if (s.turns) segs.push({ text: plural(s.turns, "turn"), color: C.ink3, priority: 2 });
  if (s.files.size) segs.push({ text: plural(s.files.size, "file"), color: C.ink3, priority: 4 });
  if (vm?.linked) {
    if (vm.needsEyesCount) segs.push({ text: `● ${vm.needsEyesCount} needs eyes`, color: C.rose, priority: 9 });
    if (vm.attentionCount) segs.push({ text: `△ ${vm.attentionCount}`, color: C.amber, priority: 7 });
    if (vm.decisionCount) segs.push({ text: `◇ ${vm.decisionCount}`, color: C.sky, priority: 6 });
  }
  const pct = s.context?.percent;
  if (pct != null) {
    segs.push({ text: `${dialOf(pct)} ${Math.round(pct)}%`, color: contextTone(pct), priority: 8 });
  }
  if (vm?.linked && vm.track && vm.track.startedAt != null) {
    segs.push({
      text: `◷ ${clockOf(now - vm.track.startedAt)}`,
      color: vm.track.stale ? C.amber : C.ink2,
      priority: 5,
    });
  }
  segs.push({ text: "/mental", color: C.rule, priority: 1 });
  return segs;
}

/**
 * The headline row parts for a band state.
 * @param {Elements} el
 */
function headline(el, state, vm, s, now, width, frame) {
  const brand = span(el, C.violet, "◆ mental", { bold: true });
  const gap = span(el, C.rule, "  ");
  const room = Math.max(8, width - 10);
  switch (state) {
    case "compacting":
      return [brand, gap, span(el, C.violet, clip("◌ compacting — the thread is safe in Mental", room))];
    case "receipt": {
      const r = s.receipt;
      const tone = TONE[r.tone] || C.violet;
      const head = `${r.glyph} ${r.label}`;
      return [
        brand,
        gap,
        span(el, tone, head, { bold: true }),
        r.title ? span(el, C.ink, ` ${clip(`› ${r.title}`, room - head.length - 1)}`) : null,
      ];
    }
    case "loading":
      return [brand, gap, span(el, C.ink3, "reading the thread…", { italic: true })];
    case "absent":
      return [brand, gap, span(el, C.ink3, clip("not linked here — run `mental link` to keep this project's thread", room))];
    case "pressure":
      return [brand, gap, span(el, C.amber, clip(`▲ ${pressureReasonOf(s)}`, room))];
    case "working": {
      const glyph = BREATH[frame % BREATH.length];
      const head = `${glyph} turn ${s.turns + 1}${s.editsThisTurn ? ` · ${plural(s.editsThisTurn, "edit")}` : ""}`;
      return [
        brand,
        gap,
        span(el, C.violet, head),
        vm.resume ? span(el, C.ink3, `  ${clip(`↳ ${vm.resume}`, room - head.length - 2)}`) : null,
      ];
    }
    case "fresh": {
      const head = `✦ handed off ${ageOf(vm.handoffAge)} ago`;
      return [
        brand,
        gap,
        span(el, C.green, head),
        vm.outcome ? span(el, C.ink2, ` ${clip(`— ${vm.outcome}`, room - head.length - 1)}`) : null,
      ];
    }
    default: {
      if (!vm.resume) return [brand, gap, span(el, C.ink3, "no resume point yet — park when you pause")];
      const age = vm.handoffAge != null ? `  ${ageOf(vm.handoffAge)}` : "";
      return [brand, gap, span(el, C.ink2, clip(`↳ ${vm.resume}`, room - age.length)), span(el, C.ink3, age)];
    }
  }
}

/**
 * The always-on band above the prompt (up to two rows).
 * @param {Elements} el
 * @param {{ vm: any, s: any, now: number, columns: number, maxRows?: number, frame?: number }} input
 */
export function bandView(el, { vm, s, now, columns, maxRows = 2, frame = 0 }) {
  const width = Math.max(20, columns || 80);
  const state = bandStateOf(vm, s, now);
  const rows = [line(el, headline(el, state, vm, s, now, width, frame))];
  if (maxRows >= 2 && state !== "absent" && state !== "loading") {
    const segs = fitSegments(metaSegments(vm, s, now), width - 2);
    const parts = [span(el, C.rule, "  ")];
    segs.forEach((seg, i) => {
      if (i) parts.push(span(el, C.rule, "  "));
      parts.push(span(el, seg.color, seg.text, seg.bold ? { bold: true } : {}));
    });
    rows.push(line(el, parts));
  }
  return el.Box({ flexDirection: "column", width, children: rows });
}

/** @param {Elements} el */
function section(el, label, width, color = C.violetDeep) {
  const rule = "─".repeat(Math.max(0, width - label.length - 1));
  return line(el, [span(el, color, label, { bold: true }), span(el, C.rule, ` ${rule}`)]);
}

/** @param {Elements} el */
function wrapped(el, text, width, color, maxLines, indent = "") {
  return wrapLines(text, width - indent.length, maxLines).map((l) => line(el, [span(el, C.rule, indent), span(el, color, l)]));
}

/** @param {Elements} el */
function nowLines(el, vm, s, now, width) {
  const out = [];
  out.push(section(el, "RESUME", width));
  if (vm.resume) out.push(...wrapped(el, vm.resume, width, C.ink, 3));
  else out.push(line(el, [span(el, C.ink3, "No resume point yet. Park when you pause.", { italic: true })]));
  if (vm.outcome || vm.handoffAge != null) {
    const meta = [vm.outcome, vm.handoffAge != null ? `${ageOf(vm.handoffAge)} ago` : "", vm.via ? `via ${vm.via}` : ""]
      .filter(Boolean)
      .join(" · ");
    out.push(line(el, [span(el, C.green, "✦ "), span(el, C.ink2, clip(meta, width - 2))]));
  }
  const pct = s.context?.percent;
  if (pct != null) {
    const label = ` ${dialOf(pct)} context ${Math.round(pct)}%`;
    out.push(line(el, [span(el, contextTone(pct), barOf(pct, Math.max(6, width - label.length))), span(el, C.ink2, label)]));
  }
  if (vm.needsEyes.length) {
    out.push(section(el, "NEEDS EYES", width, C.rose));
    for (const item of vm.needsEyes.slice(0, 3)) {
      out.push(line(el, [span(el, C.rose, "● "), span(el, C.ink, clip(item.title || item.file, width - 2))]));
    }
  }
  const d = vm.delta;
  if (d && (d.writes || d.attention || d.decisions || d.parks)) {
    out.push(section(el, "SINCE HANDOFF", width));
    const bits = [
      d.writes ? plural(d.writes, "write") : "",
      d.attention ? `△ ${d.attention}` : "",
      d.decisions ? `◇ ${d.decisions}` : "",
      d.parks ? plural(d.parks, "park") : "",
    ].filter(Boolean);
    out.push(line(el, [span(el, C.ink2, clip(bits.join("  ·  "), width))]));
  }
  out.push(section(el, "GIT", width));
  out.push(
    line(el, [
      span(el, C.violet, "⎇ "),
      span(el, C.ink, clip(vm.branch || "(no branch)", Math.max(8, width - 16))),
      vm.dirty ? span(el, C.amber, `  ● ${vm.changed} changed`) : span(el, C.green, "  ✓ clean"),
    ]),
  );
  for (const c of vm.recent.slice(0, 3)) {
    const [hash, ...rest] = String(c).split(" ");
    out.push(line(el, [span(el, C.violetDeep, `${hash} `), span(el, C.ink2, clip(rest.join(" "), width - hash.length - 1))]));
  }
  return out;
}

/** @param {Elements} el */
function residueLines(el, vm, width) {
  const out = [section(el, `ATTENTION · ${vm.attentionCount}`, width, C.amber)];
  if (!vm.attention.length) {
    out.push(line(el, [span(el, C.ink3, "Nothing open. The thread is clear.", { italic: true })]));
    return out;
  }
  for (const a of vm.attention) {
    const glyph = KIND_GLYPH[a.kind] || "△";
    const status = a.status && a.status !== "open" ? `  ${a.status}` : "";
    out.push(
      line(el, [
        span(el, C.amber, `${glyph} `),
        span(el, C.ink, clip(a.title || a.file, width - 2 - status.length)),
        span(el, C.ink3, status),
      ]),
    );
  }
  return out;
}

/** @param {Elements} el */
function decisionLines(el, vm, width) {
  const out = [section(el, `OPEN · ${vm.decisionCount}`, width, C.sky)];
  if (!vm.decisions.length) out.push(line(el, [span(el, C.ink3, "No open decisions.", { italic: true })]));
  for (const d of vm.decisions) {
    out.push(line(el, [span(el, C.sky, "◇ "), span(el, C.ink, clip(d.title || d.file, width - 2))]));
  }
  if (vm.guardrails.length) {
    out.push(section(el, `GUARDRAILS · ${vm.guardrailCount}`, width, C.zinc));
    for (const g of vm.guardrails) {
      out.push(line(el, [span(el, C.zinc, "▪ "), span(el, C.ink2, clip(g.title || g.file, width - 2))]));
    }
  }
  return out;
}

/** @param {Elements} el */
function sessionLines(el, s, now, width, cwd) {
  const out = [section(el, "THIS SESSION", width)];
  out.push(
    line(el, [
      span(el, C.ink, plural(s.turns, "turn"), { bold: true }),
      span(el, C.ink3, "  ·  "),
      span(el, C.ink2, `${clockOf(now - s.startedAt)} elapsed`),
      span(el, C.ink3, "  ·  "),
      span(el, C.ink2, `${plural(s.edits, "edit")} in ${plural(s.files.size, "file")}`),
    ]),
  );
  if (s.perTurn.length) {
    out.push(line(el, [span(el, C.ink3, "edits/turn "), span(el, C.violet, sparklineOf(s.perTurn, Math.max(4, width - 11)))]));
  }
  const pct = s.context?.percent;
  if (pct != null) {
    const label = ` ${dialOf(pct)} ${Math.round(pct)}%`;
    out.push(line(el, [span(el, C.ink3, "context    "), span(el, contextTone(pct), barOf(pct, Math.max(6, width - 11 - label.length))), span(el, C.ink2, label)]));
  }
  const files = topFiles(s, 8);
  if (files.length) {
    out.push(section(el, "TOUCHED", width));
    const max = files[0].count;
    for (const f of files) {
      const bar = "▪".repeat(Math.max(1, Math.round((f.count / max) * 6)));
      const count = ` ${f.count}`;
      out.push(
        line(el, [
          span(el, C.violetDeep, bar.padEnd(7)),
          span(el, C.ink, clip(relPathOf(f.path, cwd), width - 7 - count.length)),
          span(el, C.ink3, count),
        ]),
      );
    }
  }
  return out;
}

/** @param {Elements} el */
function timeLines(el, vm, now, width) {
  if (!vm.track) return [line(el, [span(el, C.ink3, "Time tracking is off for this project.", { italic: true })])];
  const out = [section(el, "TIME", width, C.zinc)];
  const t = vm.track;
  if (t.runningCount && t.startedAt != null) {
    out.push(
      line(el, [
        span(el, t.stale ? C.amber : C.green, "◷ "),
        span(el, C.ink, clockOf(now - t.startedAt), { bold: true }),
        span(el, C.ink2, `  running${t.runningCount > 1 ? ` · ${t.runningCount} clocks` : ""}`),
        t.stale ? span(el, C.amber, "  · stale") : null,
      ]),
    );
  } else {
    out.push(line(el, [span(el, C.ink3, "◷ No clock running.")]));
  }
  if (t.unclocked) out.push(line(el, [span(el, C.amber, "△ Work today with no clocked interval.")]));
  return out;
}

/**
 * The `/mental` pane.
 * @param {Elements} el
 * @param {{
 *   vm: any, s: any, now: number, columns: number, rows?: number, tab: string,
 *   updatedAt: number | null, error?: string, cwd?: string,
 *   onTab: (id: string) => void, onPark: () => void, onHandoff: () => void, onRefresh: () => void,
 * }} input
 */
export function paneView(el, input) {
  const { vm, s, now, tab, updatedAt, error, cwd } = input;
  const width = Math.max(30, (input.columns || 80) - 2);
  const rows = Math.max(8, input.rows || 16);

  const updated = updatedAt == null ? "…" : `updated ${ageOf(now - updatedAt)}${ageOf(now - updatedAt) === "now" ? "" : " ago"}`;
  const header = el.Box({
    flexDirection: "row",
    justifyContent: "space-between",
    width,
    children: [
      line(el, [
        span(el, C.violet, "◆ mental", { bold: true }),
        vm?.linked ? span(el, C.ink, `  ${clip(vm.id, Math.max(6, width - 34))}`, { bold: true }) : null,
        vm?.linked && vm.branch ? span(el, C.ink3, `  ⎇ ${clip(vm.branch, 18)}`) : null,
      ]),
      span(el, error ? C.rose : C.ink3, error ? "△ heartbeat failed" : updated),
    ],
  });

  const tabs = el.Box({
    flexDirection: "row",
    gap: 1,
    children: TABS.map((t) =>
      el.Button({
        key: `tab-${t.id}`,
        label: t.label,
        hotkey: t.hotkey,
        ...(t.id === tab ? {} : { plain: true, dimColor: true }),
        onPress: () => input.onTab(t.id),
      }),
    ),
  });

  const footer = el.Box({
    flexDirection: "row",
    gap: 1,
    children: [
      el.Button({ key: "park", label: "Park", hotkey: "p", onPress: input.onPark }),
      el.Button({ key: "handoff", label: "Handoff", hotkey: "h", onPress: input.onHandoff }),
      el.Button({ key: "refresh", label: "Refresh", hotkey: "f", plain: true, dimColor: true, onPress: input.onRefresh }),
    ],
  });

  /** @type {any[]} */
  let body;
  if (!vm) body = [line(el, [span(el, C.ink3, "Reading the thread…", { italic: true })])];
  else if (!vm.linked) {
    body = [
      line(el, [span(el, C.ink2, "This folder isn't linked to a Mental project.")]),
      line(el, [span(el, C.ink3, "Run `mental link` (or park once) to start keeping its thread.")]),
    ];
  } else if (tab === "residue") body = residueLines(el, vm, width);
  else if (tab === "decisions") body = decisionLines(el, vm, width);
  else if (tab === "session") body = sessionLines(el, s, now, width, cwd);
  else if (tab === "time") body = timeLines(el, vm, now, width);
  else body = nowLines(el, vm, s, now, width);

  const budget = Math.max(3, rows - 4);
  if (body.length > budget) {
    const more = body.length - (budget - 1);
    body = [...body.slice(0, budget - 1), line(el, [span(el, C.ink3, `  +${more} more`)])];
  }

  return el.Box({
    flexDirection: "column",
    width,
    children: [header, tabs, el.Box({ flexDirection: "column", flexGrow: 1, children: body }), footer],
  });
}
