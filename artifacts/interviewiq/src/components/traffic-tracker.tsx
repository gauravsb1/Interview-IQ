import { useEffect } from "react";
import { useLocation } from "wouter";
import { useRecordPageview } from "@workspace/api-client-react";

const visitorStorageKey = "interviewiq_traffic_id_v1";
const navigationStorageKey = "interviewiq_last_pageview_v1";
const visitorIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey);
    if (existing && visitorIdPattern.test(existing)) return existing;
    if (!window.crypto?.randomUUID) return null;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(visitorStorageKey, id);
    return id;
  } catch {
    return null;
  }
}

export function TrafficTracker() {
  const [location] = useLocation();
  const { mutate } = useRecordPageview();

  useEffect(() => {
    if (!import.meta.env.PROD || location === "/admin" || location.startsWith("/admin/")) return;

    const visitorId = getVisitorId();
    if (!visitorId) return;

    const path = location.split("?", 1)[0].split("#", 1)[0];
    const now = Date.now();
    try {
      const last = window.sessionStorage.getItem(navigationStorageKey);
      if (last) {
        const [lastPath, lastTime] = last.split("|");
        if (lastPath === path && now - Number(lastTime) < 1500) return;
      }
      window.sessionStorage.setItem(navigationStorageKey, `${path}|${now}`);
    } catch {
      // Tracking storage is optional; the visit can still be recorded.
    }

    mutate({ data: { visitorId, pagePath: path } }, { onError: () => {} });
  }, [location, mutate]);

  return null;
}
