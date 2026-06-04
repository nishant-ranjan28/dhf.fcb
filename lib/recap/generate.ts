import type { Match } from "@/lib/types";

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface RecapDraft {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
  provider: "gemini" | "groq";
}

export type RecapResult =
  | { ok: true; draft: RecapDraft }
  | { ok: false; reason: "quota" | "all_providers_failed" };

function eventsBlock(match: Match): string {
  if (match.events.length === 0) {
    return "No detailed events are available for this match — write a concise, score-led recap and DO NOT invent goalscorers, cards or specific incidents.";
  }
  const lines = match.events
    .map((e) => {
      const team = e.team === "home" ? match.home.name : match.away.name;
      return `- ${e.minute}' ${e.type} — ${e.player} (${team})${e.detail ? `, ${e.detail}` : ""}`;
    })
    .join("\n");
  return `Key events (these are the ONLY facts you may state as having happened):\n${lines}`;
}

export function buildRecapPrompt(match: Match): string {
  const context = [
    match.competitionName,
    match.round,
    match.group,
    match.venue,
  ]
    .filter(Boolean)
    .join(" · ");

  return `You are a football writer for BarcaPulse, an FC Barcelona and FIFA World Cup fan site.

Write an ORIGINAL match recap for a finished game.

Match: ${match.home.name} ${match.scoreHome}-${match.scoreAway} ${match.away.name}
Context: ${context}

${eventsBlock(match)}

Rules:
- 350-600 words of Markdown. Confident, engaging match-report voice.
- Base the report ONLY on the facts above (final score and the listed events). DO NOT invent goalscorers, assists, minutes, statistics, quotes or incidents that are not listed. If detail is thin, keep the recap tight rather than padding with fabrications.
- Lead with the result and what decided it; add brief context on what it means for each side.
- No "as an AI" disclaimers.

Return ONLY a JSON object (no markdown fences) with this shape:
{
  "title": "string — your own headline naming both teams or the result",
  "body": "string — markdown recap, 350-600 words",
  "excerpt": "string — 1-line summary under 200 chars",
  "tags": ["array", "of", "3-5", "lowercase", "tags"]
}`;
}

interface ParsedDraft {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
}

function parseJsonDraft(text: string): ParsedDraft | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedDraft>;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.excerpt !== "string" ||
      !Array.isArray(parsed.tags)
    ) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      body: parsed.body.trim(),
      excerpt: parsed.excerpt.trim(),
      tags: parsed.tags.filter((t): t is string => typeof t === "string").slice(0, 5),
    };
  } catch {
    return null;
  }
}

type Attempt = { ok: true; draft: ParsedDraft } | { ok: false; quota?: true };

async function tryGemini(prompt: string, key: string): Promise<Attempt> {
  try {
    const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 1600 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[recap] gemini http", res.status);
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const draft = parseJsonDraft(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    return draft ? { ok: true, draft } : { ok: false };
  } catch (err) {
    console.warn("[recap] gemini exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

async function tryGroq(prompt: string, key: string): Promise<Attempt> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 1600,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[recap] groq http", res.status);
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const draft = parseJsonDraft(data.choices?.[0]?.message?.content ?? "");
    return draft ? { ok: true, draft } : { ok: false };
  } catch (err) {
    console.warn("[recap] groq exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

/** Generate a match recap, trying Gemini first then Groq (mirrors the news
 *  autopost generator). Resilient: returns ok:false rather than throwing. */
export async function generateRecap(match: Match): Promise<RecapResult> {
  const prompt = buildRecapPrompt(match);
  let sawQuota = false;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const r = await tryGemini(prompt, geminiKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "gemini" } };
    if (r.quota) sawQuota = true;
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const r = await tryGroq(prompt, groqKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "groq" } };
    if (r.quota) sawQuota = true;
  }

  return { ok: false, reason: sawQuota ? "quota" : "all_providers_failed" };
}
