"use client";

import Link from "next/link";
import { useState } from "react";

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

// Top bar: which Canvas account the dashboard is showing. Click for details.
export default function AccountChip({ account }) {
  const [open, setOpen] = useState(false);
  if (!account) return null;
  const first = (account.shortName || account.name).split(/\s+/)[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Connected to Canvas as ${account.name}`}
        title={`Connected to Canvas as ${account.name}`}
        className="btn btn-secondary h-10 gap-2 pl-1.5 pr-3 text-sm"
      >
        <Avatar account={account} />
        <span className="max-w-[9rem] truncate">{first}</span>
      </button>

      {open && (
        <>
          <button aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Canvas account"
            className="panel step-in absolute right-0 top-full z-50 mt-2 w-72 p-4 shadow-lg"
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
              Connected to Canvas as
            </p>
            <div className="mt-2 flex items-center gap-3">
              <Avatar account={account} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold" style={{ color: INK }}>
                  {account.name}
                </p>
                {account.login && (
                  <p className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
                    {account.login}
                  </p>
                )}
                <p className="truncate text-xs" style={{ color: MUTED }}>
                  {account.school}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <a href={account.profileUrl} target="_blank" rel="noreferrer" className="btn btn-soft h-8 flex-1 text-xs">
                Canvas profile
              </a>
              <Link href="/setup" scroll={false} className="btn btn-soft h-8 flex-1 text-xs">
                Change account
              </Link>
            </div>
            <p className="mt-2.5 text-[11px] leading-snug" style={{ color: MUTED }}>
              Not you? Paste your own Canvas token in Settings.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
