// Serves /ads.txt for Google AdSense. Required for the site to be authorized
// to monetize — Google's crawler reads it to confirm the publisher owns the
// inventory. Derived from NEXT_PUBLIC_ADSENSE_CLIENT so there's a single
// source of truth; 404s until the publisher id is configured.

export const dynamic = "force-static";

// Fixed certification-authority id for Google AdSense (same for every publisher).
const GOOGLE_CERT_ID = "f08c47fec0942fa0";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  if (!client) {
    return new Response("", { status: 404 });
  }
  // ads.txt wants the "pub-XXXX" form; the AdSense client id is "ca-pub-XXXX".
  const publisherId = client.replace(/^ca-/, "");
  const body = `google.com, ${publisherId}, DIRECT, ${GOOGLE_CERT_ID}\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
