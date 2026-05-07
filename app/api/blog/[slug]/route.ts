import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { blogStore } from "@/lib/blog/store";
import { isAdminAuthorized } from "@/lib/blog/auth";

export const revalidate = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = await blogStore().get(slug);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    { post },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  const ok = await blogStore().delete(slug);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ deleted: slug });
}
