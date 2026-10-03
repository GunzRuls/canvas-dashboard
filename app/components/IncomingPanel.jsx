"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HeadsUp from "./HeadsUp";
import FeedbackList from "./FeedbackList";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const PICK_KEY = "dashboard-incoming";
const SEGS = ["heads", "news", "feedback"];
const FEEDBACK_STALE = 10 * 60 * 1000; // the server keeps the list 10 minutes too

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Your pick from earlier today, if any (try/catch: storage can be blocked).
function savedPick(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(PICK_KEY) || "null");
    if (saved && saved.day === dayKey(now) && SEGS.includes(saved.seg)) return saved.seg;
  } catch {}
  return null;
}

// Incoming (DASH-15), Today's right column: a switch between Heads up (exams and workload), News
// (announcements) and Feedback (teacher comments, CLASS-7). It opens on Heads up when an exam is
// 3 days away or closer, otherwise on News (new feedback doesn't take over); once you pick one,
// that pick stays for the rest of the day.
export default function IncomingPanel({ now, headsUp, courses, filter, onLookItem, onLookAnnouncement, onLookFeedback, newsCount, news, clearAll }) {
  const [picked, setPicked] = useState(null); // { day, seg } picked in this window
  // Teacher comments, asked for after the page has loaded so they never slow it down.
  const [feedback, setFeedback] = useState({ list: null, error: null, at: 0 });
  const [seen, setSeen] = useState(new Set()); // comment ids already viewed (saved on the server)
  const [fresh, setFresh] = useState(new Set()); // new when you opened the tab: their dots stay while you read
  const loading = useRef(false);
  const segRef = useRef(null);

  const examSoon = headsUp.exams.some((x) => x.daysAway <= 3);
  const today = now ? dayKey(now) : null;
  const seg = !now ? null : picked?.day === today ? picked.seg : savedPick(now) || (examSoon ? "heads" : "news");
  useEffect(() => {
    segRef.current = seg;
  }, [seg]);

  const courseIds = new Set(courses.map((c) => String(c.id)));
  const shown = (list) => list.filter((f) => courseIds.has(String(f.courseId)) && (!filter || String(f.courseId) === String(filter)));
  const feedbackList = feedback.list ? shown(feedback.list) : null;
  const unseen = (feedbackList || []).filter((f) => !seen.has(f.id));

  // Viewing Feedback marks what's in it as seen (on this PC only; nothing changes in Canvas).
  const markSeen = useCallback((ids) => {
    if (!ids.length) return;
    setFresh((s) => new Set([...s, ...ids]));
    setSeen((s) => new Set([...s, ...ids]));
    fetch("/api/feedback/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, []);

  const loadFeedback = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setFeedback((s) => ({ ...s, error: null }));
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        const seenIds = new Set(data.seen);
        setFeedback({ list: data.feedback, error: null, at: Date.now() });
        setSeen((s) => new Set([...s, ...seenIds]));
        // Already looking at the Feedback tab: what just arrived counts as seen.
        if (segRef.current === "feedback") markSeen(data.feedback.filter((f) => !seenIds.has(f.id)).map((f) => f.id));
      })
      .catch((e) => setFeedback((s) => ({ ...s, error: e.message || "Something went wrong." })))
      .finally(() => {
        loading.current = false;
      });
  }, [markSeen]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  function pick(next) {
    setPicked({ day: today, seg: next });
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({ day: today, seg: next }));
    } catch {}
    if (next === "feedback") {
      markSeen(unseen.map((f) => f.id));
      // Comments older than 10 minutes are asked for again.
      if (feedback.at && now - feedback.at > FEEDBACK_STALE) loadFeedback();
    }
  }

  const segs = [
    { id: "heads", label: "Heads up", count: headsUp.exams.length },
    { id: "news", label: "News", count: newsCount },
    { id: "feedback", label: "Feedback", count: feedbackList ? unseen.length : null, title: "Teacher comments on your work" },
  ];

  // Arrow keys move between the tabs, as in any tab list.
  function onKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = Math.max(SEGS.indexOf(seg), 0);
    const next = SEGS[(i + (e.key === "ArrowRight" ? 1 : SEGS.length - 1)) % SEGS.length];
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
        {(seg === "heads" || seg === "feedback") && (
          <span className="shrink-0 text-xs font-semibold" style={{ color: MUTED }}>
            {seg === "heads" ? "Next 3 weeks" : "Last 30 days"}
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
            title={s.title}
          >
            {s.label}
            {/* Feedback's number is how many comments are new; it appears once they've loaded. */}
            {s.count !== null && (
              <span className="seg-count" aria-label={s.id === "feedback" ? `${s.count} new` : undefined}>
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div id="incoming-body" role="tabpanel" aria-labelledby={seg ? `incoming-tab-${seg}` : undefined} className="min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
        {seg === "heads" && (
          <div className="panel flex flex-col overflow-hidden">
            <HeadsUp {...headsUp} courses={courses} now={now} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
          </div>
        )}
        {seg === "news" && news}
        {seg === "feedback" && (
          <FeedbackList
            list={feedbackList}
            error={feedbackList ? null : feedback.error}
            courses={courses}
            now={now}
            newIds={fresh}
            onLook={onLookFeedback}
            onRetry={loadFeedback}
          />
        )}
      </div>
    </section>
  );
}
