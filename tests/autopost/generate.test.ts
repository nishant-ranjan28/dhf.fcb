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
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

function mockGroq(payload: object, status = 200) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url).includes("api.groq.com")) {
      return new Response(JSON.stringify(payload), { status });
    }
    return new Response("not-mocked", { status: 599 });
  });
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

describe("generateDraft — Groq only", () => {
  it("returns a draft tagged provider=groq on success", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    vi.stubGlobal("fetch", mockGroq(groqJsonPayload(VALID)));
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.provider).toBe("groq");
      expect(r.draft.title).toBe("Yamal commits future to Barcelona");
      expect(r.draft.tags).toContain("yamal");
    }
  });

  it("sends the Groq request with bearer auth + json mode", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    const fetchMock = mockGroq(groqJsonPayload(VALID));
    vi.stubGlobal("fetch", fetchMock);
    await generateDraft(ITEM);
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-groq");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("returns reason:'quota' on Groq 429", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    vi.stubGlobal("fetch", mockGroq({ error: "rate_limit" }, 429));
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "quota" });
  });

  it("returns all_providers_failed when no key is set", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "all_providers_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns all_providers_failed when Groq fails", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    const r = await generateDraft(ITEM);
    expect(r).toEqual({ ok: false, reason: "all_providers_failed" });
  });

  it("falls back to OpenRouter when Groq fails", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENROUTER_API_KEY = "test-or";
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes("api.groq.com")) {
        return new Response("groq down", { status: 500 });
      }
      if (u.includes("openrouter.ai")) {
        return new Response(JSON.stringify(groqJsonPayload(VALID)), { status: 200 });
      }
      return new Response("not-mocked", { status: 599 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateDraft(ITEM);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.provider).toBe("openrouter");
  });

  it("calls OpenRouter with bearer auth + the fallback model", async () => {
    process.env.GROQ_API_KEY = "test-groq";
    process.env.OPENROUTER_API_KEY = "test-or";
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes("api.groq.com")) {
        return new Response("groq down", { status: 500 });
      }
      return new Response(JSON.stringify(groqJsonPayload(VALID)), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await generateDraft(ITEM);
    const orCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("openrouter.ai"));
    expect(orCall).toBeDefined();
    const [, init] = orCall as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-or");
    expect(JSON.parse(String(init.body)).model).toBe("openai/gpt-oss-20b");
  });
});
