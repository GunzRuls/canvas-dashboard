"use client";

import { useMemo, useState } from "react";
import { findExams, countdown } from "@/lib/exams";
import { findCrunch, dayRange, HEAVY_RATIO, MIN_ITEMS } from "@/lib/crunch";
import { displayCode } from "@/lib/courseNames";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const OPEN_KEY = "dashboard-headsup-open";
const SHOWN = 2; // exams shown before "N more", so the Grades list keeps its room

const PILL = {
  red: { background: "var(--red-bg)", color: "var(--red-fg)" },
  amber: { background: "var(--amber-bg)", color: "var(--amber-fg)" },
  calm: { background: "var(--blue-bg)", color: "var(--blue-fg)" },
};

// Short, for the exam line: "Tue 10/6 · 8 AM", "Wed 10/7 · 9:30 AM", or just the day.
function whenShort(ms, hasTime) {
  const d = new Date(ms);
  const day = `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}`;
  if (!hasTime) return day;
  const time = d.toLocaleTimeString(undefined, d.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  return `${day} · ${time}`;
}

// "Tue, Oct 6 · 8:00 AM", or just the day when the time isn't known.
function when(ms, hasTime) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return hasTime ? `${day} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : day;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Heads up (DASH-13/14), in the sidebar under Next class: exams in the next 3 weeks with a
// countdown, and one line about the next two weeks' workload. Folds up to its heading.
export default function HeadsUpCard({ now, courses, items, status, announcements, events, onLookItem, onLookAnnouncement }) {
  // Folded or not is remembered. (The panel only draws after load, so reading it here is safe.)
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [showAll, setShowAll] = useState(false);
  const [crunchOpen, setCrunchOpen] = useState(false);


  // Recomputed when the board changes, and once an hour as days roll over (`now` ticks every minute).
  const hour = now ? Math.floor(now / 3600000) : null;
  const exams = useMemo(
    () => (hour === null ? [] : findExams({ items, announcements, events, courses, status, now })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, announcements, events, courses, status, hour]
  );
  const crunch = useMemo(
    () => (hour === null ? { heavy: null } : findCrunch({ items, status, now })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, status, hour]
  );

  if (!now) return <div className="panel h-[44px]" aria-hidden="true" />;

  const courseById = Object.fromEntries(courses.map((c) => [String(c.id), c]));
  const heavy = crunch.heavy;
  const quiet = exams.length === 0 && !heavy;
  const shown = showAll ? exams : exams.slice(0, SHOWN);

  function toggle(e) {
    const next = e.currentTarget.open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {}
  }

  // Nothing coming up: one slim line instead of a panel full of nothing.
  if (quiet) {
    return (
      <section className="panel flex items-center gap-2 px-4 py-2.5 text-xs font-semibold" style={{ color: MUTED }} aria-label="Heads up">
        <CheckIcon />
        <span>No exams in the next 3 weeks · workload looks normal</span>
      </section>
    );
  }

  const summary = [exams.length ? plural(exams.length, "exam") : null, heavy ? "heavy week" : null].filter(Boolean).join(" · ");

  return (
    <details open={open} onToggle={toggle} className="panel headsup px-2.5 pb-2 pt-1.5">
      <summary className="fold-summary flex items-center justify-between gap-2 px-1.5 py-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="fold-title font-display text-base font-extrabold tracking-tight" style={{ color: INK }}>
            Heads up
          </span>
          <span className="truncate text-xs font-semibold" style={{ color: MUTED }}>
            {summary}
          </span>
        </span>
        <span className="fold-chevron grid h-6 w-6 shrink-0 place-items-center rounded-full text-base font-bold leading-none" style={{ color: MUTED }} aria-hidden="true">
          ›
        </span>
      </summary>

      <div className="flex flex-col pt-0.5">
        {shown.map((exam) => (
          <ExamRow
            key={exam.id}
            exam={exam}
            course={courseById[String(exam.courseId)]}
            onLookItem={onLookItem}
            onLookAnnouncement={onLookAnnouncement}
          />
        ))}

        {/* Bottom: the workload warning (or "normal"), and "N more exams". A warning gets the full
            width; "normal" shares its line with "N more". */}
        {heavy && exams.length > SHOWN && <MoreButton more={exams.length - SHOWN} showAll={showAll} onClick={() => setShowAll(!showAll)} className="self-end" />}
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          {heavy ? (
            <button
              onClick={() => setCrunchOpen(!crunchOpen)}
              aria-expanded={crunchOpen}
              className="headsup-crunch flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs"
              title={`Heavy = at least ${MIN_ITEMS} things left worth ${HEAVY_RATIO}x a normal week this term (about ${Math.round(crunch.normal)} pts). Click to see them.`}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--amber-fg)] text-[11px] font-extrabold text-[var(--surface)]" aria-hidden="true">
                !
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="font-extrabold">Heavy week ahead</span>
                <span className="truncate font-semibold tabular-nums">
                  {dayRange(heavy.firstDue, heavy.lastDue)} · {plural(heavy.count, "item")} · {Math.round(heavy.points)} pts
                </span>
              </span>
              <span className="headsup-caret shrink-0 text-base leading-none" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <p
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-xs font-semibold"
              style={{ color: MUTED }}
              title={`A week is flagged when it has at least ${MIN_ITEMS} things left worth ${HEAVY_RATIO}x a normal week's points.`}
            >
              <CheckIcon />
              <span className="truncate">Next two weeks look normal</span>
            </p>
          )}
          {!heavy && exams.length > SHOWN && <MoreButton more={exams.length - SHOWN} showAll={showAll} onClick={() => setShowAll(!showAll)} />}
        </div>
        {heavy && crunchOpen && (
          <ul className="mt-1 flex flex-col gap-0.5 px-2 pb-0.5">
            {heavy.items.map((i) => {
              const course = courseById[String(i.courseId)];
              return (
                <li key={i.key} className="flex min-w-0 items-center gap-2 text-xs" style={{ "--c": course?.color || "var(--muted)" }}>
                  <span className="c-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => onLookItem(e, i)} className="min-w-0 flex-1 truncate font-semibold hover:underline" style={{ color: "var(--ink-soft)" }} title={i.title}>
                      {i.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--ink-soft)" }}>
                      {i.title}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums" style={{ color: MUTED }}>
                    {new Date(i.dueAt).toLocaleDateString(undefined, { weekday: "short" })}
                    {i.points > 0 ? ` · ${Math.round(i.points)} pts` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

// One exam in two lines: the exam, when and the countdown; then the class (code small) and up
// to 2 related links (its announcement, a review session, a practice exam).
function ExamRow({ exam, course, onLookItem, onLookAnnouncement }) {
  const pill = countdown(exam.daysAway);
  const code = displayCode(course);
  const name = course?.name || "Class";
  const open = exam.item ? (e) => onLookItem(e, exam.item) : exam.announcement ? (e) => onLookAnnouncement(e, exam.announcement) : null;
  const href = exam.item?.url || exam.announcement?.url || null;
  const pillStyle = pill.tone === "calm" && exam.daysAway > 6 ? { background: "var(--chip)", color: MUTED } : PILL[pill.tone];

  return (
    <div className="row-hover flex flex-col gap-0.5 rounded-xl px-2 py-1" style={{ "--c": course?.color || "var(--muted)" }}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" onClick={open} className="min-w-0 truncate text-sm font-bold leading-snug hover:underline" style={{ color: INK }} title={exam.title}>
            {exam.title}
          </a>
        ) : (
          <span className="truncate text-sm font-bold leading-snug" style={{ color: INK }} title={exam.title}>
            {exam.title}
          </span>
        )}
        <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums" style={{ color: MUTED }} title={when(exam.at, exam.hasTime)}>
          {whenShort(exam.at, exam.hasTime)}
        </span>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-extrabold" style={pillStyle}>
          {pill.text}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-3.5 text-xs font-bold">
        <span className="c-text min-w-[3.5rem] truncate" title={code ? `${name} (${code})` : name}>
          {name}
        </span>
        {code && (
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: MUTED }}>
            {code}
          </span>
        )}
        {exam.related.map((r, i) => (
          <Related key={i} r={r} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
        ))}
      </div>
    </div>
  );
}

function MoreButton({ more, showAll, onClick, className = "" }) {
  return (
    <button onClick={onClick} className={`text-link shrink-0 px-1.5 py-0.5 text-xs font-bold underline ${className}`} style={{ color: INK }}>
      {showAll ? "Fewer" : `+${more} more`}
    </button>
  );
}

const shortDay = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });

// A small chip: an announcement (megaphone, opens in Quick look), a review session, or a practice
// exam on the board. Short labels, so they fit beside the class name; the full text is on hover.
function Related({ r, onLookItem, onLookAnnouncement }) {
  const news = r.kind === "announcement" || (r.kind === "review" && r.announcement);
  const chip = `${news ? "headsup-chip-news" : "headsup-chip"} flex min-w-0 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-bold`;
  let label;
  let full;
  let href = null;
  let onClick;
  let icon = null;
  if (r.kind === "review") {
    label = `Review ${shortDay(r.at)}`;
    full = `${r.title} · ${when(r.at, r.hasTime)}`;
    if (r.announcement) {
      href = r.announcement.url;
      onClick = (e) => onLookAnnouncement(e, r.announcement);
    }
  } else if (r.kind === "announcement") {
    label = "Announcement";
    full = `Announcement: ${r.announcement.title}`;
    icon = <MegaphoneIcon />;
    href = r.announcement.url;
    onClick = (e) => onLookAnnouncement(e, r.announcement);
  } else {
    label = r.item.title;
    full = r.item.title;
    href = r.item.url;
    onClick = (e) => onLookItem(e, r.item);
  }
  const body = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span className={chip} title={full}>
        {body}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={`${chip} hover:underline`} title={full}>
      {body}
    </a>
  );
}

function MegaphoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--green-fg)" }}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
