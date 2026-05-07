"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "cookie_consent";
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

type Consent = "accepted" | "declined" | "unset";

function read(): Consent {
  if (typeof window === "undefined") return "unset";
  try {
    const v = localStorage.getItem(KEY);
    return v === "accepted" || v === "declined" ? v : "unset";
  } catch {
    return "unset";
  }
}

/** Mounts the AdSense loader script once, and only when consent === "accepted".
 *  Idempotent — won't double-load on re-render or cross-tab consent flips. */
function loadAdSense() {
  if (!ADSENSE_CLIENT) return;
  if (document.getElementById("adsbygoogle-loader")) return;
  const s = document.createElement("script");
  s.id = "adsbygoogle-loader";
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.body.appendChild(s);
}

export function CookieConsent() {
  const [consent, setConsent] = useState<Consent>("unset");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const initial = read();
    setConsent(initial);
    if (initial === "accepted") loadAdSense();

    // Sync across tabs.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const v: Consent =
        e.newValue === "accepted" || e.newValue === "declined" ? e.newValue : "unset";
      setConsent(v);
      if (v === "accepted") loadAdSense();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function accept() {
    try {
      localStorage.setItem(KEY, "accepted");
    } catch {
      /* private browsing — fall through, user reconsents next visit */
    }
    setConsent("accepted");
    loadAdSense();
  }

  function decline() {
    try {
      localStorage.setItem(KEY, "declined");
    } catch {
      /* see above */
    }
    setConsent("declined");
  }

  // Avoid hydration flash; render nothing until we know the persisted state.
  if (!hydrated || consent !== "unset") return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-14 inset-x-0 z-50 mx-auto max-w-screen px-3 pb-2"
    >
      <div className="bg-ink-soft border border-ink-line rounded-xl p-3 shadow-lg backdrop-blur">
        <p className="text-[12px] text-white leading-relaxed">
          We use essential cookies for the site to work, and (with your consent) cookies
          from Google AdSense for advertising and Disqus for comments. See our{" "}
          <Link href="/privacy" className="text-barca-gold underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={decline}
            className="text-[11px] font-semibold px-3 py-1.5 rounded ring-1 ring-ink-line text-ink-muted hover:text-white hover:ring-ink-muted"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="text-[11px] font-semibold px-3 py-1.5 rounded bg-barca-blue text-white"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
