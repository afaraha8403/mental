/**
 * Cross-project compact summaries from bindings.json.
 * No journal bodies. Exclusive search stays exclusive — this is counts only.
 */
import { existsSync } from "node:fs";
import { loadBindings, projectSliceDir } from "./bindings.mjs";
import { latestJournalHandoff, listOpenAttention, listOpenDecisions } from "./okf.mjs";
import { collectDelta, PULSE_TITLE_CAP } from "./delta.mjs";
import { readWatermark } from "./watermark.mjs";

/**
 * @param {string} home
 * @returns {Array<{ id: string, name: string, resume: string, attentionCount: number, openDecisionCount: number }>}
 */
export function collectPulseProjects(home) {
  if (!home) return [];
  let data;
  try {
    data = loadBindings(home);
  } catch {
    return [];
  }
  return data.bindings.map((b) => {
    const root = projectSliceDir(home, b.id);
    const has = existsSync(root);
    const handoff = has
      ? latestJournalHandoff(root)
      : { resume: null, outcome: null, file: null, when: null, against: null };
    const attention = has ? listOpenAttention(root) : [];
    const decisions = has ? listOpenDecisions(root) : [];
    return {
      id: b.id,
      name: String(b.name || b.id),
      resume: handoff.resume || "",
      attentionCount: attention.length,
      openDecisionCount: decisions.length,
    };
  });
}

/**
 * Delta for the active bundle. Titles only here (capped), never on heartbeat.
 * @param {string | null} root
 * @param {string | null | undefined} home
 * @param {string | null | undefined} id
 * @param {NodeJS.ProcessEnv} [env]
 */
export function pulseDeltaFor(root, home, id, env = process.env) {
  const now = new Date().toISOString();
  const wm = home && id ? readWatermark(home, id, env) : null;
  const since = wm?.at ?? now;
  if (!root || !wm) {
    return { since, writes: 0, attention: 0, decisions: 0, titles: [] };
  }
  return collectDelta(root, wm.at, { titleLimit: PULSE_TITLE_CAP });
}

/**
 * @param {Array<{ name: string, resume: string, attentionCount: number, openDecisionCount: number }>} projects
 */
export function formatPulse(projects) {
  if (projects.length === 0) return "No project bindings yet — write a journal or park first.";
  return projects
    .map((p) => {
      const resume = p.resume || "(no resume)";
      return `${p.name}  ${resume}  air:${p.attentionCount}  open:${p.openDecisionCount}`;
    })
    .join("\n");
}
