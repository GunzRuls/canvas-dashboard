"use client";

import { useEffect, useRef, useState } from "react";

// "Sending you to Canvas": this card confirms where an outside link goes, then opens it in a
// pop-up window centered over the dashboard (DASH-9) instead of a full browser window. It listens
// for clicks on any outside link in the whole app and can't be clicked (pointer-events: none).
// The pop-up takes focus the moment it opens, which would hide the card, so a plain click shows
// the card first and opens the page when its bar fills (OPEN_MS; the user asked to see it).
// Ctrl/Shift/Alt/middle clicks still open normally right away, with no card. Clicks another
// handler already took (Quick look calls preventDefault) are left alone.

const OPEN_MS = 1400; // the bar fills in this time (.redirect-bar in globals.css), then the page opens
const SHOW_MS = OPEN_MS + 300; // the card stays a moment after the page opens, then fades
const FADE_MS = 200;
const POPUP_NAME = "dashboard-peek"; // one named window, so repeated clicks reuse it instead of piling up

// Opens `href` in the pop-up window: about 85% of the dashboard window (at least 900x650, at most
// the screen), centered over it. It shares the browser's Canvas sign in, so Check in works.
function openPopup(href) {
  const scr = window.screen;
  const width = Math.min(Math.max(900, Math.round(window.outerWidth * 0.85)), scr.availWidth || 9999);
  const height = Math.min(Math.max(650, Math.round(window.outerHeight * 0.85)), scr.availHeight || 9999);
  // Centered on the dashboard window, but kept on the screen.
  const minX = scr.availLeft || 0;
  const minY = scr.availTop || 0;
  const clamp = (v, lo, size, avail) => Math.round(Math.min(Math.max(v, lo), lo + Math.max(0, (avail || size) - size)));
  const left = clamp(window.screenX + (window.outerWidth - width) / 2, minX, width, scr.availWidth);
  const top = clamp(window.screenY + (window.outerHeight - height) / 2, minY, height, scr.availHeight);
  // An empty address opens a blank pop-up (or finds the one already open without reloading it).
  // The blank page is still ours, so its link back to the dashboard (opener) can be cut before
  // the outside page loads; that page then can't steer the dashboard window.
  const win = window.open("", POPUP_NAME, `popup,width=${width},height=${height},left=${left},top=${top}`);
  if (!win) {
    window.open(href, "_blank", "noopener,noreferrer"); // pop-ups blocked: open it the old way
    return;
  }
  try {
    win.opener = null;
  } catch {} // a reused window already shows another site; its link was cut when it first opened
  win.location.href = href;
  win.focus();
}

// Link texts that don't say anything on their own ("Open", "Grades"...).
const GENERIC = /^(open|open in canvas|grades|check in( now)?|view|link|here)$/i;

// Friendly names for non-Canvas sites; anything else shows its web address.
const SITES = [
  [/(^|\.)calendar\.google\.com$/, "Google Calendar"],
  [/(^|\.)mail\.google\.com$/, "Gmail"],
  [/(^|\.)google\.com$/, "Google"],
  [/^outlook\.(live|office)\.com$/, "Outlook"],
  [/(^|\.)github\.com$/, "GitHub"],
  [/(^|\.)resend\.com$/, "Resend"],
];

