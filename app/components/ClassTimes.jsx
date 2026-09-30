"use client";

// Day toggles + start/end time for one class. Used by the "When are your classes?" setup step
// and by Manage classes, so both look the same. The value is { days: [0-6], start: "HH:MM", end: "HH:MM" }
// (0 = Sunday), the same shape saved in dashboard-settings.json.

const DAYS = [
  [1, "M", "Monday"],
  [2, "T", "Tuesday"],
  [3, "W", "Wednesday"],
  [4, "Th", "Thursday"],
  [5, "F", "Friday"],
  [6, "Sa", "Saturday"],
  [0, "Su", "Sunday"],
];

export const EMPTY_TIMES = { days: [], start: "", end: "" };

export function isBlank(times) {
  return !times || (!times.days?.length && !times.start && !times.end);
}

// Returns what's wrong with a class time, or "" when it's fine or left empty (empty = skipped).
export function timesProblem(times) {
  if (isBlank(times)) return "";
  if (!times.days?.length) return "Pick the days this class meets.";
  if (!times.start || !times.end) return "Add a start and end time.";
  if (times.start >= times.end) return "The end time has to be after the start time.";
  return "";
}

// label: the class name, used to make each control's screen reader name unique.
// fieldBg: the time fields' background (Manage classes sits on --bg, so it passes --surface).
export default function ClassTimes({ value, onChange, color, label, fieldBg = "var(--field)", invalid = false }) {
  const times = value || EMPTY_TIMES;
  const set = (changes) => onChange({ ...times, ...changes });
  const toggle = (day) =>
    set({ days: times.days.includes(day) ? times.days.filter((d) => d !== day) : [...times.days, day] });
  const field = "rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" style={{ "--c": color || "var(--brand)" }}>
      <div className="flex gap-1" role="group" aria-label={`Days for ${label}`}>
        {DAYS.map(([day, short, full]) => {
          const on = times.days.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={full}
              title={full}
              onClick={() => toggle(day)}
              className={`h-8 min-w-8 rounded-md px-1.5 text-xs font-bold transition-colors ${
                on ? "c-tint c-text" : "hover:text-[var(--ink)]"
              }`}
              style={on ? { boxShadow: "inset 0 0 0 1.5px var(--c)" } : { background: fieldBg, color: "var(--muted)" }}
            >
              {short}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="time"
          value={times.start}
          onChange={(e) => set({ start: e.target.value })}
          className={field}
          style={{ background: fieldBg, color: "var(--ink)" }}
          aria-label={`${label} starts`}
          aria-invalid={invalid || undefined}
        />
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          to
        </span>
        <input
          type="time"
          value={times.end}
          onChange={(e) => set({ end: e.target.value })}
          className={field}
          style={{ background: fieldBg, color: "var(--ink)" }}
          aria-label={`${label} ends`}
          aria-invalid={invalid || undefined}
        />
      </div>
    </div>
  );
}
