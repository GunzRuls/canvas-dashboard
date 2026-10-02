"use client";

import { useLayoutEffect, useRef, useState } from "react";

// The two tabs (DASH-17) and their URLs. Both are drawn by the same Dashboard in
// app/(dash)/layout.js, which already has every bit of data, so switching tabs happens in the
// browser: history.pushState changes the URL (Next keeps usePathname in sync) and Dashboard shows
// the other tab. No server request, no loading screen. Back/forward work the same way, and a
// direct load of "/" or "/term" still renders that tab on the server.
export const VIEW_PATHS = { today: "/", term: "/term" };

// "today" | "term" for a dashboard URL, or null for anything else (like /setup under the Settings pop-up).
export function viewForPath(pathname) {
  if (pathname === "/term") return "term";
  if (pathname === "/") return "today";
  return null;
}

// Moves to a tab without asking the server. Ctrl/Shift/middle clicks keep the plain link (new tab).
function onViewClick(e, view) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const href = VIEW_PATHS[view];
  if (window.location.pathname !== href) window.history.pushState(null, "", href);
}

// A link to a tab that switches in place (for example "Plan ahead in This term").
export function ViewLink({ view, children, ...props }) {
  return (
    <a href={VIEW_PATHS[view]} onClick={(e) => onViewClick(e, view)} {...props}>
      {children}
    </a>
  );
}

// The Today | This term pill in the top bar. The dark pill behind the current tab slides to the
// other tab when you switch (the reduced-motion rule in globals.css turns the slide off).
export default function ViewTabs({ view }) {
  const navRef = useRef(null);
  const [pill, setPill] = useState(null); // { x, w } of the current tab, measured after mount

  useLayoutEffect(() => {
    const nav = navRef.current;
    const place = () => {
      const tab = nav?.querySelector('.view-tab[aria-current="page"]');
      if (tab) setPill({ x: tab.offsetLeft, w: tab.offsetWidth });
    };
    place();
    // Fonts finishing loading or the window wrapping can change the tabs' widths.
    const ro = new ResizeObserver(place);
    if (nav) ro.observe(nav);
    return () => ro.disconnect();
  }, [view]);

  return (
    <nav ref={navRef} aria-label="Views" data-ready={pill ? "" : undefined} className="view-tabs panel flex h-[38px] flex-none gap-0.5 rounded-full p-[3px]">
      {pill && <span className="view-pill" aria-hidden="true" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />}
      <a href={VIEW_PATHS.today} onClick={(e) => onViewClick(e, "today")} className="view-tab" aria-current={view === "today" ? "page" : undefined}>
        Today
      </a>
      <a href={VIEW_PATHS.term} onClick={(e) => onViewClick(e, "term")} className="view-tab" aria-current={view === "term" ? "page" : undefined}>
        This term
      </a>
    </nav>
  );
}
