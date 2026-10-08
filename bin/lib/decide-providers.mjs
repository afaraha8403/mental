/**
 * Decision-model provider adapters.
 *
 * Mental talks to every provider in one neutral shape: a shared `state` string and a map
 * of typed questions (noul / choice / score), answered as `{ noul } | { choice, probabilities,
 * confidence } | { score, legend, probabilities, confidence }`. Each adapter translates that to
 * and from one provider's wire format. They never throw and never touch the network.
 *
 * Providers (all optional, all bring-your-own key):
 *  - typesafe   TypeSafe Jev (System One)     POST api.typesafe.ai/v1/systemone
 *  - openai     OpenAI Decisions (beta)       POST api.openai.com/v1/decisions
 *  - cloudflare Cloudflare Clef / Clef Flash  POST api.cloudflare.com/.../ai/run/@cf/cloudflare/<model>
 *  - custom     Anything speaking the Jev wire shape (a gateway, a local model).
 */

export const PROVIDER_INFO = {
  typesafe: {
    label: "TypeSafe Jev",
    signup: "https://typesafe.ai",
    url: "https://api.typesafe.ai/v1/systemone",
    model: "jev-latest",
    batchMax: 25,
    totalTokens: 48_000,
    stateTokens: 24_000,
  },
  openai: {
    label: "OpenAI Decisions",
    signup: "https://platform.openai.com/api-keys",
    url: "https://api.openai.com/v1/decisions",
    model: "gpt-6-luna",
    batchMax: 10,
    totalTokens: 48_000,
    stateTokens: 24_000,
  },
  cloudflare: {
    label: "Cloudflare Clef",
    signup: "https://dash.cloudflare.com/profile/api-tokens",
    url: null,
    model: "clef",
    batchMax: 64,
    totalTokens: 48_000,
    stateTokens: 24_000,
  },
  custom: {
    label: "Custom endpoint",
    signup: null,
    url: null,
    model: "default",
    batchMax: 25,
    totalTokens: 48_000,
    stateTokens: 24_000,
  },
};

/** Clef accepts these model names. */
export const CLOUDFLARE_MODELS = ["clef", "clef-flash"];

/**
 * @typedef {{ type: "noul" | "choice" | "score", instructions: string, criteria?: any }} Question
 * @typedef {{ url: string, headers: Record<string, string>, body: string, idMap: Record<string, string> }} Built
 * @typedef {{ answers: Record<string, any>, model: string | null, usage: { input_tokens?: number } | null } | null} Parsed
 */

/** Settings for one provider after defaults. */
export function providerSettings(provider, r) {
  const info = PROVIDER_INFO[provider] || PROVIDER_INFO.custom;
  return {
    provider,
    key: r.key,
    url: r.url || info.url,
    model: r.model || info.model,
    accountId: r.accountId || null,
    info,
  };
}

/** Why a provider cannot be called yet, or null when it is ready. */
export function missingSetting(s) {
  if (s.provider === "cloudflare" && !s.accountId) return "account-id";
  if (s.provider === "cloudflare" && !CLOUDFLARE_MODELS.includes(String(s.model).trim())) return "model";
  if (s.provider !== "cloudflare" && !s.url) return "url";
  return null;
}

/**
 * Providers with stricter id rules get opaque ids (q0, q1...) and we map back on parse.
 * @param {string[]} ids
 */
function opaqueIds(ids) {
  /** @type {Record<string, string>} wire id → mental id */
  const back = {};
  ids.forEach((id, i) => {
    back[`q${i}`] = id;
  });
  return back;
}

const stateText = (state) => (typeof state === "string" ? state : JSON.stringify(state ?? ""));

/**
 * @param {ReturnType<typeof providerSettings>} s
 * @param {unknown} state
 * @param {Record<string, Question>} questions
 * @returns {Built}
 */
