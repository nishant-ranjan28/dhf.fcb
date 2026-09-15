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

export async function generateDraft(item: SelectedNewsItem): Promise<GenerateResult> {
  const prompt = buildPrompt(item);
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

function buildPrompt(item: SelectedNewsItem): string {
  return `You are a sports blogger for BarcaPulse, an FC Barcelona and FIFA-focused fan blog.

A news story has just broken. Source title: "${item.source.title}".
Source summary: "${item.source.content.slice(0, 600)}".
Source URL: ${item.source.link ?? "(no link)"}

Write an ORIGINAL blog post about this story. Rules:
- AT LEAST 700 words. This is a strict minimum — short posts will be rejected. Aim for 800-1000 words across 5-7 paragraphs.
- Markdown body.
- Add ANALYSIS and CONTEXT — what this means for Barcelona / the player / the season. Do NOT just summarize the source.
- Confident, opinionated voice. No "as an AI" disclaimers.
- Use the entities ${JSON.stringify(item.entities)} naturally in the body — they must each appear verbatim at least once (e.g. if "Barcelona" is in the list, use the word "Barcelona", not just "Barça" or "the club").

Return ONLY a JSON object (no markdown fences, no prose around it) with this shape:
{
  "title": "string — your own headline, not the source's",
  "body": "string — markdown body, 700-1000 words (minimum 700)",
  "excerpt": "string — 1-line summary, under 200 chars",
  "tags": ["array", "of", "5", "lowercase", "tags"]
}`;
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
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[autopost] groq http", res.status);
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      console.warn("[autopost] groq parse failed");
      return { ok: false };
    }
    const draft = parseJsonDraft(text);
    if (!draft) {
      console.warn("[autopost] groq parse failed");
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
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[autopost] openrouter http", res.status);
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      console.warn("[autopost] openrouter parse failed");
      return { ok: false };
    }
    const draft = parseJsonDraft(text);
    if (!draft) {
      console.warn("[autopost] openrouter parse failed");
      return { ok: false };
    }
    return { ok: true, draft };
  } catch (err) {
    console.warn("[autopost] openrouter exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}

function parseJsonDraft(text: string): ParsedDraft | null {
  // Models occasionally wrap JSON in ```json fences. Strip them.
  const cleaned = text.trim()
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
