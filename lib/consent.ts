// Shared consent constants. CookieConsent writes the localStorage key and
// dispatches the event on same-tab accept; ad components (AdsterraBanner)
// listen for it so they can activate without a reload. Cross-tab flips are
// covered separately by the browser's native "storage" event.

export const CONSENT_KEY = "cookie_consent";
export const CONSENT_ACCEPTED_EVENT = "consent:accepted";

export function hasAdConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}
