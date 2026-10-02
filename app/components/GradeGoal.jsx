"use client";

// Grade goals (CLASS-6) for the sidebar Grades list: the goal state for one class, the status
// pill, the tick mark on the ring, and the small inline goal picker. The math is in
// lib/gradeGoals.js (tested); this file only fetches, saves and draws.
import { useEffect, useId, useRef, useState } from "react";
import { GOAL_PRESETS, cleanGoal, goalStatus } from "@/lib/gradeGoals";

const TONES = {
  good: { background: "var(--green-bg)", color: "var(--green-fg)" },
  warn: { background: "var(--amber-bg)", color: "var(--amber-fg)" },
  bad: { background: "var(--red-bg)", color: "var(--red-fg)" },
  plain: { background: "var(--chip)", color: "var(--ink)" },
};

// The goal for one class: saved through POST /api/settings (only this class's goal changes),
// and the outlook (what's left) loaded from /api/goals only when a goal is set.
export function useGradeGoal(course) {
  const [goal, setGoal] = useState(course.goal ?? null);
  const [outlook, setOutlook] = useState(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const hasGoal = goal !== null;

  // Reload when a goal is first set or the grade changes (a new grade came in).
  useEffect(() => {
    if (!hasGoal) return;
    let stop = false;
    fetch(`/api/goals?courseId=${encodeURIComponent(course.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (stop) return;
        if (data.ok) setOutlook(data.outlook);
        setFailed(!data.ok);
      })
      .catch(() => !stop && setFailed(true));
    return () => {
      stop = true;
    };
  }, [hasGoal, course.id, course.score]);

  async function save(value) {
    const next = cleanGoal(value);
    const before = goal;
    setGoal(next);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: { [course.id]: next } }),
      });
      if (!(await res.json()).ok) throw new Error();
      return true;
    } catch {
      setGoal(before);
      setError("Couldn't save the goal. Try again.");
      return false;
    }
  }

  return { goal, outlook, status: goalStatus(outlook, goal), loading: hasGoal && !outlook && !failed, failed, error, save };
}

// The pill next to the grade: "Set goal" with no goal, the status once loaded.
export function GoalPill({ goal, status, loading, open, onToggle, controls, courseName }) {
  const base = "pointer-events-auto goal-pill shrink-0 rounded-md px-1.5 py-px text-[11px] font-bold";
  if (goal === null) {
    return (
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        className={`${base} goal-pill-empty`}
        title="Set a grade goal for this class"
        aria-label={`Set a grade goal for ${courseName}`}
      >
        + Goal
      </button>
    );
  }
  const tone = status ? TONES[status.tone] : TONES.plain;
  const label = status ? status.label : `Goal ${fmt(goal)}%`;
  const detail = status ? `Goal ${fmt(goal)}%: ${status.detail}` : loading ? `Goal ${fmt(goal)}%: checking…` : `Goal ${fmt(goal)}%`;
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={`${base} ${loading ? "opacity-70" : ""}`}
      style={tone}
      title={`${detail} Click to change.`}
      aria-label={`${detail} Change goal`}
    >
      {label}
    </button>
  );
}

// A small mark on the ring at the goal (12 o'clock = 0%, clockwise like the fill).
export function GoalTick({ goal }) {
  if (goal === null) return null;
  return (
    <span className="goal-tick-turn" style={{ transform: `rotate(${goal * 3.6}deg)` }} aria-hidden="true">
      <span className="goal-tick" />
    </span>
  );
}

// The goal picker, opened inline under the row (like the new-grades list) so the scrolling list
// never cuts it off. Escape or Close puts focus back on the pill.
export function GoalEditor({ id, goal, status, failed, error, hasDropRules, unposted, onSave, onClose }) {
  const [custom, setCustom] = useState(goal !== null && !GOAL_PRESETS.some((p) => p.value === goal) ? String(goal) : "");
  const [bad, setBad] = useState(false);
  const firstRef = useRef(null);
  const inputId = useId();

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  async function pick(value) {
    if (await onSave(value)) onClose();
  }

  function submit(e) {
    e.preventDefault();
    const value = cleanGoal(custom);
    if (value === null) return setBad(true);
    pick(value);
  }

  return (
    <div
      id={id}
      role="group"
      aria-label="Grade goal"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="pointer-events-auto mt-1.5 rounded-xl bg-[var(--surface)] p-2.5 shadow-[0_0_0_1px_var(--line)]"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold" style={{ color: "var(--ink)" }}>
          Grade goal
        </span>
        <button onClick={() => onClose()} className="text-link text-[11px] font-bold" style={{ color: "var(--muted)" }}>
          Close
        </button>
      </div>
      <div className="flex gap-1">
        {GOAL_PRESETS.map((p, i) => (
          <button
            key={p.label}
            ref={i === 0 ? firstRef : undefined}
            onClick={() => pick(p.value)}
            aria-pressed={goal === p.value}
            className="goal-preset flex-1 rounded-md px-1 py-1 text-[11px] font-bold"
            title={`Aim for ${p.label} (${p.value}%)`}
          >
            {p.label} <span className="font-semibold opacity-70">{p.value}</span>
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-1.5 flex items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Custom goal in percent
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min="1"
          max="100"
          step="any"
          placeholder="Custom %"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setBad(false);
          }}
          aria-invalid={bad}
          className="h-7 min-w-0 flex-1 rounded-lg bg-[var(--field)] px-2 text-xs"
          style={{ color: "var(--ink)" }}
        />
        <button type="submit" className="btn btn-soft h-7 px-2.5 text-xs">
          Set
        </button>
      </form>
      {bad && (
        <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--red-fg)" }}>
          Enter a percent from 1 to 100.
        </p>
      )}
      {error && (
        <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--red-fg)" }} role="alert">
          {error}
        </p>
      )}
      {goal !== null && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--ink-soft)" }}>
          {status ? status.detail : failed ? "Couldn't check this class's assignments right now." : "Checking what's left…"}
          {unposted?.length > 0 && ` Counts ${unposted.join(", ")} as still to come.`}
          {hasDropRules && " Drop-lowest rules aren't counted."}
        </p>
      )}
      {goal !== null && (
        <button
          onClick={() => pick(null)}
          className="text-link mt-1 text-[11px] font-bold"
          style={{ color: "var(--red-fg)" }}
        >
          Remove goal
        </button>
      )}
    </div>
  );
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
}
