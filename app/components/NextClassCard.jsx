"use client";

import { nextClassCard } from "@/lib/nextClass";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "12 min", "2h 15m"
function span(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function ago(iso, now) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

// How the most urgent item's due time reads, and its color.
function dueLine(item, card, now) {
  const due = new Date(item.dueAt).getTime();
  if (due < now) return { text: `Overdue · was due ${clock(due)}`, tone: "red" };
  if (Math.abs(due - card.start) <= 5 * 60000) return { text: `Due at class time · ${clock(due)}`, tone: "amber" };
  const sameDay = new Date(due).toDateString() === new Date(now).toDateString();
  if (sameDay) return { text: `Due today · ${clock(due)}`, tone: "amber" };
  const day = new Date(due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { text: `Due ${day} · ${clock(due)}`, tone: "gray" };
}

const TONES = {
  red: { bg: "var(--red-bg)", fg: "var(--red-fg)" },
  amber: { bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  gray: { bg: "var(--chip)", fg: "var(--ink-soft)" },
};

function Pill({ children, live, tone = "brand" }) {
  const style =
    tone === "class"
      ? { background: "color-mix(in srgb, var(--c) 14%, var(--surface))", color: "color-mix(in srgb, var(--c) 70%, var(--ink))" }
      : tone === "plain"
      ? { background: "var(--surface-2)", color: "var(--ink-soft)" }
      : { background: "var(--brand-tint)", color: "var(--brand-text)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={style}>
      {live && <span className="live-dot c-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />}
      {children}
    </span>
  );
}

function Row({ href, onClick, icon, tone, title, sub, subColor }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="row-hover-soft group -mx-2 flex gap-2.5 rounded-lg px-2 py-1.5"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-1 text-sm font-bold leading-snug group-hover:underline" style={{ color: INK }}>
          {title}
        </span>
        <span className="text-xs font-semibold" style={{ color: subColor || MUTED }}>
          {sub}
        </span>
      </span>
    </a>
  );
}

const ClockIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const MegaphoneIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);
const ArrowIcon = (
  <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
    <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// The class coming up (or happening now): when, Check in (only during class), the most urgent
// thing due for it, and its newest unread announcement. Class times come from Manage classes
// (or calendar events that mention the class); Canvas itself doesn't have them.
export default function NextClassCard({ now, courses, sessions, items, status, announcements, readIds, onRead, onAddTimes }) {
  if (!now) return <div className="panel min-h-[124px]" />;

  const card = nextClassCard({ courses, sessions, items, status, announcements, readIds, now });

  if (!card) {
    return (
      <section className="panel flex flex-col justify-center gap-2 p-4" style={{ background: "var(--brand-tint)" }} aria-label="Next class">
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
          Next class
        </span>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Add your class times once and this shows your next class, what&apos;s due for it, and Check in while it&apos;s on.
        </p>
        <button type="button" onClick={onAddTimes} className="btn btn-soft self-start px-3.5 py-1.5 text-sm">
          Add class times
        </button>
      </section>
    );
  }

  const { state, course, start, end } = card;
  const highlight = state === "soon" || state === "now";
  const eyebrow = { later: "Next class", soon: "Starting soon", now: "In class now", tomorrow: "Next class" }[state];
  const timeText = `${clock(start)} – ${clock(end)}`;
  const dayName = state === "tomorrow" ? (card.daysAway === 1 ? "Tomorrow" : WEEKDAYS[card.dayLabel]) : null;
  const progress = state === "now" ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;
  const due = card.urgent ? dueLine(card.urgent, card, now) : null;

  return (
    <section
      className="panel flex flex-col gap-3 p-4 transition-shadow"
      style={{
        "--c": course.color,
        // Tinted in the class color so it stands apart from the white panels around it.
        background: "color-mix(in srgb, var(--c) 13%, var(--surface))",
        boxShadow: highlight ? `0 0 0 2px ${course.color}, 0 8px 22px var(--shadow)` : undefined,
      }}
      aria-label={eyebrow}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${highlight ? "c-text" : ""}`} style={highlight ? undefined : { color: MUTED }}>
          {eyebrow}
        </span>
        {state === "later" && <Pill>in {span(start - now)}</Pill>}
        {state === "soon" && (
          <Pill tone="class" live>
            in {span(start - now)}
          </Pill>
        )}
        {state === "now" && (
          <Pill tone="class" live>
            ends in {span(end - now)}
          </Pill>
        )}
        {state === "tomorrow" && <Pill tone="plain">{dayName}</Pill>}
      </div>

      <div>
        <a
          href={course.homeUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 hover:underline"
          title={`Open ${course.name} in Canvas`}
        >
          <span className="c-dot h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
          <span className="font-display line-clamp-2 text-lg font-extrabold leading-tight tracking-tight" style={{ color: INK }}>
            {course.name}
          </span>
        </a>
        <p className="ml-[18px] mt-0.5 text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
          {dayName && state === "tomorrow" ? `${dayName.slice(0, 3)} · ` : ""}
          {timeText}
        </p>
        {state === "now" && (
          <div className="c-tint mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <div className="c-dot h-1.5 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Check in only while class is on. */}
      {state === "now" && card.checkInUrl && (
        <a
          href={card.checkInUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-class h-11 text-[15px]"
          title="Open A+ Attendance for this class"
        >
          Check in now {ArrowIcon}
        </a>
      )}

      {(card.urgent || card.announcement) && (
        <div className="flex flex-col">
          {card.urgent && (
            <Row
              href={card.urgent.url}
              icon={ClockIcon}
              tone={TONES[due.tone]}
              title={card.urgent.title}
              sub={due.text}
              subColor={due.tone === "gray" ? MUTED : TONES[due.tone].fg}
            />
          )}
          {card.announcement && (
            <Row
              href={card.announcement.url}
              onClick={() => onRead(card.announcement)}
              icon={MegaphoneIcon}
              tone={{ bg: "var(--purple-bg)", fg: "var(--purple-fg)" }}
              title={card.announcement.title}
              sub={`Announcement · ${ago(card.announcement.postedAt, now)}`}
            />
          )}
        </div>
      )}
      {!card.urgent && !card.announcement && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "color-mix(in srgb, var(--surface) 70%, transparent)", color: MUTED }}>
          Nothing due for this class this week.
        </p>
      )}
      {card.moreDueThisWeek > 0 && (
        <p className="-mt-1 text-xs" style={{ color: MUTED }}>
          +{card.moreDueThisWeek} more due for this class this week
        </p>
      )}
    </section>
  );
}
