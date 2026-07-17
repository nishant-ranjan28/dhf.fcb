// Serves /ads.txt — authorizes ad networks to monetize this site's inventory.
// Google line derives from NEXT_PUBLIC_ADSENSE_CLIENT (single source of truth).
// Adsterra publishes per-account ads.txt records in its dashboard; paste them
// verbatim into ADSTERRA_ADS_TXT (newline-separated; literal "\n" also works
// for single-line env UIs). 404s until at least one network is configured.

export const dynamic = "force-static";

// Fixed certification-authority id for Google AdSense (same for every publisher).
const GOOGLE_CERT_ID = "f08c47fec0942fa0";

export function GET() {
  const lines: string[] = [];

  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  if (client) {
    // ads.txt wants the "pub-XXXX" form; the AdSense client id is "ca-pub-XXXX".
    lines.push(`google.com, ${client.replace(/^ca-/, "")}, DIRECT, ${GOOGLE_CERT_ID}`);
  }

  const adsterra = process.env.ADSTERRA_ADS_TXT?.trim();
  if (adsterra) {
    lines.push(
      ...adsterra
        .split(/\r?\n|\\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }

  if (lines.length === 0) {
    return new Response("", { status: 404 });
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
