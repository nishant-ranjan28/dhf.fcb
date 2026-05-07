import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatBlogPost,
  formatNewsItem,
  formatNewsPost,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";
import type { BlogPost } from "@/lib/blog/types";

const TOKEN = "123456:abcdef";
const CHAT = "@barcapulse";

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHANNEL_ID;
});

describe("isTelegramConfigured", () => {
  it("false when neither set", () => {
    expect(isTelegramConfigured()).toBe(false);
  });
  it("false when only one set", () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    expect(isTelegramConfigured()).toBe(false);
  });
  it("true when both set", () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_CHANNEL_ID = CHAT;
    expect(isTelegramConfigured()).toBe(true);
  });
  it("treats whitespace-only as unset", () => {
    process.env.TELEGRAM_BOT_TOKEN = "   ";
    process.env.TELEGRAM_CHANNEL_ID = "   ";
    expect(isTelegramConfigured()).toBe(false);
  });
});

describe("sendTelegramMessage", () => {
  it("returns ok=false when not configured", async () => {
    const res = await sendTelegramMessage({ text: "hi" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/i);
  });

  it("posts to the right URL with the right payload when configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_CHANNEL_ID = CHAT;
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendTelegramMessage({ text: "hello world" });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init).toBeDefined();
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      chat_id: CHAT,
      text: "hello world",
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
  });

  it("returns ok=false on non-2xx with a short error", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_CHANNEL_ID = CHAT;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Request: chat not found", { status: 400 })),
    );
    const res = await sendTelegramMessage({ text: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/HTTP 400/);
    expect(res.error).toMatch(/chat not found/);
  });

  it("returns ok=false on network errors without throwing", async () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_CHANNEL_ID = CHAT;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ENETUNREACH");
      }),
    );
    const res = await sendTelegramMessage({ text: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ENETUNREACH");
  });
});

describe("formatBlogPost", () => {
  function p(over: Partial<BlogPost> = {}): BlogPost {
    return {
      slug: "yamal-extension",
      title: "Yamal extends contract through 2030",
      excerpt: "Five-year deal, €1B clause.",
      body: "...",
      tags: [],
      createdAt: "2026-05-07T10:00:00Z",
      updatedAt: "2026-05-07T10:00:00Z",
      author: "BarcaPulse",
      ...over,
    };
  }

  it("uses HTML <b> for the title and <a> for the link", () => {
    const out = formatBlogPost(p(), "https://barcapulse.com");
    expect(out).toContain("<b>Yamal extends contract through 2030</b>");
    expect(out).toContain('href="https://barcapulse.com/blog/yamal-extension"');
  });

  it("entity-encodes title characters that would break HTML mode", () => {
    const out = formatBlogPost(
      p({ title: "<script>alert(1)</script> & co.", excerpt: "<x>" }),
      "https://b.com",
    );
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co.");
    expect(out).toContain("&lt;x&gt;");
  });

  it("omits an empty excerpt cleanly", () => {
    const out = formatBlogPost(p({ excerpt: "" }), "https://b.com");
    expect(out).not.toMatch(/\n\n\n/); // no triple-newline gap
  });
});

describe("formatNewsItem", () => {
  it("includes source as italic when given", () => {
    const out = formatNewsItem({
      title: "Lewy hits 200",
      link: "https://bbc.co.uk/x",
      source: "BBC Sport",
    });
    expect(out).toContain("<i>BBC Sport</i>");
    expect(out).toContain('href="https://bbc.co.uk/x"');
  });
  it("works without source", () => {
    const out = formatNewsItem({ title: "x", link: "https://y.com" });
    expect(out).not.toContain("<i>");
  });
});

describe("formatNewsPost", () => {
  it("derives a sensible source label from category", () => {
    const out = formatNewsPost({
      id: "1",
      slug: "bbc-x",
      title: "Foo",
      content: "",
      category: "barca",
      createdAt: new Date().toISOString(),
      lang: "en",
      link: "https://bbc.co.uk/x",
    });
    expect(out).toContain("FC Barcelona news");
  });
});
