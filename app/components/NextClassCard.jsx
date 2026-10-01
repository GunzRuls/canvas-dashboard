"use client";

import { nextClassCard } from "@/lib/nextClass";
import { displayCode } from "@/lib/courseNames";

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

// Icon tile per urgency. Red/amber are solid tiles so they read on any class color.
const TILES = { red: "hero-tile-red", amber: "hero-tile-amber", gray: "hero-glass" };

// The card is filled with a bold version of the class color. Deep colors get white text on a
// mix toward ink; light ones (sun, lime, tangerine) would turn muddy brown that way, so they
// keep their bright color and get dark ink text instead. Both keep text at 4.5:1 or better.
const DEEP = [27, 26, 46]; // #1B1A2E, the light theme's ink
const WHITE = [255, 255, 255];
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p))); // = color-mix in srgb
const css = (c, alpha = 1) => `rgba(${c.join(", ")}, ${alpha})`;
function luminance(c) {
  const [r, g, b] = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const SOFT = 0.85; // secondary text is the text color at 85%

// One solid, darker version of the class color with white text, the same style for every class
// (the user asked for no gradient and no separate look for bright colors). Light colors like
// sun and lime simply get darkened more, until the dimmer secondary text still reads at 4.5:1.
function heroColors(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) color = "#3355FF";
  const c = rgb(color);
  const softOn = (bg) => contrast(mix(WHITE, bg, SOFT), bg);
  let p = 0.72; // share of the class color kept; the rest is ink
  while (p > 0.2 && softOn(mix(c, DEEP, p)) < 4.5) p -= 0.02;
  const fill = mix(c, DEEP, p);
  return {
    "--hero-top": css(fill), // top and bottom are the same color: a solid fill
    "--hero-bot": css(fill),
    "--hero-fg": "#FFFFFF",
    "--hero-soft": css(WHITE, SOFT),
    "--hero-glass": css(DEEP, 0.22), // darker, so white text on it gets more contrast, not less
    "--hero-hover": css(DEEP, 0.16),
    "--hero-track": css(WHITE, 0.25),
    "--hero-btn-bg": "#FFFFFF",
    "--hero-btn-fg": css(fill),
    "--hero-btn-hover": css(mix(WHITE, c, 0.88)),
    "--hero-btn-edge": css(DEEP, 0.35),
  };
}

function Pill({ children, live, solid }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${solid ? "" : "hero-glass"}`}
      style={solid ? { background: "var(--hero-fg)", color: "var(--hero-bot)" } : { color: "var(--hero-fg)" }}
    >
      {live && <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

function Row({ href, onClick, icon, tile, title, sub, strong }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className="hero-row group -mx-2 flex gap-2.5 rounded-lg px-2 py-1.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tile}`} aria-hidden="true">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-1 text-sm font-bold leading-snug group-hover:underline">{title}</span>
        <span className={`text-xs ${strong ? "font-extrabold" : "hero-soft font-semibold"}`}>{sub}</span>
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

// The empty card uses the brand blue (light theme's --brand) in both themes, like a class color.
const BRAND_FILL = heroColors("#3355FF");

// The class coming up (or happening now): when, Check in (only during class), the most urgent
// thing due for it, and its newest unread announcement. Class times come from Manage classes
// (or calendar events that mention the class); Canvas itself doesn't have them.
// The card is filled with the class color so it stands out from the panels around it.
export default function NextClassCard({ now, courses, sessions, items, status, announcements, readIds, onRead, onAddTimes }) {
  if (!now) return <div className="panel min-h-[124px]" />;

  const card = nextClassCard({ courses, sessions, items, status, announcements, readIds, now });

  if (!card) {
    return (
      <section className="hero-card flex flex-col justify-center gap-2 p-4" style={BRAND_FILL} aria-label="Next class">
        <span className="hero-soft text-[11px] font-extrabold uppercase tracking-wide">Next class</span>
        <p className="text-sm font-semibold">
          Add your class times once and this shows your next class, what&apos;s due for it, and Check in while it&apos;s on.
        </p>
        <button type="button" onClick={onAddTimes} className="btn hero-btn self-start px-3.5 py-1.5 text-sm">
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
  const code = displayCode(course);

  return (
    <section
      className={`hero-card flex flex-col gap-3 p-4 ${highlight ? "hero-live" : ""}`}
      style={{ "--c": course.color, ...heroColors(course.color) }}
      aria-label={eyebrow}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${highlight ? "" : "hero-soft"}`}>{eyebrow}</span>
        {state === "later" && <Pill>in {span(start - now)}</Pill>}
        {state === "soon" && (
          <Pill solid live>
            in {span(start - now)}
          </Pill>
        )}
        {state === "now" && (
          <Pill solid live>
            ends in {span(end - now)}
          </Pill>
        )}
        {state === "tomorrow" && <Pill>{dayName}</Pill>}
      </div>

      <div>
        <a
          href={course.homeUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 hover:underline"
          title={`Open ${course.name} in Canvas`}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          <span className="font-display line-clamp-2 text-lg font-extrabold leading-tight tracking-tight">{course.name}</span>
        </a>
        <p className="hero-soft ml-[18px] mt-0.5 text-sm font-semibold tabular-nums">
          {code && (
            <>
              <span className="font-extrabold" style={{ color: "var(--hero-fg)" }}>
                {code}
              </span>
              {" · "}
            </>
          )}
          {/* The pill already says "Tomorrow"; other days get a short weekday here. */}
          {state === "tomorrow" && card.daysAway !== 1 ? `${dayName.slice(0, 3)} · ` : ""}
          {timeText}
        </p>
        {state === "now" && (
          <div className="hero-track mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-current" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Check in only while class is on. */}
      {state === "now" && card.checkInUrl && (
        <a
          href={card.checkInUrl}
          target="_blank"
          rel="noreferrer"
          className="btn hero-btn h-11 text-[15px]"
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
              tile={TILES[due.tone]}
              title={card.urgent.title}
              sub={due.text}
              strong={due.tone !== "gray"}
            />
          )}
          {card.announcement && (
            <Row
              href={card.announcement.url}
              onClick={() => onRead(card.announcement)}
              icon={MegaphoneIcon}
              tile="hero-glass"
              title={card.announcement.title}
              sub={`Announcement · ${ago(card.announcement.postedAt, now)}`}
            />
          )}
        </div>
      )}
      {!card.urgent && !card.announcement && (
        <p className="hero-glass rounded-lg px-3 py-2 text-xs font-semibold">Nothing due for this class this week.</p>
      )}
      {card.moreDueThisWeek > 0 && (
        <p className="hero-soft -mt-1 text-xs font-semibold">+{card.moreDueThisWeek} more due for this class this week</p>
      )}
    </section>
  );
}
