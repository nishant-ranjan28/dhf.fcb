import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { githubDocStore } from "@/lib/storage/github";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Diagnostic: verify the GitHub fallback token can read and write the store. */
export async function GET(req: Request) {
  const expected = env.cronToken;
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const got = match?.[1];
  if (!expected || !got || got.length !== expected.length) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    if (!timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = "diagnostic:storage-check";
  try {
    const store = githubDocStore();
    await store.set(key, { value: { at: new Date().toISOString() } });
    const doc = await githubDocStore().get(key);
    await store.del(key);
    return NextResponse.json({ ok: true, read: Boolean(doc) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
