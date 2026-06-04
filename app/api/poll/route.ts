import { NextResponse } from "next/server";
import { pollStore } from "@/lib/poll/store";
import { getPoll } from "@/lib/poll/polls";

export const dynamic = "force-dynamic";

// GET /api/poll?id=<pollId> → { id, counts, total }
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const poll = getPoll(id);
  if (!poll) return NextResponse.json({ error: "unknown poll" }, { status: 404 });

  const counts = await pollStore().results(
    poll.id,
    poll.options.map((o) => o.id),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return NextResponse.json(
    { id: poll.id, counts, total },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST /api/poll  body: { id, option, voterId } → { counts, total, alreadyVoted }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    option?: string;
    voterId?: string;
  } | null;

  const poll = body?.id ? getPoll(body.id) : undefined;
  if (!poll) return NextResponse.json({ error: "unknown poll" }, { status: 404 });

  const option = body?.option;
  if (!option || !poll.options.some((o) => o.id === option)) {
    return NextResponse.json({ error: "invalid option" }, { status: 400 });
  }

  const voterId = (body?.voterId ?? "").trim();
  if (!voterId || voterId.length > 64) {
    return NextResponse.json({ error: "invalid voterId" }, { status: 400 });
  }

  await pollStore().vote(poll.id, option, voterId);
  // Return the full fresh tally so the client renders accurate bars.
  const counts = await pollStore().results(
    poll.id,
    poll.options.map((o) => o.id),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return NextResponse.json({ counts, total }, { headers: { "Cache-Control": "no-store" } });
}
