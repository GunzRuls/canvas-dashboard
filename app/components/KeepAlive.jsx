"use client";

import { useEffect } from "react";

// Tells the server this window is still open. When the last window closes, the server
// started by the desktop launcher shuts itself down (see lib/autoStop.js).
export default function KeepAlive() {
  useEffect(() => {
    const ping = () => fetch("/api/alive", { method: "POST", keepalive: true }).catch(() => {});
    const bye = () => navigator.sendBeacon?.("/api/alive?closing=1");
    const onVisible = () => document.visibilityState === "visible" && ping();

    ping();
    const timer = setInterval(ping, 20 * 1000);
    window.addEventListener("pagehide", bye);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", bye);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
