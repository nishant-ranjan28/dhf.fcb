// Serves the IndexNow ownership-verification key file. Submissions to
// api.indexnow.org reference this URL as keyLocation; engines fetch it and
// compare its contents to the submitted key. 404s until INDEXNOW_KEY is set.
// Same pattern as /ads.txt.

export const dynamic = "force-static";

export function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    return new Response("", { status: 404 });
  }
  return new Response(key + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