function clean(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function siteName(host) {
  for (const [re, name] of SITES) if (re.test(host)) return name;
  return host.replace(/^www\./, "");
}

// Canvas pages live under these paths; schools often use their own address, not *.instructure.com.
function isCanvas(url) {
  if (SITES.some(([re]) => re.test(url.hostname))) return false;
  return /(^|\.)instructure\.com$/.test(url.hostname) || /^\/(courses|profile)(\/|$)/.test(url.pathname);
}

// Names the Canvas page from its address.
function canvasPage(url, link) {
  const p = url.pathname;
  if (/^\/courses\/\d+\/?$/.test(p)) return "Course home";
  if (/\/grades(\/|$)/.test(p)) return "Grades";
  if (/\/external_tools\//.test(p)) return "Check in";
  if (/\/quizzes\//.test(p)) return "Quiz";
  if (/\/discussion_topics\//.test(p) || /\/announcements(\/|$)/.test(p)) {
    const inAnnouncements = link.closest('[aria-labelledby="announcements-heading"]');
    return inAnnouncements || /^announcement/i.test(clean(link.textContent)) ? "Announcement" : "Discussion";
  }
  if (/\/assignments(\/|$)/.test(p)) return "Assignment";
  if (/\/pages\//.test(p)) return "Page";
  if (/\/files(\/|$)/.test(p)) return "File";
  if (/\/modules(\/|$)/.test(p)) return "Modules";
  if (/^\/profile/.test(p)) return "Profile";
  if (/^\/calendar/.test(p)) return "Calendar";
  if (/^\/conversations/.test(p)) return "Inbox";
  return "Canvas";
}

// The class name, read from the class's own "course home" link elsewhere on the page
// (grade tile or next-class card), so this works without any extra data from the server.
function courseName(url) {
  const m = url.pathname.match(/^\/courses\/(\d+)/);
  if (!m) return "";
  const home = `${url.origin}/courses/${m[1]}`;
  for (const a of document.querySelectorAll("a[href]")) {
    if (a.href.replace(/\/$/, "") !== home) continue;
    const text = clean(a.textContent);
    if (text && !GENERIC.test(text)) return text;
    const fromTitle = (a.title || "").match(/^Open (.+) in Canvas$/);
    if (fromTitle) return fromTitle[1];
  }
  return "";
}

// What the link itself says: its visible text, or its label/title when it has no text.
function linkLabel(link) {
  const text = clean(link.textContent).replace(/^Announcement:\s*/i, "");
  const label = text || clean(link.getAttribute("aria-label")) || clean(link.title);
  if (label && label.length <= 120 && !GENERIC.test(label)) return label;
  // A plain "Open" button: borrow the title from another link to the same page (the card's title).
  for (const a of document.querySelectorAll("a[href]")) {
    if (a === link || a.href !== link.href) continue;
    const other = clean(a.textContent).replace(/^Announcement:\s*/i, "");
    if (other && other.length <= 120 && !GENERIC.test(other)) return other;
  }
  return "";
}

function describe(link, url) {
  // The class color, when the link sits inside something colored by class (--c).
  const color = getComputedStyle(link).getPropertyValue("--c").trim() || "var(--brand)";

  if (!isCanvas(url)) {
    const site = siteName(url.hostname);
    return { site, dest: linkLabel(link) || site, sub: url.hostname.replace(/^www\./, ""), color };
  }

  const page = canvasPage(url, link);
  const course = courseName(url);
  const label = linkLabel(link);
  if (page === "Course home") return { site: "Canvas", dest: course || label || page, sub: page, color };
  if (page === "Grades" || page === "Check in") return { site: "Canvas", dest: page, sub: course, color };
  if (label && label !== course) return { site: "Canvas", dest: label, sub: [course, page].filter(Boolean).join(" · "), color };
  return { site: "Canvas", dest: page, sub: course, color };
}

export default function RedirectCard() {
  const [go, setGo] = useState(null); // { id, site, dest, sub, color, leaving }
  const timers = useRef([]);

  useEffect(() => {
    function onClick(e) {
      // Bubble phase on window, so a click another handler cancelled is ignored.
      if (e.defaultPrevented || e.button !== 0) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      // data-no-redirect: links that should just do their own thing (Quick look's Download).
      if (!link || link.target !== "_blank" || link.hasAttribute("data-no-redirect")) return;
      let url;
      try {
        url = new URL(link.href);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // "open in new tab" style clicks: no card, no delay

      e.preventDefault();
      const info = describe(link, url);
      timers.current.forEach(clearTimeout);
      setGo({ ...info, id: Date.now(), leaving: false });
      timers.current = [
        // Still inside the click's permission window, so the browser allows it.
        setTimeout(() => openPopup(url.href), OPEN_MS),
        setTimeout(() => setGo((g) => g && { ...g, leaving: true }), SHOW_MS),
        setTimeout(() => setGo(null), SHOW_MS + FADE_MS),
      ];
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  return (
    // The live region stays mounted so screen readers reliably announce each new message.
    <div role="status" aria-live="polite" className="redirect-root">
      {go && (
        <div key={go.id} className={`redirect-layer${go.leaving ? " redirect-leaving" : ""}`} style={{ "--c": go.color }}>
          <div className="redirect-backdrop" aria-hidden="true" />
          <div className="redirect-card">
            <div className="flex items-center gap-3.5">
              <div className="c-dot grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" aria-hidden="true">
                <svg className="redirect-nudge" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="c-text text-xs font-extrabold uppercase tracking-[1px]">Sending you to {go.site}</p>
                <p className="font-display mt-[3px] truncate text-[19px] font-extrabold leading-tight" style={{ color: "var(--ink)" }}>
                  {go.dest}
                </p>
                {go.sub && (
                  <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--muted)" }}>
                    {go.sub}
                  </p>
                )}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden="true">
              <div className="redirect-bar c-dot h-1.5 rounded-full" />
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Opening in a pop-up window over the dashboard…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
