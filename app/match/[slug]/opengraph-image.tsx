import { ImageResponse } from "next/og";
import { getMatchBySlug } from "@/lib/football";

export const alt = "Match on BarcaPulse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Per-match share card. Node runtime (default) — getMatchBySlug reads the
// static fixtures from the filesystem, which the edge runtime can't do.
export default async function MatchOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const match = await getMatchBySlug(slug);

  const home = match?.home.name ?? "BarcaPulse";
  const away = match?.away.name ?? "Live football";
  const comp = match?.competitionName ?? "Barça · FIFA";
  const showScore = match && match.status !== "SCHED";
  const center = showScore ? `${match!.scoreHome} – ${match!.scoreAway}` : "VS";
  const statusLabel =
    match?.status === "LIVE"
      ? `LIVE · ${match.minute}'`
      : match?.status === "HT"
        ? "HALF TIME"
        : match?.status === "FT"
          ? "FULL TIME"
          : match
            ? "Upcoming"
            : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #004D98 0%, #A50044 55%, #6C2BD9 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 64,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>BarcaPulse</div>
          <div style={{ fontSize: 26, opacity: 0.9 }}>{comp}</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 36,
            flex: 1,
          }}
        >
          <div style={{ flex: 1, textAlign: "right", fontSize: 60, fontWeight: 800, lineHeight: 1.05 }}>
            {home}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "16px 28px",
              borderRadius: 24,
              background: "rgba(0,0,0,0.28)",
            }}
          >
            <div style={{ fontSize: 64, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              {center}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: "left", fontSize: 60, fontWeight: 800, lineHeight: 1.05 }}>
            {away}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", fontSize: 28, opacity: 0.9 }}>
          {statusLabel}
        </div>
      </div>
    ),
    size,
  );
}
