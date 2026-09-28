"use client";

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

export default function WeekStrip({ items, status, events, calendarEnabled, now, colorFor, nameFor }) {
  if (!now) return <div className="h-[132px]" />;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="grid min-w-[900px] grid-cols-7 gap-2">
          {days.map((day, i) => {
            const key = localKey(day);
            const due = items
              .filter((it) => status[it.key] !== "done" && it.dueAt && localKey(it.dueAt) === key)
              .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
            const dayEvents = events.filter((e) =>
              e.allDay
                ? e.end > e.start
                  ? key >= e.start && key < e.end
                  : key === e.start
                : localKey(e.start) === key
            );
            const heavy = due.length >= HEAVY_DAY;
            const label =
              i === 0 ? "Today" : i === 1 ? "Tomorrow" : day.toLocaleDateString(undefined, { weekday: "long" });

            return (
              <div
                key={key}
                className="flex h-[132px] flex-col rounded-xl p-2"
                style={{
                  background: heavy ? "var(--red-bg)" : i === 0 ? "var(--surface)" : "var(--surface-2)",
                  boxShadow: i === 0 ? `inset 0 0 0 2px ${INK}` : "none",
                }}
              >
                <div className="mb-1.5 flex flex-none items-baseline justify-between px-0.5">
                  <span className="text-sm font-bold" style={{ color: INK }}>
                    {label}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: MUTED }}>
                    {day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                {heavy && (
                  <p className="mb-1 flex-none px-0.5 text-[11px] font-bold" style={{ color: "var(--red-fg)" }}>
                    Heavy day: {due.length} due
                  </p>
                )}
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className="flex-none truncate rounded-md px-1.5 py-1 text-[11px]"
                      style={{ background: "var(--inverse)", color: "var(--inverse-fg)" }}
                      title={`${e.title}, ${e.allDay ? "all day" : `${clock(e.start)} to ${clock(e.end)}`}`}
                    >
                      <span className="font-semibold opacity-75">
                        {e.allDay ? "All day" : `${clock(e.start)}–${clock(e.end)}`}
                      </span>{" "}
                      <span className="font-bold">{e.title}</span>
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
                        className="block flex-none rounded-md px-1.5 py-1 text-[11px] leading-tight hover:brightness-95"
                        style={{ background: `${color}1F`, borderLeft: `3px solid ${color}` }}
                        title={`${nameFor(it.courseId, it.courseName)}: ${it.title}, ${clock(it.dueAt)}`}
                      >
                        <span className="block truncate font-bold" style={{ color: INK }}>
                          {it.title}
                        </span>
                        <span className="block truncate font-semibold" style={{ color }}>
                          {clock(it.dueAt)}, {nameFor(it.courseId, it.courseName)}
                        </span>
                      </a>
                    );
                  })}
                  {!due.length && !dayEvents.length && (
                    <p className="px-0.5 text-xs" style={{ color: MUTED }}>
                      Open day
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!calendarEnabled && (
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          Add your Google Calendar in{" "}
          <a href="/setup" className="font-bold underline">
            Settings
          </a>{" "}
          to see shifts and plans here.
        </p>
      )}
    </div>
  );
}
