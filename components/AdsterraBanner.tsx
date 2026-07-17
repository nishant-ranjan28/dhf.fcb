"use client";

// Adsterra banner unit, consent-gated like the AdSense loader. Each banner
// renders inside its own iframe via srcDoc because Adsterra's invoke.js reads
// a page-global `atOptions` — two units in the same document would clobber
// each other's config. The iframe also keeps Adsterra's script out of our DOM.

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

  const srcDoc = `<!doctype html><html><body style="margin:0"><script type="text/javascript">atOptions={key:${JSON.stringify(
    adKey,
  )},format:'iframe',height:${height},width:${width},params:{}};</script><script type="text/javascript" src="https://www.highperformanceformat.com/${encodeURIComponent(
    adKey,
  )}/invoke.js"></script></body></html>`;

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
