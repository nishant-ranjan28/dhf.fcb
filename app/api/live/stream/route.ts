import { getMatchBySlug } from "@/lib/football";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return new Response("missing slug", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (m: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch {
          // controller may be closed
        }
      };
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const tick = async () => {
        if (cancelled) return;
        try {
          const match = await getMatchBySlug(slug);
          if (!cancelled && match) send({ match });
          if (!cancelled && match?.status !== "FT") {
            timer = setTimeout(tick, 30_000);
          } else if (!cancelled) {
            // Match is FT — close the stream.
            cancelled = true;
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        } catch {
          if (!cancelled) timer = setTimeout(tick, 30_000);
        }
      };

      // Send the first update immediately.
      tick();

      req.signal.addEventListener("abort", () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
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
