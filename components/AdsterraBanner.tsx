"use client";

// Adsterra banner unit, consent-gated like the AdSense loader. Each banner
// renders inside its own iframe via srcDoc because Adsterra's script reads a
// page-global `atOptions` — two units in the same document would clobber each
// other's config. The iframe also keeps Adsterra's script out of our DOM.
//
// The script URL is publisher-specific and Adsterra has changed it before
// (we originally hardcoded highperformanceformat.com/<key>/invoke.js, which
// silently served nothing after Adsterra reissued our codes on bauval.org).
// Keep it overridable via env so a future host change is a config edit, not a
// code deploy. Copy the exact <script src> from Adsterra → Get Code.

import { useEffect, useState } from "react";
import { CONSENT_ACCEPTED_EVENT, hasAdConsent } from "@/lib/consent";

export function AdsterraBanner({
  adKey,
  width,
  height,
}: {
  adKey: string;
  width: number;
  height: number;
}) {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const update = () => setConsented(hasAdConsent());
    update();
    window.addEventListener(CONSENT_ACCEPTED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CONSENT_ACCEPTED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  // Parent AdSlot wrapper reserves the slot's dimensions, so rendering nothing
  // pre-consent causes no layout shift.
  if (!consented) return null;

  // Adsterra issues codes like <script src="https://bauval.org/22/<key>"></script>.
  // The host/path is per-publisher and can change, so default to the one in our
  // account but allow an env override (e.g. "https://example.org/22").
  const scriptBase = (
    process.env.NEXT_PUBLIC_ADSTERRA_SCRIPT_BASE || "https://bauval.org/22"
  ).replace(/\/+$/, "");
  const srcDoc = `<!doctype html><html><body style="margin:0"><script type="text/javascript">atOptions={key:${JSON.stringify(
    adKey,
  )},format:'iframe',height:${height},width:${width},params:{}};</script><script type="text/javascript" src="${scriptBase}/${encodeURIComponent(
    adKey,
  )}"></script></body></html>`;

  return (
    <iframe
      title="Advertisement"
      srcDoc={srcDoc}
      width={width}
      height={height}
      style={{ border: 0, display: "block", overflow: "hidden" }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      scrolling="no"
    />
  );
}
