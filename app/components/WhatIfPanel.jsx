"use client";

import { useEffect, useMemo, useState } from "react";
import { averageNeeded, computeGrade, groupTotals, scoreNeeded } from "@/lib/gradeMath";

const INK = "var(--ink)";
const MUTED = "var(--muted)";

function pct(n) {
  return n === null || n === undefined ? "–" : `${n.toFixed(1)}%`;
}

export default function WhatIfPanel({ course, onClose }) {
  const [breakdown, setBreakdown] = useState(null);
  const [error, setError] = useState(null);
  const [whatIf, setWhatIf] = useState({});
  const [target, setTarget] = useState(90);
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState("everything"); // "everything" or "one"

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/whatif?courseId=${course.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error);
        setBreakdown(data.breakdown);
        const firstUngraded = data.breakdown.groups
          .flatMap((g) => g.assignments)
          .find((a) => !a.graded && !a.excused && a.points > 0);
        setTargetId(firstUngraded ? String(firstUngraded.id) : "");
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const projected = useMemo(() => computeGrade(breakdown, whatIf), [breakdown, whatIf]);
  const allAssignments = breakdown ? breakdown.groups.flatMap((g) => g.assignments) : [];
  const ungraded = allAssignments.filter((a) => !a.graded && !a.excused && a.points > 0);
  const targetAssignment = allAssignments.find((a) => String(a.id) === targetId);
  const answer =
    breakdown && targetAssignment
      ? scoreNeeded(breakdown, { ...whatIf, [targetAssignment.id]: undefined }, targetAssignment, Number(target))
      : null;
  const overall = breakdown ? averageNeeded(breakdown, whatIf, Number(target)) : null;
  const anyDropRules = breakdown?.groups.some((g) => g.hasDropRules);
  const edited = Object.keys(whatIf).length > 0;

  function setScore(id, value) {
    setWhatIf((w) => {
      const next = { ...w };
      if (value === "") delete next[id];
      else next[id] = value;
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`What-if grades for ${course.name}`}>
      <button className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} aria-label="Close" />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-[var(--bg)]">
        <div className="p-6 text-white" style={{ background: course.color }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-extrabold leading-tight">{course.name}</h2>
              <p className="text-sm font-semibold opacity-85">{course.code}</p>
            </div>
            <button onClick={onClose} className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold hover:bg-white/35">
              Close
            </button>
          </div>
          <div className="mt-5 flex items-end gap-8">
            <div>
              <p className="text-sm font-semibold opacity-85">{edited ? "Projected" : "Current"}</p>
              <p className="font-display text-5xl font-extrabold leading-none tracking-tight">{pct(projected)}</p>
            </div>
            <div>
              <p className="text-sm font-semibold opacity-85">Canvas shows</p>
              <p className="text-2xl font-bold leading-none">
                {course.score === null ? "No grade yet" : `${Number(course.score).toFixed(1)}%`}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="m-6 rounded-xl bg-[var(--surface)] p-4 text-sm" style={{ color: "var(--red-fg)" }}>Couldn't load assignments: {error}</p>}
        {!breakdown && !error && <p className="p-6 text-sm" style={{ color: MUTED }}>Loading assignments…</p>}

        {breakdown && (
          <div className="flex flex-col gap-4 p-6">
            {/* What do I need? */}
            <div className="rounded-2xl bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold" style={{ color: INK }}>What do I need?</h3>
                <div className="flex rounded-lg bg-[var(--field)] p-0.5 text-xs font-bold" role="tablist">
                  {[
                    ["everything", "Everything left"],
                    ["one", "One assignment"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={mode === id}
                      onClick={() => setMode(id)}
                      className="rounded-md px-2.5 py-1"
                      style={mode === id ? { background: "var(--surface)", color: INK } : { color: MUTED }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {ungraded.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: MUTED }}>Everything in this class is already graded.</p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: INK }}>
                    <span>To finish with at least</span>
                    <input
                      type="number"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      className="w-16 rounded-lg bg-[var(--field)] px-2 py-1 font-bold"
                      aria-label="Target percent"
                    />
                    <span>%{mode === "one" ? ", on" : ""}</span>
                    {mode === "one" && (
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="max-w-full rounded-lg bg-[var(--field)] px-2 py-1 font-semibold"
                        aria-label="Assignment"
                      >
                        {ungraded.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {mode === "everything" && overall && (
                    <div className="mt-3 rounded-xl p-3 text-sm font-semibold" style={{ background: `${course.color}1F`, color: INK }}>
                      {overall.kind === "needed" && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            You need an average of {overall.percent.toFixed(1)}% on the {overall.count} assignment
                            {overall.count === 1 ? "" : "s"} left.
                          </span>
                          <button
                            onClick={() => setWhatIf(overall.fill)}
                            className="rounded-md px-2.5 py-1 text-xs font-bold text-white"
                            style={{ background: course.color }}
                          >
                            Fill them in
                          </button>
                        </div>
                      )}
                      {overall.kind === "locked" &&
                        `You're already there. Even zeros on everything left leave you at ${overall.atZero.toFixed(1)}%.`}
                      {overall.kind === "impossible" &&
                        `Not reachable. Perfect scores on everything left get you to ${overall.atFull.toFixed(1)}%.`}
                      {overall.kind === "none" && "Every remaining assignment already has a what-if score. Reset to recalculate."}
                      {overall.kind === "unknown" && "Not enough graded work yet to calculate this."}
                    </div>
                  )}

                  {mode === "one" && answer && (
                    <p className="mt-3 rounded-xl p-3 text-sm font-semibold" style={{ background: `${course.color}1F`, color: INK }}>
                      {answer.kind === "needed" &&
                        `You need ${answer.score.toFixed(1)} out of ${targetAssignment.points} (${answer.percent.toFixed(1)}%).`}
                      {answer.kind === "locked" &&
                        `You're already there. Even a 0 on it leaves you at ${answer.atZero.toFixed(1)}%.`}
                      {answer.kind === "impossible" &&
                        `Not reachable with this one alone. A perfect score gets you to ${answer.atFull.toFixed(1)}%.`}
                      {answer.kind === "unknown" && "Not enough graded work yet to calculate this."}
                    </p>
                  )}
                  <p className="mt-2 text-xs" style={{ color: MUTED }}>
                    {mode === "everything"
                      ? "Only counts assignments your professor has already posted in Canvas."
                      : "Uses any what-if scores you've entered below for the other assignments."}
                  </p>
                </>
              )}
            </div>

            {/* Assignment groups */}
            <div className="flex items-baseline justify-between">
              <h3 className="font-bold" style={{ color: INK }}>Try out scores</h3>
              {edited && (
                <button onClick={() => setWhatIf({})} className="text-sm font-bold underline" style={{ color: INK }}>
                  Reset to real scores
                </button>
              )}
            </div>
            {breakdown.groups.map((g) => {
              const totals = groupTotals(g, whatIf);
              return (
                <div key={g.id} className="rounded-2xl bg-[var(--surface)] p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-bold" style={{ color: INK }}>{g.name}</h4>
                    <span className="text-sm font-semibold" style={{ color: MUTED }}>
                      {breakdown.weighted ? `${g.weight}% of grade, ` : ""}
                      {pct(totals.percent)}
                    </span>
                  </div>
                  {g.hasDropRules && (
                    <p className="mt-1 text-xs" style={{ color: "var(--amber-fg)" }}>
                      This group drops some scores in Canvas. The calculator doesn't apply drops, so it may run a little low.
                    </p>
                  )}
                  <ul className="mt-2 divide-y divide-[var(--chip)]">
                    {g.assignments.length === 0 && (
                      <li className="py-2 text-sm" style={{ color: MUTED }}>No assignments yet</li>
                    )}
                    {g.assignments.map((a) => {
                      const value = whatIf[a.id] ?? (a.graded ? a.score : "");
                      const changed = whatIf[a.id] !== undefined;
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0 text-sm" style={{ color: INK }}>
                            <span className="block truncate font-semibold" title={a.name}>{a.name}</span>
                            {!a.graded && !a.excused && (
                              <span className="text-xs" style={{ color: MUTED }}>Not graded yet</span>
                            )}
                          </span>
                          {a.excused ? (
                            <span className="text-sm" style={{ color: MUTED }}>Excused</span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-1 text-sm" style={{ color: MUTED }}>
                              <input
                                type="number"
                                step="any"
                                value={value}
                                placeholder="–"
                                onChange={(e) => setScore(a.id, e.target.value)}
                                className="w-20 rounded-lg bg-[var(--field)] px-2 py-1 text-right font-bold"
                                style={{ color: INK, boxShadow: changed ? `inset 0 0 0 2px ${course.color}` : "none" }}
                                aria-label={`Score for ${a.name}`}
                              />
                              / {a.points}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <p className="text-xs" style={{ color: MUTED }}>
              {anyDropRules
                ? "Projections can differ slightly from Canvas because dropped scores aren't applied."
                : "If this doesn't match Canvas exactly, your professor may have hidden or muted some grades."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
