import { ImageResponse } from "next/og";

export const alt = "BarcaPulse — Live football, Barca & FIFA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #004D98 0%, #A50044 100%)",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          BarcaPulse
        </div>
        <div style={{ fontSize: 36, marginTop: 24, opacity: 0.9 }}>
          Live football · Barca · FIFA
        </div>
      </div>
    ),
    size,
  );
}
