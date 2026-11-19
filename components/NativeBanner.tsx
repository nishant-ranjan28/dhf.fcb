"use client";

// Adsterra Native Banner — content-style ad grid (default 4 cards in a row;
// customize via Adsterra dashboard → Websites → Native Banner → EDIT).
// Unlike the fixed-size banners, the native unit sizes itself to its
// container, so it renders in-document rather than in an iframe: its
// invoke.js has no global state (it targets the container-<key> div), so
// two-script collision isn't a concern here. Consent-gated like all ads.
//
// Env: NEXT_PUBLIC_ADSTERRA_NATIVE_SRC — the script src from the Adsterra
// embed snippet. Adsterra reissues these URLs per publisher (ours is
// https://bauval.org/21/<key>, with no /invoke.js), so the default below is
// only a fallback; override the env var when Adsterra changes the code.

import { useEffect, useState } from "react";
import { CONSENT_ACCEPTED_EVENT, hasAdConsent } from "@/lib/consent";

const SRC =
  process.env.NEXT_PUBLIC_ADSTERRA_NATIVE_SRC ||
  "https://bauval.org/21/7ebabaa1099f9fcaef3460d32a6b8bf8";

function containerIdFromSrc(src: string): string | null {
  // Both the old /<key>/invoke.js form and the current /21/<key> form carry
  // the same 32-char hex key; the container div is always container-<key>.
  const m = /(?:^|[/-])([a-f0-9]{32})(?:[/"'#?]|$)/i.exec(src);
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
