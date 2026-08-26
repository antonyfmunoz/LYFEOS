import { useEffect, useRef } from "react";
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

export function ProductAnalytics() {
  const { user, registerPreLogoutCallback, unregisterPreLogoutCallback } = useAuth();
  const [location] = useLocation();
  const readyRef = useRef(false);
  const lastAreaRef = useRef<string | null>(null);
  const sessionSubjectRef = useRef<string | null>(null);
  const { data } = useQuery<ProductAnalyticsStatus>({
    queryKey: ["/api/product-analytics"],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!data) return;
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
  }, [data?.enabled, data?.capture?.distinctId, data?.capture?.projectKey, data?.capture?.host]);

  useEffect(() => {
    const area = analyticsAreaForPath(location);
    if (!readyRef.current || !area || lastAreaRef.current === area) return;
    lastAreaRef.current = area;
    captureProductEvent("lyfeos_area_viewed", { area });
  }, [location, data?.capture?.distinctId]);

  useEffect(() => {
    registerPreLogoutCallback(disableProductAnalytics);
    return () => unregisterPreLogoutCallback(disableProductAnalytics);
  }, [registerPreLogoutCallback, unregisterPreLogoutCallback]);

  return null;
}
