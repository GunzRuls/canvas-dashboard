"use client";

import { useState } from "react";
import HeadsUp from "./HeadsUp";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const PICK_KEY = "dashboard-incoming";

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Your pick from earlier today, if any (try/catch: storage can be blocked).
function savedPick(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(PICK_KEY) || "null");
    if (saved && saved.day === dayKey(now) && (saved.seg === "heads" || saved.seg === "news")) return saved.seg;
  } catch {}
  return null;
}

// Incoming (DASH-15), Today's right column: a switch between Heads up (exams and workload) and
// News (announcements). It opens on Heads up when an exam is 3 days away or closer, otherwise on
// News; once you pick one, that pick stays for the rest of the day. Feedback is coming later.
export default function IncomingPanel({ now, headsUp, courses, onLookItem, onLookAnnouncement, newsCount, news, clearAll }) {
  const [picked, setPicked] = useState(null); // { day, seg } picked in this window

  const examSoon = headsUp.exams.some((x) => x.daysAway <= 3);
  const today = now ? dayKey(now) : null;
  const seg = !now ? null : picked?.day === today ? picked.seg : savedPick(now) || (examSoon ? "heads" : "news");

  function pick(next) {
    setPicked({ day: today, seg: next });
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({ day: today, seg: next }));
    } catch {}
  }

  const segs = [
    { id: "heads", label: "Heads up", count: headsUp.exams.length },
    { id: "news", label: "News", count: newsCount },
  ];

  // Arrow keys move between the two tabs, as in any tab list.
  function onKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = seg === "heads" ? "news" : "heads";
    pick(next);
    document.getElementById(`incoming-tab-${next}`)?.focus();
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2.5" aria-labelledby="incoming-heading">
      {/* Same height as the Assignments heading row, so both lists start on one line. */}
      <div className="flex flex-none items-center justify-between gap-2 md:min-h-[44px]">
        <h2 id="incoming-heading" className="font-display truncate text-xl font-extrabold tracking-tight" style={{ color: INK }}>
          Incoming
        </h2>
        {seg === "news" && clearAll}
        {seg === "heads" && (
          <span className="shrink-0 text-xs font-semibold" style={{ color: MUTED }}>
            Next 3 weeks
          </span>
        )}
      </div>

      <div role="tablist" aria-label="Incoming" onKeyDown={onKey} className="flex flex-none gap-0.5 rounded-full bg-[var(--surface-2)] p-[3px]">
        {segs.map((s) => (
          <button
            key={s.id}
            id={`incoming-tab-${s.id}`}
            role="tab"
            aria-selected={seg === s.id}
            aria-controls="incoming-body"
            tabIndex={seg === s.id || (!seg && s.id === "heads") ? 0 : -1}
            onClick={() => pick(s.id)}
            className="seg"
          >
            {s.label}
            <span className="seg-count">{s.count}</span>
          </button>
        ))}
        {/* Not built yet: looks like a tab, can't be picked. */}
        <span role="tab" aria-selected="false" aria-disabled="true" className="seg" title="Coming soon">
          Feedback
          <span className="seg-soon">Soon</span>
        </span>
      </div>

      <div id="incoming-body" role="tabpanel" aria-labelledby={seg ? `incoming-tab-${seg}` : undefined} className="min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
        {seg === "heads" && (
          <div className="panel flex flex-col overflow-hidden">
            <HeadsUp {...headsUp} courses={courses} now={now} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
          </div>
        )}
        {seg === "news" && news}
      </div>
    </section>
  );
}
