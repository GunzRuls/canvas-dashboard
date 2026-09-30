"use client";

import { useRef, useState } from "react";
import { parseTimeText, formatTimeText } from "@/lib/timeText";

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

// One text box per time: type "4", "4:30", "4p" or "16:00"; it shows "4:00 PM" once you leave the box.
// (The browser's time picker had separate hour / minute / AM-PM boxes, which made Tab slow.)
function TimeField({ value, onSet, label, hint, fieldBg, invalid, onEnter }) {
  const [text, setText] = useState(null); // what's being typed; null = show the saved time
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (text === null) return;
    const parsed = parseTimeText(text);
    if (parsed === null) {
      setBad(true); // keep what they typed so they can fix it
      onSet("");
      return;
    }
    setBad(false);
    setText(null);
    onSet(parsed);
  };
  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      value={text ?? formatTimeText(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          onEnter?.(e.currentTarget);
        }
      }}
      placeholder={hint}
      title={bad ? "Try 4:00 PM, 4p or 16:00" : "Like 4:00 PM, 4p or 16:00"}
      className="w-[6.5rem] rounded-lg px-2.5 py-1.5 text-sm tabular-nums"
      style={{ background: fieldBg, color: "var(--ink)", boxShadow: bad ? "inset 0 0 0 1.5px var(--red-fg)" : undefined }}
      aria-label={label}
      aria-invalid={bad || invalid || undefined}
    />
  );
}

// Enter in an End box jumps to the next class's day buttons (Tab also visits Edit and the switch).
function focusNextClass(el) {
  const groups = [...document.querySelectorAll("[data-class-days]")];
  const mine = el.closest("[data-class-times]")?.querySelector("[data-class-days]");
  const next = groups[groups.indexOf(mine) + 1];
  next?.querySelector('button[tabindex="0"]')?.focus();
}

// Day letters you can type while the day buttons have focus (R and H are Thursday).
const DAY_KEYS = { m: 1, t: 2, w: 3, r: 4, h: 4, f: 5, s: 6, a: 6, u: 0 };

// label: the class name, used to make each control's screen reader name unique.
// fieldBg: the controls' background (pass --surface when sitting on --bg).
// Keyboard: the day buttons are one Tab stop (arrows move, Space toggles, or type M T W R F S U),
// then Start, then End. Enter in Start goes to End; Enter in End goes to the next class's days.
export default function ClassTimes({ value, onChange, color, label, fieldBg = "var(--field)", invalid = false }) {
  const times = value || EMPTY_TIMES;
  const [focusDay, setFocusDay] = useState(0);
  const dayRefs = useRef([]);
  const set = (changes) => onChange({ ...times, ...changes });
  const toggle = (day) =>
    set({ days: times.days.includes(day) ? times.days.filter((d) => d !== day) : [...times.days, day] });
  const moveTo = (i) => {
    const next = (i + DAYS.length) % DAYS.length;
    setFocusDay(next);
    dayRefs.current[next]?.focus();
  };
  const onDayKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(focusDay + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(focusDay - 1);
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && DAY_KEYS[e.key.toLowerCase()] !== undefined) {
      e.preventDefault();
      const day = DAY_KEYS[e.key.toLowerCase()];
      toggle(day);
      moveTo(DAYS.findIndex(([d]) => d === day));
    }
  };

  return (
    <div data-class-times className="flex flex-wrap items-center gap-x-3 gap-y-2" style={{ "--c": color || "var(--brand)" }}>
      <div className="flex gap-1" role="group" data-class-days aria-label={`Days for ${label}. Type M T W R F S U to toggle.`} onKeyDown={onDayKey}>
        {DAYS.map(([day, short, full], i) => {
          const on = times.days.includes(day);
          return (
            <button
              key={day}
              ref={(el) => (dayRefs.current[i] = el)}
              type="button"
              tabIndex={i === focusDay ? 0 : -1}
              onFocus={() => setFocusDay(i)}
              aria-pressed={on}
              aria-label={full}
              title={`${full} (${short === "Th" ? "R" : short === "Sa" ? "S" : short === "Su" ? "U" : short})`}
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
        <TimeField
          value={times.start}
          onSet={(start) => set({ start })}
          label={`${label} starts`}
          hint="Start"
          fieldBg={fieldBg}
          invalid={invalid}
          onEnter={(el) => el.parentElement.querySelectorAll("input")[1]?.focus()}
        />
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          to
        </span>
        <TimeField
          value={times.end}
          onSet={(end) => set({ end })}
          label={`${label} ends`}
          hint="End"
          fieldBg={fieldBg}
          invalid={invalid}
          onEnter={focusNextClass}
        />
      </div>
    </div>
  );
}
