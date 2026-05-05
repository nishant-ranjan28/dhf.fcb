import { NextResponse } from "next/server";
import { createPost, listNews } from "@/lib/news";
import type { Competition } from "@/lib/types";

export const revalidate = 60;

function isCategory(v: string | null): v is Competition {
  return v === "barca" || v === "fifa" || v === "other";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get("category");
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const posts = await listNews(isCategory(cat) ? cat : undefined, limit);
  return NextResponse.json(
    { posts },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { title?: string; content?: string; category?: string }
    | null;
  if (!body || !body.title || !body.content || !isCategory(body.category ?? null)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const post = createPost({
    title: body.title,
    content: body.content,
    category: body.category as Competition,
  });
  return NextResponse.json({ post }, { status: 201 });
}