export function buildRequest(s, state, questions) {
  const ids = Object.keys(questions);
  const auth = { Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };
  if (s.provider === "openai") {
    const back = opaqueIds(ids);
    const body = {
      model: s.model,
      input: stateText(state),
      questions: Object.entries(back).map(([wire, id]) => toOpenAiQuestion(wire, questions[id])),
    };
    return { url: s.url, headers: auth, body: JSON.stringify(body), idMap: back };
  }
  if (s.provider === "cloudflare") {
    const back = opaqueIds(ids);
    const wireQs = Object.fromEntries(Object.entries(back).map(([wire, id]) => [wire, questions[id]]));
    const model = String(s.model).trim();
    const url = s.url || `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(s.accountId)}/ai/run/@cf/cloudflare/${model}`;
    return { url, headers: auth, body: JSON.stringify({ state: stateText(state), model, questions: wireQs }), idMap: back };
  }
  // typesafe + custom: native Jev shape, ids passed through.
  const same = Object.fromEntries(ids.map((id) => [id, id]));
  return { url: s.url, headers: auth, body: JSON.stringify({ state, model: s.model, questions }), idMap: same };
}

/**
 * @param {string} provider
 * @param {any} json parsed response body
 * @param {Built["idMap"]} idMap
 * @param {Record<string, Question>} questions keyed by mental id
 * @returns {Parsed}
 */
export function parseResponse(provider, json, idMap, questions) {
  if (!json || typeof json !== "object") return null;
  if (provider === "openai") return parseOpenAi(json, idMap, questions);
  // Cloudflare's REST envelope wraps the model output in `result`.
  const body = provider === "cloudflare" && json.result && typeof json.result === "object" ? json.result : json;
  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return null;
  const answers = {};
  for (const [wire, id] of Object.entries(idMap)) {
    if (body.answers[wire] !== undefined) answers[id] = body.answers[wire];
  }
  return { answers, model: typeof body.model === "string" ? body.model : null, usage: body.usage || null };
}

/* ── OpenAI Decisions ─────────────────────────────────────────────── */

function toOpenAiQuestion(name, q) {
  if (q.type === "noul") {
    const c = q.criteria || {};
    const extra = [c.true ? `True when: ${c.true}` : "", c.false ? `False when: ${c.false}` : ""].filter(Boolean).join(" ");
    return { type: "predicate", name, instructions: extra ? `${q.instructions} ${extra}` : q.instructions };
  }
  if (q.type === "choice") {
    const choices = Object.entries(q.criteria || {}).map(([value, description]) =>
      description ? { value, description: String(description) } : { value },
    );
    return { type: "choice", name, instructions: q.instructions, choices };
  }
  const levels = (Array.isArray(q.criteria) ? q.criteria : []).map((l) => ({ label: String(l) }));
  return { type: "score", name, instructions: q.instructions, levels };
}

const asProbMap = (arr, key) => {
  if (!Array.isArray(arr)) return {};
  const out = {};
  for (const p of arr) {
    const k = key === "label" ? (p?.label ?? p?.value) : p?.value;
    if (k !== undefined && typeof p?.probability === "number") out[String(k)] = p.probability;
  }
  return out;
};

function parseOpenAi(json, idMap, questions) {
  if (!Array.isArray(json.answers)) return null;
  const answers = {};
  for (const a of json.answers) {
    const id = idMap[a?.name];
    if (!id || !a || a.type === "refusal") continue;
    const q = questions[id];
    if (a.type === "predicate" && typeof a.probability === "number") {
      answers[id] = { noul: a.probability };
    } else if (a.type === "choice" && typeof a.choice === "string") {
      answers[id] = { choice: a.choice, probabilities: asProbMap(a.probabilities), confidence: a.confidence };
    } else if (a.type === "score" && typeof a.score === "number") {
      const levels = Array.isArray(q?.criteria) ? q.criteria : [];
      const legend = levels[Math.min(levels.length - 1, Math.max(0, Math.round(a.score)))] ?? null;
      answers[id] = { score: a.score, legend, probabilities: asProbMap(a.probabilities, "label"), confidence: a.confidence };
    }
  }
  // The endpoint reports no usage; the caller estimates input tokens.
  return { answers, model: typeof json.model === "string" ? json.model : null, usage: json.usage || null };
}
