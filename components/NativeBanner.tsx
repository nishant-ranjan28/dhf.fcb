"use client";

// Adsterra Native Banner — content-style ad grid (default 4 cards in a row;
// customize via Adsterra dashboard → Websites → Native Banner → EDIT).
// Unlike the fixed-size banners, the native unit sizes itself to its
// container, so it renders in-document rather than in an iframe: its
// invoke.js has no global state (it targets the container-<key> div), so
// two-script collision isn't a concern here. Consent-gated like all ads.
//
// Env: NEXT_PUBLIC_ADSTERRA_NATIVE_SRC — the script src from the Adsterra
// embed snippet, e.g. //pl123456.profitablecpmgate.com/<key>/invoke.js

import { useEffect, useState } from "react";
import { CONSENT_ACCEPTED_EVENT, hasAdConsent } from "@/lib/consent";

const SRC = process.env.NEXT_PUBLIC_ADSTERRA_NATIVE_SRC;

function containerIdFromSrc(src: string): string | null {
  const m = /\/([a-z0-9]+)\/invoke\.js/i.exec(src);
  return m ? `container-${m[1]}` : null;
}

export function NativeBanner() {
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

  useEffect(() => {
    if (!consented || !SRC) return;
    if (document.getElementById("adsterra-native-loader")) return;
    const s = document.createElement("script");
    s.id = "adsterra-native-loader";
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    s.src = SRC;
    document.body.appendChild(s);
  }, [consented]);

  if (!SRC) return null;
  const id = containerIdFromSrc(SRC);
  if (!id) return null;

  // No reserved height: the native unit's size varies with container width
  // and row count, so a fixed placeholder would guess wrong more often than
  // it helps. It sits below the fold on post pages, where late layout growth
  // doesn't shift content the reader is looking at.
  return <div id={id} className="mx-4 my-3" />;
}
