import type { SelectedNewsItem, DraftPost } from "./types";

// Single-provider generation via GROQ_API_KEY only (Gemini removed).
// Groq retired `llama-3.3-70b-versatile` on 2026-08-16 (404 for free/dev tier).
// Free-tier pick: `openai/gpt-oss-20b` (production model, ~1000 tok/s).
// Overridable via GROQ_MODEL env without a code change.
function resolveGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
}

// Fallback provider via OpenRouter (OpenAI-compatible). Same model ID so
// prompt/JSON behavior matches Groq. Overridable via OPENROUTER_MODEL.
function resolveOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-oss-20b";
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type GenerateResult =
  | { ok: true; draft: DraftPost }
  | { ok: false; reason: "quota" | "all_providers_failed" };

export async function generateDraft(
  item: SelectedNewsItem,
  opts?: { missingEntities?: string[] },
): Promise<GenerateResult> {
  const prompt = buildPrompt(item, opts?.missingEntities);
  let sawQuota = false;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const r = await tryGroq(prompt, groqKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "groq" } };
    if (r.quota) sawQuota = true;
    // Fall through to OpenRouter on quota or transient.
  }

  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (orKey) {
    const r = await tryOpenRouter(prompt, orKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "openrouter" } };
    if (r.quota) sawQuota = true;
  }

  return { ok: false, reason: sawQuota ? "quota" : "all_providers_failed" };
}

function buildPrompt(item: SelectedNewsItem, missingEntities?: string[]): string {
  const repair =
    missingEntities && missingEntities.length > 0
      ? `

REQUIRED REVISION: an earlier draft was rejected because these names/words did not appear in the body: ${JSON.stringify(missingEntities)}.
You MUST write each of them EXACTLY as spelled (verbatim, case-insensitive) at least once in the body. Do not substitute a nickname or a translated form. This is the single most important requirement — a draft missing any of them is rejected again.`
      : "";
  return `You are a sports blogger for BarcaPulse, an FC Barcelona and FIFA-focused fan blog.

A news story has just broken. Source title: "${item.source.title}".
Source summary: "${item.source.content.slice(0, 600)}".
Source URL: ${item.source.link ?? "(no link)"}

Write an ORIGINAL, SHORT BarcaPulse post about this story. Rules:
- 300-420 words total. Strictly NO long essays — dense, skimmable copy wins.
- Markdown body with EXACTLY these four H2 sections, in this order:
  ## Quick take
  Two sentences, max 45 words. Lead with the single most important fact.
  ## What happened
  Two short paragraphs, 50-70 words each. Max three sentences per paragraph.
  ## Why it matters
  Three bullets, 20-30 words each. Add real analysis for Barcelona / the player / the season — do NOT just summarize the source.
  ## What's next
  One short paragraph, max 60 words. Give a concrete thing to watch.
- Confident, opinionated voice. No "as an AI" disclaimers.
- Use the entities ${JSON.stringify(item.entities)} naturally in the body — they must each appear verbatim at least once (e.g. if "Barcelona" is in the list, use the word "Barcelona", not just "Barça" or "the club").
- Do NOT invent social-media links or embed codes. Leave those to the app.

Return ONLY a JSON object (no markdown fences, no prose around it) with this shape:
{
  "title": "string — your own short headline, not the source's",
  "body": "string — markdown body, 300-420 words, using the four H2 sections above",
  "excerpt": "string — punchy 1-line summary, under 150 chars",
  "tags": ["array", "of", "5", "lowercase", "tags"]
}${repair}`;
}

interface ParsedDraft {
  title: string;
  body: string;
  excerpt: string;
  tags: string[];
}

async function tryGroq(prompt: string, key: string): Promise<{ ok: true; draft: ParsedDraft } | { ok: false; quota?: true }> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: resolveGroqModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        // gpt-oss burns reasoning tokens before emitting the JSON. 2048 left
        // nothing for the answer and Groq rejected it with json_validate_failed.
        max_tokens: 4096,
        // No response_format: Groq's strict JSON validator rejects any preamble
        // or reasoning leak. The prompt asks for JSON and parseJsonDraft below
        // extracts the object from whatever the model wraps around it.
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[autopost] groq http", res.status, (await res.text()).slice(0, 400));
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      console.warn("[autopost] groq returned no content");
      return { ok: false };
    }
    const draft = parseJsonDraft(text);
    if (!draft) {
      console.warn("[autopost] groq parse failed:", text.slice(0, 200));
      return { ok: false };
    }
    return { ok: true, draft };
  } catch (err) {
    console.warn("[autopost] groq exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

async function tryOpenRouter(prompt: string, key: string): Promise<{ ok: true; draft: ParsedDraft } | { ok: false; quota?: true }> {
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "X-Title": "BarcaPulse autopost",
    };
    const referer = process.env.SITE_URL?.trim();
    if (referer) headers["HTTP-Referer"] = referer;
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: resolveOpenRouterModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[autopost] openrouter http", res.status, (await res.text()).slice(0, 400));
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      console.warn("[autopost] openrouter returned no content");
      return { ok: false };
    }
    const draft = parseJsonDraft(text);
    if (!draft) {
      console.warn("[autopost] openrouter parse failed:", text.slice(0, 200));
      return { ok: false };
    }
    return { ok: true, draft };
  } catch (err) {
    console.warn("[autopost] openrouter exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

function parseJsonDraft(text: string): ParsedDraft | null {
  // Reasoning models often emit a sentence or a ```json fence around the
  // object. Strip fences, then slice from the first `{` to the last `}` so a
  // preamble doesn't make the whole response unparseable.
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    const parsed = JSON.parse(candidate) as Partial<ParsedDraft>;
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
