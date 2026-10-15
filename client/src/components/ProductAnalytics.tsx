import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import {
  analyticsAreaForPath,
  captureProductEvent,
  configureProductAnalytics,
  disableProductAnalytics,
  type ProductAnalyticsStatus,
} from "@/lib/productAnalytics";
import { COOKIE_CONSENT_CHANGED_EVENT, hasOptionalCookieConsent } from "@/lib/cookieConsent";

export function ProductAnalytics() {
  const { user, registerPreLogoutCallback, unregisterPreLogoutCallback } = useAuth();
  const [location] = useLocation();
  const readyRef = useRef(false);
  const lastAreaRef = useRef<string | null>(null);
  const sessionSubjectRef = useRef<string | null>(null);
  const [cookieConsent, setCookieConsent] = useState(hasOptionalCookieConsent);
  const { data } = useQuery<ProductAnalyticsStatus>({
    queryKey: ["/api/product-analytics"],
    enabled: Boolean(user?.id) && cookieConsent,
    staleTime: 30_000,
  });

  useEffect(() => {
    const syncConsent = () => setCookieConsent(hasOptionalCookieConsent());
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncConsent);
  }, []);

  useEffect(() => {
    if (cookieConsent) return;
    readyRef.current = false;
    sessionSubjectRef.current = null;
    void disableProductAnalytics();
  }, [cookieConsent]);

  useEffect(() => {
    if (!cookieConsent || !data) return;
    let active = true;
    void configureProductAnalytics(data).then((ready) => {
      if (!active) return;
      readyRef.current = ready;
      if (ready && data.capture && sessionSubjectRef.current !== data.capture.distinctId) {
        sessionSubjectRef.current = data.capture.distinctId;
        captureProductEvent("lyfeos_session_started");
      }
      const area = analyticsAreaForPath(window.location.pathname);
      if (ready && area && lastAreaRef.current !== area) {
        lastAreaRef.current = area;
        captureProductEvent("lyfeos_area_viewed", { area });
      }
    });
    return () => { active = false; };
  }, [cookieConsent, data?.enabled, data?.capture?.distinctId, data?.capture?.projectKey, data?.capture?.host]);

  useEffect(() => {
    const area = analyticsAreaForPath(location);
    if (!cookieConsent || !readyRef.current || !area || lastAreaRef.current === area) return;
    lastAreaRef.current = area;
    captureProductEvent("lyfeos_area_viewed", { area });
  }, [cookieConsent, location, data?.capture?.distinctId]);

  useEffect(() => {
    registerPreLogoutCallback(disableProductAnalytics);
    return () => unregisterPreLogoutCallback(disableProductAnalytics);
  }, [registerPreLogoutCallback, unregisterPreLogoutCallback]);

  return null;
}
