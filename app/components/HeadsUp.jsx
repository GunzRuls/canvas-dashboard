"use client";

import { useState } from "react";
import { ViewLink } from "./ViewTabs";
import { countdown } from "@/lib/exams";
import { dayRange, weekStart, HEAVY_RATIO, MIN_ITEMS } from "@/lib/crunch";
import { displayCode } from "@/lib/courseNames";

const INK = "var(--ink)";
const MUTED = "var(--muted)";

const PILL = {
  red: { background: "var(--red-bg)", color: "var(--red-fg)" },
  amber: { background: "var(--amber-bg)", color: "var(--amber-fg)" },
  calm: { background: "var(--blue-bg)", color: "var(--blue-fg)" },
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "Tue, Oct 6 · 8:00 AM", or just the day when the time isn't known.
export function examWhen(ms, hasTime) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return hasTime ? `${day} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : day;
}

// The time line under an exam: "8:00 AM", or a plain note when only the day is known.
export function examTime(exam) {
  if (!exam.hasTime) return "Time TBA";
  return new Date(exam.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function countdownStyle(exam) {
  const pill = countdown(exam.daysAway);
  return { text: pill.text, style: PILL[pill.tone] };
}

// The date tile in the class's tint: TUE / 6 / Oct.
export function DateTile({ ms }) {
  const d = new Date(ms);
  return (
    <div className="c-tint c-text flex w-[42px] shrink-0 flex-col items-center rounded-xl pb-1.5 pt-[5px] leading-none" aria-hidden="true">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.06em]">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span className="font-display mt-[3px] text-xl font-extrabold">{d.getDate()}</span>
      <span className="mt-0.5 text-[10px] font-bold">{d.toLocaleDateString(undefined, { month: "short" })}</span>
    </div>
  );
}

// How an exam opens: its board card or its announcement in Quick look, else nothing.
export function examLink(exam, onLookItem, onLookAnnouncement) {
  const href = exam.item?.url || exam.announcement?.url || null;
  const onClick = exam.item ? (e) => onLookItem(e, exam.item) : exam.announcement ? (e) => onLookAnnouncement(e, exam.announcement) : undefined;
  return { href, onClick };
}

// Heads up (DASH-13/14, now the first part of Incoming, DASH-15): exams in the next 3 weeks with a
// date tile and countdown, the next two weeks' workload, and a link to plan ahead in This term.
export default function HeadsUp({ ready, exams, crunch, courses, now, onLookItem, onLookAnnouncement }) {
  const [crunchOpen, setCrunchOpen] = useState(false);
  if (!ready) return <div className="h-40" aria-hidden="true" />;

  const courseById = Object.fromEntries(courses.map((c) => [String(c.id), c]));
  const heavy = crunch.heavy;

  return (
    <>
      <div className="flex items-center gap-2 px-3.5 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "var(--brand-text)" }}>
        <span>Exams</span>
        <span className="h-px flex-1" style={{ background: "var(--brand-ring)" }} />
        <span>{exams.length}</span>
      </div>
      {exams.length === 0 && (
        <p className="border-b border-[var(--chip)] px-3.5 pb-3 pt-1 text-[13px]" style={{ color: MUTED }}>
          No exams in the next 3 weeks.
        </p>
      )}
      {exams.map((exam) => (
        <ExamRow key={exam.id} exam={exam} course={courseById[String(exam.courseId)]} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
      ))}

      {heavy ? (
        <div className="mx-2.5 my-2.5 flex-none rounded-[14px]" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
          <button
            onClick={() => setCrunchOpen(!crunchOpen)}
            aria-expanded={crunchOpen}
            className="incoming-crunch flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left"
            title={`Heavy = at least ${MIN_ITEMS} things left worth ${HEAVY_RATIO}x a normal week this term (about ${Math.round(crunch.normal)} pts). Click to see them.`}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-sm font-extrabold" style={{ background: "var(--amber-fg)", color: "var(--amber-bg)" }} aria-hidden="true">
              !
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-[13.5px] font-extrabold">Heavy week ahead</span>
              <span className="truncate text-xs font-semibold tabular-nums">
                {dayRange(heavy.firstDue, heavy.lastDue)} · {plural(heavy.count, "item")} · {Math.round(heavy.points)} pts
              </span>
            </span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="headsup-caret h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {crunchOpen && (
            <div className="flex flex-col gap-1.5 px-3 pb-2.5">
              {heavy.items.map((i) => {
                const course = courseById[String(i.courseId)];
                return (
                  <div key={i.key} className="flex min-w-0 items-center gap-[7px] text-[12.5px]" style={{ "--c": course?.color || "var(--muted)" }}>
                    <span className="c-dot h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />
                    {i.url ? (
                      <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => onLookItem(e, i)} className="min-w-0 flex-1 truncate font-semibold hover:underline" style={{ color: INK }} title={i.title}>
                        {i.title}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: INK }}>
                        {i.title}
                      </span>
                    )}
                    <span className="shrink-0 text-xs font-bold tabular-nums">
                      {new Date(i.dueAt).toLocaleDateString(undefined, { weekday: "short" })}
                      {i.points > 0 ? ` · ${Math.round(i.points)} pts` : ""}
                    </span>
                  </div>
                );
              })}
              {weekStart(heavy.firstDue) > weekStart(now) && <p className="mt-1 text-[11.5px] font-bold">Tip: start one this weekend.</p>}
            </div>
          )}
        </div>
      ) : (
        <p
          className="flex flex-none items-center gap-2 px-3.5 pb-3.5 pt-3 text-[13px] font-semibold"
          style={{ color: "var(--ink-soft)" }}
          title={`A week is flagged when it has at least ${MIN_ITEMS} things left worth ${HEAVY_RATIO}x a normal week's points.`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: "var(--green-bg)", color: "var(--green-fg)" }} aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          Next two weeks look normal
        </p>
      )}

      <ViewLink view="term" className="text-link flex flex-none items-center gap-1.5 border-t border-[var(--chip)] px-3.5 pb-3 pt-2.5 text-[13px] font-bold" style={{ color: "var(--brand-text)" }}>
        Plan ahead in This term
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </ViewLink>
    </>
  );
}

