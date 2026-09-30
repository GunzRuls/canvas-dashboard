"use client";

// Day toggles + start/end time for one class. Used by the class list in onboarding (right after
// Canvas connects) and by Manage classes, so both look the same. The value is { days: [0-6], start: "HH:MM", end: "HH:MM" }
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

// One class on one line: color dot and name | day toggles | start – end. Used by Manage classes and
// the onboarding class list so both look the same. It switches by its own width (a container
// query), not the window's: narrow = name on top, controls below. `wide` is for rows with extra
// buttons on the right (Manage classes), which need more room before everything fits on one line.
// lead: replaces the dot (Manage classes shows its color tile). below: small links under the name.
// actions: buttons at the right end. problem: the message shown under the row (after a save try).
export function ClassTimesRow({ name, sub, color, value, onChange, problem, lead, below, actions, wide = false, dim = false, noTimes = false, id }) {
  // Static class names so Tailwind can see them.
  const row = wide ? "@min-[860px]:flex-nowrap" : "@min-[640px]:flex-nowrap";
  const timesAt = wide ? "@min-[860px]:order-none @min-[860px]:w-auto" : "@min-[640px]:order-none @min-[640px]:w-auto";
  return (
    <div id={id} className="@container" style={{ "--c": color }}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${row}`}>
        {lead || <span className="c-dot h-2.5 w-2.5 flex-none rounded-full" aria-hidden="true" />}
        <div className="min-w-0 flex-1" style={{ opacity: dim ? 0.45 : 1 }}>
          <p className="line-clamp-2 break-words text-sm font-bold leading-snug" style={{ color: "var(--ink)" }} title={name}>
            {name}
          </p>
          {sub && (
            <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
              {sub}
            </p>
          )}
          {below}
        </div>
        {!noTimes && (
          <div className={`order-last w-full ${timesAt}`}>
            <ClassTimes value={value} onChange={onChange} color={color} label={name} invalid={Boolean(problem)} />
          </div>
        )}
        {actions}
      </div>
      {problem && (
        <p className="mt-1.5 text-xs font-bold" style={{ color: "var(--red-fg)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

// label: the class name, used to make each control's screen reader name unique.
// fieldBg: the controls' background (pass --surface when sitting on --bg).
export default function ClassTimes({ value, onChange, color, label, fieldBg = "var(--field)", invalid = false }) {
  const times = value || EMPTY_TIMES;
  const set = (changes) => onChange({ ...times, ...changes });
  const toggle = (day) =>
    set({ days: times.days.includes(day) ? times.days.filter((d) => d !== day) : [...times.days, day] });
  const field = "w-[7.25rem] rounded-lg px-2 py-1.5 text-sm";

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
