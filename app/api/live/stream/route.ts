import { getMatchBySlug } from "@/lib/football";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

// One shared poll loop per slug. New subscribers get the cached snapshot
// immediately, then receive every subsequent tick. Loop self-disposes when
// the last subscriber leaves OR the match reaches FT.
//
// Why: per-connection setTimeout would N-multiply upstream calls. With this
// pattern N viewers on the same match cost 1 upstream poll every 30s.
interface SlugLoop {
  subscribers: Set<(m: Match) => void>;
  latest: Match | null;
  timer: ReturnType<typeof setTimeout> | null;
  finished: boolean;
}

const loops = new Map<string, SlugLoop>();
const POLL_MS = 30_000;

async function pollOnce(slug: string): Promise<void> {
  const loop = loops.get(slug);
  if (!loop) return;
  try {
    const match = await getMatchBySlug(slug);
    if (match) {
      loop.latest = match;
      for (const sub of loop.subscribers) sub(match);
      if (match.status === "FT") {
        loop.finished = true;
      }
    }
  } catch {
    // ignore, retry next tick
  }
  if (!loop.finished && loop.subscribers.size > 0) {
    loop.timer = setTimeout(() => pollOnce(slug), POLL_MS);
  } else {
    loop.timer = null;
  }
}

function ensureLoop(slug: string): SlugLoop {
  let loop = loops.get(slug);
  if (!loop) {
    loop = { subscribers: new Set(), latest: null, timer: null, finished: false };
    loops.set(slug, loop);
  }
  return loop;
}

function disposeLoop(slug: string): void {
  const loop = loops.get(slug);
  if (!loop) return;
  if (loop.timer) clearTimeout(loop.timer);
  loops.delete(slug);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return new Response("missing slug", { status: 400 });

  // Validate the slug before opening a stream — bad slugs return 404 so
  // EventSource falls back cleanly instead of holding a no-op connection.
  const initial = await getMatchBySlug(slug);
  if (!initial) return new Response("not found", { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;

      const send = (m: Match) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ match: m })}\n\n`));
        } catch {
          closed = true;
        }
      };

      const loop = ensureLoop(slug);
      loop.subscribers.add(send);
      // Bootstrap: emit the cached value if we have one, otherwise the slug
      // we just resolved. Either way the client never waits 30s for first paint.
      send(loop.latest ?? initial);

      // Kick off the poll loop only when this is the first subscriber AND
      // the match is still running.
      if (!loop.timer && !loop.finished && initial.status !== "FT") {
        loop.timer = setTimeout(() => pollOnce(slug), POLL_MS);
      }

      const cleanup = () => {
        if (closed) return;
        closed = true;
        loop.subscribers.delete(send);
        if (loop.subscribers.size === 0) disposeLoop(slug);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);

      // FT means no further ticks; close after the initial frame.
      if (initial.status === "FT") {
        loop.finished = true;
        // Give the client a beat to receive the frame before closing.
        setTimeout(cleanup, 50);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
