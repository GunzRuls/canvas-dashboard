"use client";

import Link from "next/link";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const HEAVY_DAY = 3; // this many things due in one day gets flagged

function localKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function onDay(e, key) {
  if (!e.allDay) return localKey(e.start) === key;
  return e.end > e.start ? key >= e.start && key < e.end : key === e.start;
}

// The next 7 days as one slim row (Layout A): each day shows its first due item (or event) and
// "+N" for the rest. Hovering a day (or tabbing into it) opens a small list of everything that
// day. Clicking an item opens Quick look (onLook), like the board. Narrow windows wrap the days
// onto 2 or 4 columns.
export default function WeekStrip({ items, status, events, calendarEnabled, calendarError, now, colorFor, nameFor, onLook }) {
  if (!now) return <div className="panel h-[60px] flex-none" />;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <section className="panel relative z-20 flex flex-none flex-col lg:h-[60px] lg:flex-row" aria-label="Next 7 days">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5 lg:w-[128px] lg:flex-col lg:items-start lg:justify-center lg:gap-0.5 lg:border-b-0 lg:border-r lg:py-0">
        <h2 className="font-display text-[15px] font-extrabold leading-tight tracking-tight" style={{ color: INK }}>
          Next 7 days
        </h2>
        {calendarError ? (
          <p className="text-xs font-semibold leading-tight" style={{ color: "var(--red-fg)" }} title={`Your calendar didn't load: ${calendarError}`}>
            Calendar didn&apos;t load
          </p>
        ) : !calendarEnabled ? (
          <Link
            href="/setup"
            scroll={false}
            className="text-link text-xs font-semibold leading-tight underline"
            style={{ color: "var(--ink-soft)" }}
            title="Add your Google or Outlook calendar in Settings to see class events here"
          >
            Add your calendar
          </Link>
        ) : null /* no "N personal events hidden" line: the user found it noisy (DASH-7) */}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 p-1.5 sm:grid-cols-4 lg:grid-cols-7 lg:gap-0 lg:p-0">
        {days.map((day, i) => {
          const key = localKey(day);
          const due = items
            .filter((it) => status[it.key] !== "done" && it.dueAt && localKey(it.dueAt) === key)
            .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
          const dayEvents = events.filter((e) => onDay(e, key));
          const heavy = due.length >= HEAVY_DAY;
          const short = day.toLocaleDateString(undefined, { weekday: "short" });
          const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : short;
          const count = due.length + dayEvents.length;
          const first = due[0] || null;
          const firstEvent = first ? null : dayEvents[0];

          return (
            <div
              key={key}
              className={`week-day group relative flex min-w-0 flex-col justify-center gap-1 rounded-xl px-3 py-2 lg:rounded-none lg:py-0 ${
                i > 0 ? "lg:border-l lg:border-[var(--line)]" : ""
              } ${i === 6 ? "lg:rounded-r-[1.25rem]" : ""}`}
              style={heavy ? { background: "var(--red-bg)" } : undefined}
            >
              <div className="flex min-w-0 items-center justify-between gap-1.5">
                {i === 0 ? (
                  <span className="shrink-0 rounded-full bg-[var(--brand)] px-2 py-px text-xs font-extrabold text-white">{label}</span>
                ) : (
                  <span className="truncate text-[13px] font-bold" style={{ color: INK }}>
                    {/* "Tomorrow" is too wide for the narrowest one-row strip, so it shows the weekday there. */}
                    <span className={i === 1 ? "lg:max-[90rem]:hidden" : ""}>{label}</span>
                    {i === 1 && <span className="hidden lg:max-[90rem]:inline">{short}</span>}
                  </span>
                )}
                <span className="shrink-0 text-xs font-semibold" style={{ color: heavy ? "var(--red-fg)" : MUTED }}>
                  {heavy ? `${due.length} due` : day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>

              <div className="flex min-w-0 items-center gap-1.5 text-xs leading-tight">
                {first && (
                  <a
                    href={first.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => onLook(e, first)}
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                    style={{ "--c": colorFor(first.courseId), color: INK }}
                    title={`${nameFor(first.courseId, first.courseName)}: ${first.title}, ${clock(first.dueAt)}`}
                  >
                    <span className="c-dot h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />
                    <span className="truncate font-bold">{first.title}</span>
                  </a>
                )}
                {firstEvent && (
                  <span className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--ink-soft)]" aria-hidden="true" />
                    <span className="truncate font-bold">{firstEvent.title}</span>
                  </span>
                )}
                {count > 1 && (
                  <span className="shrink-0 rounded-md bg-[var(--chip)] px-1 py-px text-[11px] font-bold" style={{ color: "var(--ink-soft)" }}>
                    +{count - 1}
                  </span>
                )}
                {!count && <span style={{ color: MUTED }}>Open day</span>}
              </div>

              {count > 0 && (
                <div className={`week-pop absolute top-full z-30 w-64 pt-1.5 ${i >= 4 ? "right-0" : "left-0"}`}>
                  <div className="panel flex flex-col gap-0.5 p-2 shadow-[0_0_0_1px_var(--line),0_12px_28px_var(--shadow)]">
                    <p className="px-1.5 pb-1 text-xs font-extrabold" style={{ color: INK }}>
                      {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                      {heavy && (
                        <span style={{ color: "var(--red-fg)" }}>
                          {" · "}Heavy day: {due.length} due
                        </span>
                      )}
                    </p>
                    {dayEvents.map((e) => (
                      <div key={e.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                        <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--ink-soft)]" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{e.title}</span>
                          <span style={{ color: MUTED }}>{e.allDay ? "All day" : `${clock(e.start)} to ${clock(e.end)}`}</span>
                        </span>
                      </div>
                    ))}
                    {due.map((it) => (
                      <a
                        key={it.key}
                        href={it.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => onLook(e, it)}
                        className="row-hover flex items-start gap-2 rounded-lg px-1.5 py-1 text-xs"
                        style={{ "--c": colorFor(it.courseId) }}
                        title={it.title}
                      >
                        <span className="c-dot mt-1 h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate font-bold" style={{ color: INK }}>
                            {it.title}
                          </span>
                          <span style={{ color: MUTED }}>
                            {nameFor(it.courseId, it.courseName)} · {clock(it.dueAt)}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
