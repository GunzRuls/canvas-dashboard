"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PALETTE } from "@/lib/palette";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

// Tells SetupForm it's inside the pop-up (so it shows Close instead of "Back to dashboard").
const SettingsModalContext = createContext(null);
export function useSettingsModal() {
  return useContext(SettingsModalContext);
}

// The Settings pop-up. The dashboard's Settings button is a soft link to /setup, which
// app/@modal/(.)setup intercepts and shows here, over the dashboard, instead of loading a whole
// new page. Reloading /setup (or any plain /setup link) still shows the full Settings page.
// Same plumbing as the What-if and Manage classes pop-ups: focus moves in, Tab stays inside,
// Escape or a click outside closes it, the page behind doesn't scroll, and focus returns to the
// Settings button afterwards.
export default function SettingsModal({ children }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const savedRef = useRef(false);

  // Closing goes back in history, which removes the pop-up and leaves the dashboard as it was.
  // After a save, the dashboard refreshes once more so it shows the new settings.
  const close = useCallback(() => {
    if (window.history.length <= 1) {
      router.push("/");
      return;
    }
    if (savedRef.current) {
      window.addEventListener("popstate", () => setTimeout(() => router.refresh(), 0), { once: true });
    }
    router.back();
  }, [router]);

  const value = useMemo(() => ({ close, markSaved: () => (savedRef.current = true) }), [close]);

  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    const node = dialogRef.current;
    const opener = document.activeElement;
    node?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = node.contains(document.activeElement) && document.activeElement !== node;
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
    };
  }, []);

  return (
    <SettingsModalContext.Provider value={value}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button className="modal-backdrop absolute inset-0 cursor-default" onClick={close} aria-label="Close settings" tabIndex={-1} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          tabIndex={-1}
          className="modal-in relative flex max-h-full w-full max-w-[640px] flex-col"
          style={{ outline: "none" }}
        >
          <div
            className="modal-glow flex max-h-full min-h-0 flex-col overflow-hidden rounded-[26px] bg-[var(--bg)]"
            style={{ "--c": "var(--brand)", "--ring-tint": "var(--brand-ring)", color: INK }}
          >
            <div className="flex h-2 shrink-0" aria-hidden="true">
              {PALETTE.slice(0, 6).map((color) => (
                <span key={color} className="flex-1" style={{ background: color }} />
              ))}
            </div>
            {children}
          </div>
        </div>
      </div>
    </SettingsModalContext.Provider>
  );
}

// Title row of the pop-up, with the Close button. Stays put while the settings scroll under it.
export function SettingsModalHeader() {
  const modal = useSettingsModal();
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6">
      <div className="min-w-0">
        <h2 id="settings-title" className="font-display text-[26px] font-extrabold leading-tight">
          Settings
        </h2>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          Everything you enter is saved only on this computer. Your token is only ever sent to Canvas.
        </p>
      </div>
      <button type="button" onClick={modal?.close} className="btn btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
        Close
      </button>
    </div>
  );
}

// Before Canvas is connected there's no dashboard to sit on, so load the full setup page instead.
export function OpenFullSetup() {
  useEffect(() => {
    window.location.replace("/setup");
  }, []);
  return <SettingsSkeleton />;
}

// Shown inside the pop-up for the moment it takes to read your settings (and ask Canvas who
// you are), instead of a full loading screen.
export function SettingsSkeleton() {
  return (
    <>
      <SettingsModalHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-6 pt-2 sm:px-6" role="status" aria-label="Loading settings">
        {[104, 64, 64, 64].map((height, i) => (
          <div key={i} className="settings-skeleton rounded-2xl" style={{ height, background: "var(--surface)" }} />
        ))}
      </div>
    </>
  );
}
