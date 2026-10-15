export const COOKIE_CONSENT_STORAGE_KEY = "lyfeos.cookie-consent.v1";
export const COOKIE_CONSENT_CHANGED_EVENT = "lyfeos:cookie-consent-changed";

export type CookieConsent = "accepted" | "rejected" | null;

export function readCookieConsent(): CookieConsent {
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function hasOptionalCookieConsent(): boolean {
  return readCookieConsent() === "accepted";
}

export function saveCookieConsent(consent: Exclude<CookieConsent, null>): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, consent);
  } catch {
    // Consent still applies to this page even if it cannot be persisted.
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: consent }));
}