// One exam: date tile, title and countdown, class name and code, then the time and up to 2
// related links (its announcement, a review session, a practice exam).
function ExamRow({ exam, course, onLookItem, onLookAnnouncement }) {
  const pill = countdownStyle(exam);
  const code = displayCode(course);
  const name = course?.name || "Class";
  const { href, onClick } = examLink(exam, onLookItem, onLookAnnouncement);

  return (
    <article className="incoming-row flex flex-none items-start gap-3 border-b border-[var(--chip)] px-3.5 py-2.5" style={{ "--c": course?.color || "var(--muted)" }}>
      <DateTile ms={exam.day} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-2">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className="font-display min-w-0 truncate text-[15px] font-bold hover:underline" style={{ color: INK }} title={exam.title}>
              {exam.title}
            </a>
          ) : (
            <span className="font-display min-w-0 truncate text-[15px] font-bold" style={{ color: INK }} title={exam.title}>
              {exam.title}
            </span>
          )}
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-[7px] px-2 py-0.5 text-[11px] font-extrabold" style={pill.style} title={examWhen(exam.at, exam.hasTime)}>
            {pill.text}
          </span>
        </div>
        <div className="c-text flex min-w-0 items-center gap-1.5 text-xs font-bold">
          <span className="c-dot h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />
          <span className="min-w-0 truncate" title={code ? `${name} (${code})` : name}>
            {name}
          </span>
          {code && (
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: MUTED }}>
              {code}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <span className="shrink-0">{examTime(exam)}</span>
          <span className="ml-auto flex min-w-0 gap-1">
            {exam.related.map((r, i) => (
              <Related key={i} r={r} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
            ))}
          </span>
        </div>
      </div>
    </article>
  );
}

const shortDay = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });

// A small chip: an announcement (opens in Quick look), a review session (class tint), or a
// practice exam on the board. Short labels; the full text is on hover.
export function Related({ r, onLookItem, onLookAnnouncement }) {
  const chip = "flex min-w-0 max-w-[9.5rem] shrink items-center gap-1 rounded-md px-[7px] py-px text-[11px] font-extrabold";
  let label;
  let full;
  let href = null;
  let onClick;
  let tone;
  if (r.kind === "review") {
    label = `Review ${shortDay(r.at)}`;
    full = `${r.title} · ${examWhen(r.at, r.hasTime)}`;
    tone = "c-tint c-text";
    if (r.announcement) {
      href = r.announcement.url;
      onClick = (e) => onLookAnnouncement(e, r.announcement);
    }
  } else if (r.kind === "announcement") {
    label = "Announcement";
    full = `Announcement: ${r.announcement.title}`;
    tone = "headsup-chip-news";
    href = r.announcement.url;
    onClick = (e) => onLookAnnouncement(e, r.announcement);
  } else {
    label = r.item.title;
    full = r.item.title;
    tone = "headsup-chip";
    href = r.item.url;
    onClick = (e) => onLookItem(e, r.item);
  }
  if (!href) {
    return (
      <span className={`${chip} ${tone}`} title={full}>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={`${chip} ${tone} chip-btn`} title={full}>
      <span className="truncate">{label}</span>
    </a>
  );
}
