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

export default function WeekStrip({ items, status, events, calendarEnabled, now, colorFor, nameFor }) {
  if (!now) return <div className="h-[124px] flex-1" />;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex flex-1 flex-col">
      <div className="-mx-4 flex-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="panel grid h-full min-w-[900px] grid-cols-7 overflow-hidden">
          {days.map((day, i) => {
            const key = localKey(day);
            const due = items
              .filter((it) => status[it.key] !== "done" && it.dueAt && localKey(it.dueAt) === key)
              .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
            const dayEvents = events.filter((e) => onDay(e, key));
            const heavy = due.length >= HEAVY_DAY;
            const label =
              i === 0 ? "Today" : i === 1 ? "Tomorrow" : day.toLocaleDateString(undefined, { weekday: "short" });

            return (
              <div
                key={key}
                className="flex h-full min-h-[124px] flex-col px-2.5 py-2"
                style={{
                  borderLeft: i === 0 ? "none" : "1px solid var(--line)",
                  background: heavy ? "var(--red-bg)" : "transparent",
                }}
              >
                <div className="mb-1.5 flex flex-none items-center justify-between gap-1">
                  {i === 0 ? (
                    <span className="rounded-full bg-[var(--brand)] px-2 py-0.5 text-xs font-extrabold text-white">
                      {label}
                    </span>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: INK }}>
                      {label}
                    </span>
                  )}
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>
                    {day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                {heavy && (
                  <p className="mb-1 flex-none text-[11px] font-bold" style={{ color: "var(--red-fg)" }}>
                    Heavy day: {due.length} due
                  </p>
                )}
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-none items-center gap-1.5 truncate text-[11px] leading-tight"
                      style={{ color: "var(--ink-soft)" }}
                      title={`${e.title}, ${e.allDay ? "all day" : `${clock(e.start)} to ${clock(e.end)}`}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-soft)]" aria-hidden="true" />
                      <span className="truncate">
                        <span className="font-semibold" style={{ color: MUTED }}>
                          {e.allDay ? "All day" : clock(e.start)}
                        </span>{" "}
                        <span className="font-bold">{e.title}</span>
                      </span>
                    </div>
                  ))}
                  {due.map((it) => {
                    const color = colorFor(it.courseId);
                    return (
                      <a
                        key={it.key}
                        href={it.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="row-hover flex flex-none items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] leading-tight"
                        style={{ "--c": color }}
                        title={`${nameFor(it.courseId, it.courseName)}: ${it.title}, ${clock(it.dueAt)}`}
                      >
                        <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
                        <span className="truncate font-bold" style={{ color: INK }}>
                          {it.title}
                        </span>
                      </a>
                    );
                  })}
                  {!due.length && !dayEvents.length && (
                    <p className="text-xs" style={{ color: MUTED }}>
                      Open day
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!calendarEnabled ? (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Add your Google or Outlook calendar in{" "}
          <Link href="/setup" scroll={false} className="text-link font-bold underline">
            Settings
          </Link>{" "}
          to see class events here.
        </p>
      ) : null /* no "N personal events hidden" line: the user found it noisy (DASH-7); Settings still lets a calendar show everything */}
    </div>
  );
}
