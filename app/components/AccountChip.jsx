"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const INK = "var(--ink)";
const MUTED = "var(--muted)";

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ account, size = 28 }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (account.avatarUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Canvas-hosted picture, no optimizing needed
      <img
        src={account.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={style}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-xs font-extrabold"
      style={{ ...style, background: "var(--brand-tint)", color: "var(--brand-text)" }}
      aria-hidden="true"
    >
      {initials(account.name)}
    </span>
  );
}

// Top bar: which Canvas account the dashboard is showing. Its menu also holds Email summary and
// the Dark mode switch (DASH-17), which used to be top bar buttons. Escape or a click outside closes it.
export default function AccountChip({ account, theme, onToggleTheme, digestEnabled, sendingDigest, onEmailSummary }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("button, a")?.focus();
    function onKey(e) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!account) return null;
  const first = (account.shortName || account.name).split(/\s+/)[0];
  const dark = theme === "dark";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu: connected to Canvas as ${account.name}`}
        title={`Connected to Canvas as ${account.name}`}
        className={`btn btn-secondary h-[38px] gap-1.5 pl-1.5 pr-2.5 text-sm ${open ? "account-open" : ""}`}
      >
        <Avatar account={account} />
        <span className="max-w-[9rem] truncate">{first}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: MUTED }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <button aria-label="Close" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div ref={menuRef} role="group" aria-label="Account" className="account-menu panel step-in absolute right-0 top-full z-50 mt-2 flex w-[264px] flex-col gap-0.5 p-1.5">
            <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-2.5 pb-2.5 pt-1.5">
              <Avatar account={account} size={34} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold" style={{ color: INK }}>
                  {account.name}
                </p>
                <p className="truncate text-xs" style={{ color: MUTED }} title={[account.login, account.school].filter(Boolean).join(" · ") || undefined}>
                  Connected to Canvas
                </p>
              </div>
            </div>
            {digestEnabled && (
              <button type="button" onClick={onEmailSummary} disabled={sendingDigest} className="menu-item mt-1">
                {MailIcon}
                {sendingDigest ? "Sending…" : "Email summary"}
              </button>
            )}
            <button type="button" role="switch" aria-checked={dark} onClick={onToggleTheme} className={`menu-item ${digestEnabled ? "" : "mt-1"}`}>
              {MoonIcon}
              Dark mode
              <span className="menu-switch ml-auto" aria-hidden="true">
                <span className="menu-knob" />
              </span>
            </button>
            {account.profileUrl && (
              <a href={account.profileUrl} target="_blank" rel="noreferrer" className="menu-item">
                {ArrowIcon}
                Open my Canvas profile
              </a>
            )}
            <Link href="/setup" scroll={false} onClick={() => setOpen(false)} className="menu-item">
              {SwapIcon}
              Change account
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

const icon = (path) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: MUTED }}>
    {path}
  </svg>
);
const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 7l9 6 9-6" />
  </>
);
const MoonIcon = icon(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
const ArrowIcon = icon(<path d="M7 17L17 7M9 7h8v8" />);
const SwapIcon = icon(<path d="M7 7h11l-3-3M17 17H6l3 3" />);
