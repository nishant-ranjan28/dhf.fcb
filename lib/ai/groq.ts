import { env } from "@/lib/env";
import type { Match } from "@/lib/types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TRIVIA = 6;

export interface MatchInsights {
  /** Short, punchy headline for the fixture. */
  headline: string;
  /** A one- or two-sentence preview (pre-match) or recap (live/FT). */
  blurb: string;
  /** "Did you know" style facts. */
  trivia: string[];
}

const EMPTY: MatchInsights = { headline: "", blurb: "", trivia: [] };

/** Validate + normalize whatever the model returned into MatchInsights. */
export function _parseInsights(raw: unknown): MatchInsights {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const o = raw as Record<string, unknown>;

  // Accept either {headline, blurb, trivia} or a bare array of facts.
  const triviaSource = Array.isArray(o.trivia)
    ? o.trivia
    : Array.isArray(raw)
      ? (raw as unknown[])
      : Array.isArray(o.facts)
        ? o.facts
        : [];

  const trivia = triviaSource
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TRIVIA);

  return {
    headline: typeof o.headline === "string" ? o.headline.trim() : "",
    blurb: typeof o.blurb === "string" ? o.blurb.trim() : "",
    trivia,
  };
}

function buildPrompt(match: Match): { system: string; user: string } {
  const phase =
    match.status === "SCHED"
      ? "an upcoming match (preview it)"
      : match.status === "FT"
        ? "a finished match (recap it)"
        : "a match in progress (capture the live state)";

  const eventLines = match.events
    .map((e) => `${e.minute}' ${e.type} — ${e.player} (${e.team === "home" ? match.home.name : match.away.name})`)
    .join("\n");

  const system = [
    "You are a football (soccer) editor writing engaging fan-facing match content.",
    "Return STRICT JSON only, shape:",
    '{"headline": string, "blurb": string, "trivia": string[]}.',
    "headline: <= 8 words. blurb: 1-2 sentences for the given match phase.",
    `trivia: 3-5 short, engaging "did you know" style facts or talking points about the teams, rivalry, competition or context.`,
    "IMPORTANT: Do NOT invent precise statistics, dates, records or rankings you are not certain of. Prefer general, evergreen context over specific numbers. Keep it lively but honest.",
  ].join(" ");

  const user = [
    `Match phase: ${phase}.`,
    `Competition: ${match.competitionName}${match.group ? ` (${match.group})` : ""}${match.round ? `, ${match.round}` : ""}.`,
    `Fixture: ${match.home.name} vs ${match.away.name}.`,
    match.venue ? `Venue: ${match.venue}.` : "",
    match.status !== "SCHED" ? `Current score: ${match.home.name} ${match.scoreHome}-${match.scoreAway} ${match.away.name} (${match.minute}').` : "",
    eventLines ? `Key events so far:\n${eventLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/**
 * Generate AI match insights via Groq's OpenAI-compatible API. Resilient by
 * design: returns null when no key is configured or on any network/API error —
 * never throws, so callers can treat insights as a best-effort enhancement.
 */
export async function generateMatchInsights(match: Match): Promise<MatchInsights | null> {
  const apiKey = env.groqApiKey;
  if (!apiKey) return null;

  const { system, user } = buildPrompt(match);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0.6,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn(`[groq] insights failed: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = _parseInsights(JSON.parse(content));
    return parsed.trivia.length || parsed.blurb || parsed.headline ? parsed : null;
  } catch (err) {
    console.warn("[groq] insights error:", err instanceof Error ? err.message : err);
    return null;
  }
}
