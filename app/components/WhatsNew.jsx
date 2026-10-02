"use client";

import { useEffect, useRef, useState } from "react";
import EmptyState from "./EmptyState";

// "What's new" (DASH-10): a top bar button listing what teachers changed since you last looked
// (due dates moved, new work, grades, edits). The server compares each load with the last one
// (lib/changes.js); this only shows the list. Opening it clears the count badge.

const INK = "var(--ink)";
const MUTED = "var(--muted)";

const GROUPS = [
  { kind: "moved", title: "Due date moved" },
  { kind: "new", title: "New" },
  { kind: "graded", title: "Graded" },
  { kind: "edited", title: "Edited by the teacher" },
  { kind: "removed", title: "Removed" },
];

function day(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function num(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// "Due Thu, Oct 8 → Mon, Oct 12 · later" and friends. Runs only in the browser (your timezone).
export function changeText(c) {
  if (c.kind === "moved") {
    if (!c.from) return `Due date added: ${day(c.to)}`;
    if (!c.to) return `Due date removed (was ${day(c.from)})`;
    const later = new Date(c.to) > new Date(c.from) ? "later" : "earlier";
    const sameDay = day(c.from) === day(c.to);
    const span = sameDay ? `${day(c.from)}, ${clock(c.from)} → ${clock(c.to)}` : `${day(c.from)} → ${day(c.to)}`;
    return `Due ${span} · ${later}`;
  }
  if (c.kind === "graded") {
    const out = c.points ? `/${num(c.points)}` : "";
    if (c.score == null) return "Graded";
    if (c.was != null) return `Grade changed ${num(c.was)} → ${num(c.score)}${out}`;
    return `Graded ${num(c.score)}${out}`;
  }
  if (c.kind === "new") {
    if (c.type === "announcement") return "New announcement";
    return c.to ? `New · due ${day(c.to)}` : "New · no due date";
  }
  if (c.kind === "edited") {
    const parts = [];
    if (c.oldTitle !== undefined) parts.push(`Renamed from “${c.oldTitle}”`);
    if (c.oldPoints !== undefined) parts.push(`Now ${c.points ?? 0} pts (was ${c.oldPoints ?? 0})`);
    return parts.join(" · ") || "Instructions or details edited";
  }
  if (c.kind === "removed") return c.from ? `No longer on Canvas (was due ${day(c.from)})` : "No longer on Canvas";
  return "";
}

function ago(iso, now) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function WhatsNew({ whatsNew, now, courseFor, onOpen }) {
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(whatsNew?.seenAt || null);
  const [lastSeen, setLastSeen] = useState(null); // seenAt before this opening, to mark new rows
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  // Fresh data from the server (Refresh) brings its own seen time.
  const [from, setFrom] = useState(whatsNew);
  if (from !== whatsNew) {
    setFrom(whatsNew);
    setSeenAt(whatsNew?.seenAt || null);
  }

  // Escape closes and gives focus back to the button.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!whatsNew) return null;

  // Hidden classes' changes stay out of the list.
  const changes = (whatsNew.changes || [])
    .filter((c) => courseFor(c.courseId))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const seen = seenAt ? new Date(seenAt).getTime() : 0;
  const unseen = changes.filter((c) => new Date(c.at).getTime() > seen).length;

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function toggle() {
    if (open) return close();
    setLastSeen(seenAt);
    setOpen(true);
    if (unseen > 0) {
      setSeenAt(new Date().toISOString());
      fetch("/api/changes/seen", { method: "POST" })
        .then((r) => r.json())
        .then((data) => data.seenAt && setSeenAt(data.seenAt))
        .catch(() => {});
    }
  }

  const fresh = (c) => new Date(c.at).getTime() > (lastSeen ? new Date(lastSeen).getTime() : 0);
  const label = unseen ? `What's new: ${unseen} new ${unseen === 1 ? "change" : "changes"}` : "What's new";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title="What teachers changed since you last looked"
        className="btn btn-secondary h-[38px] gap-1.5 px-3.5 text-sm"
      >
        What&apos;s new
        {unseen > 0 && (
          <span className="whatsnew-count" aria-hidden="true">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <>
          <button aria-label="Close" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={close} />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="What's new"
            className="panel step-in whatsnew-panel absolute right-0 top-full z-50 mt-2 flex flex-col shadow-lg outline-none"
          >
            <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
              <p className="font-display text-base font-extrabold tracking-tight" style={{ color: INK }}>
                What&apos;s new
              </p>
              <p className="text-[11px] font-semibold" style={{ color: MUTED }}>
                Last 7 days
              </p>
            </div>

            {changes.length === 0 ? (
              <div className="px-4 pb-3">
                <EmptyState kind="todo" title="Nothing new since your last visit" text="Moved due dates, new work and grades will show up here." />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {GROUPS.map((g) => {
                  const list = changes.filter((c) => c.kind === g.kind);
                  if (!list.length) return null;
                  return (
                    <section key={g.kind} className="mb-1.5">
                      <h3 className="px-2 pb-1 pt-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
                        {g.title} <span className="tabular-nums">{list.length}</span>
                      </h3>
                      <ul className="flex flex-col">
                        {list.map((c) => (
                          <li key={c.id}>
                            <ChangeRow
                              change={c}
                              course={courseFor(c.courseId)}
                              now={now}
                              fresh={fresh(c)}
                              onOpen={(e) => {
                                onOpen(e, c);
                                setOpen(false);
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ChangeRow({ change: c, course, now, fresh, onOpen }) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
        <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
        <span className="c-text truncate">{course.name}</span>
        {course.code && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: MUTED }}>
            {course.code}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-semibold" style={{ color: MUTED }}>
          {fresh && <span className="whatsnew-dot" aria-label="New" />}
          {now ? ago(c.at, now) : ""}
        </span>
      </span>
      <span className="block truncate text-sm font-bold leading-snug" style={{ color: INK }} title={c.title}>
        {c.title}
      </span>
      <span className={`whatsnew-change whatsnew-${c.kind} block truncate text-xs`}>{now ? changeText(c) : " "}</span>
    </>
  );
  const className = "row-hover block rounded-lg px-2 py-1.5";
  const style = { "--c": course.color };
  // Removed work has nothing to open any more.
  if (c.kind === "removed" || !c.url) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }
  return (
    <a href={c.url} target="_blank" rel="noreferrer" onClick={onOpen} className={className} style={style}>
      {body}
    </a>
  );
}
