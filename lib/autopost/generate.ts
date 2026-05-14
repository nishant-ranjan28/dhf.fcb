import type { SelectedNewsItem, DraftPost } from "./types";

const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GenerateResult =
  | { ok: true; draft: DraftPost }
  | { ok: false; reason: "quota" | "all_providers_failed" };

export async function generateDraft(item: SelectedNewsItem): Promise<GenerateResult> {
  const prompt = buildPrompt(item);
  let sawQuota = false;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const r = await tryGemini(prompt, geminiKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "gemini" } };
    if (r.quota) sawQuota = true;
    // Fall through to Groq on quota or transient.
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const r = await tryGroq(prompt, groqKey);
    if (r.ok) return { ok: true, draft: { ...r.draft, provider: "groq" } };
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
- AT LEAST 800 words. This is a strict minimum — short posts will be rejected and the model will be asked to retry. Aim for 900-1000 words across 5-7 paragraphs.
- Markdown body.
- Add ANALYSIS and CONTEXT — what this means for Barcelona / the player / the season. Do NOT just summarize the source.
- Confident, opinionated voice. No "as an AI" disclaimers.
- Use the entities ${JSON.stringify(item.entities)} naturally in the body — they must each appear verbatim at least once (e.g. if "Barcelona" is in the list, use the word "Barcelona", not just "Barça" or "the club").

Return ONLY a JSON object (no markdown fences, no prose around it) with this shape:
{
  "title": "string — your own headline, not the source's",
  "body": "string — markdown body, 700-1000 words",
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

async function tryGemini(prompt: string, key: string): Promise<{ ok: true; draft: ParsedDraft } | { ok: false; quota?: true }> {
  try {
    const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[autopost] gemini http", res.status);
      return res.status === 429 ? { ok: false, quota: true } : { ok: false };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn("[autopost] gemini parse failed");
      return { ok: false };
    }
    const draft = parseJsonDraft(text);
    if (!draft) {
      console.warn("[autopost] gemini parse failed");
      return { ok: false };
    }
    return { ok: true, draft };
  } catch (err) {
    console.warn("[autopost] gemini exception:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
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
        model: GROQ_MODEL,
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
