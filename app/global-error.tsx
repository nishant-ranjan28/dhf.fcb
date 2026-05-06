"use client";

import { useEffect } from "react";

// global-error catches errors thrown from the root layout itself.
// It must render its own <html> and <body>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0B0B0F",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.5rem", color: "#9CA3AF", fontSize: "0.875rem" }}>
            Please refresh the page.
          </p>
        </div>
      </body>
    </html>
  );
}
