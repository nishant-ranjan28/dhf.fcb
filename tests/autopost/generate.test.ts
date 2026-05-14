import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateDraft } from "@/lib/autopost/generate";
import type { SelectedNewsItem } from "@/lib/autopost/types";

const ITEM: SelectedNewsItem = {
  entities: ["yamal", "barcelona"],
  source: {
    id: "1",
    slug: "bbc-yamal",
    title: "Yamal signs new Barcelona deal",
    content: "Lamine Yamal signed a new contract with Barcelona today.",
    category: "barca",
    createdAt: "2026-05-14T10:00:00Z",
    lang: "en",
    link: "https://bbc.co.uk/x",
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GEMINI_API_KEY = "test-gemini";
  delete process.env.GROQ_API_KEY;
});

function mockGemini(payload: object, status = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("not-mocked", { status: 599 });
  });
}

function mockGroq(payload: object, status = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("api.groq.com")) {
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("not-mocked", { status: 599 });
  });
}

function geminiJsonPayload(json: object): object {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] };
}

function groqJsonPayload(json: object): object {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

const VALID = {
  title: "Yamal commits future to Barcelona",
  body: "Lamine Yamal has signed... " + "word ".repeat(700),
  excerpt: "Yamal extends his Barcelona contract.",
  tags: ["barcelona", "yamal", "transfers", "la-liga", "contract"],
};

describe("generateDraft — Gemini primary", () => {
  it("returns a draft tagged provider=gemini on success", async () => {
    vi.stubGlobal("fetch", mockGemini(geminiJsonPayload(VALID)));
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.provider).toBe("gemini");
      expect(r.draft.title).toBe("Yamal commits future to Barcelona");
      expect(r.draft.tags).toContain("yamal");
    }
  });

  it("returns reason:'quota' on Gemini 429 with no Groq key", async () => {
    vi.stubGlobal("fetch", mockGemini({ error: "rate_limit" }, 429));
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "quota" });
  });
});

describe("generateDraft — Groq fallback", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-groq";
  });

  it("falls back to Groq on Gemini 429 and succeeds", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429 });
      }
      if (u.includes("api.groq.com")) {
        return new Response(JSON.stringify(groqJsonPayload(VALID)), { status: 200 });
      }
      return new Response("not-mocked", { status: 599 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.provider).toBe("groq");
  });

  it("returns all_providers_failed when both fail", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "all_providers_failed" });
  });
});
