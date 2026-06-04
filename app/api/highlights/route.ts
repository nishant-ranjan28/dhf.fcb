import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { highlightsStore } from "@/lib/highlights/store";
import { isAdminAuthorized } from "@/lib/blog/auth";

export const dynamic = "force-dynamic";

// GET /api/highlights → { highlights: [...] }
export async function GET() {
  const highlights = await highlightsStore().list();
  return NextResponse.json(
    { highlights },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

// POST /api/highlights  body: { url, title }  (admin only)
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    url?: string;
    title?: string;
  } | null;
  if (!body || typeof body.url !== "string" || typeof body.title !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    const highlight = await highlightsStore().add({ url: body.url, title: body.title });
    revalidatePath("/fifa");
    return NextResponse.json({ highlight }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

// DELETE /api/highlights?id=<youtubeId>  (admin only)
export async function DELETE(req: Request) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const removed = await highlightsStore().remove(id);
  revalidatePath("/fifa");
  return NextResponse.json({ removed });
}
