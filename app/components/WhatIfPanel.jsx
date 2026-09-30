"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { averageNeeded, computeGrade, groupTotals, scoreNeeded } from "@/lib/gradeMath";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
// Number boxes grow with what's typed (7.08, 98.75, 145.5) between a min and max width. Browsers
// without field-sizing keep the fixed w-[...] fallback. The spin arrows are hidden because they
// ate a third of the box and clipped the digits; arrow keys still step the value.
const NUMBER_FIELD =
  "shrink-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:[field-sizing:content]";
const FOCUSABLE ='button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function pct(n) {
  return n === null || n === undefined ? "–" : `${n.toFixed(1)}%`;
}

// Pop-up plumbing: focus moves into the dialog, Tab stays inside it, Escape closes it, the page
// behind doesn't scroll, and focus goes back to the button that opened it afterwards.
function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    const opener = document.activeElement;
    node?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = node.contains(document.activeElement) && document.activeElement !== node;
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [ref]);
}

function Badge({ kind }) {
  if (kind === "whatif") return <span className="c-tint c-text shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold">What-if</span>;
  if (kind === "graded")
    return (
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--green-bg)", color: "var(--green-fg)" }}>
        Graded
      </span>
    );
  if (kind === "excused")
    return (
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--chip)", color: MUTED }}>
        Excused
      </span>
    );
  return (
    <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--chip)", color: "var(--ink-soft)" }}>
      Not graded
    </span>
  );
}

export default function WhatIfPanel({ course, onClose }) {
  const [breakdown, setBreakdown] = useState(null);
  const [error, setError] = useState(null);
  const [whatIf, setWhatIf] = useState({});
  const [target, setTarget] = useState(90);
  const [targetId, setTargetId] = useState(""); // "" = everything left, otherwise one assignment
  const dialogRef = useRef(null);
  useDialog(dialogRef, onClose);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/whatif?courseId=${course.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error);
        setBreakdown(data.breakdown);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  const projected = useMemo(() => computeGrade(breakdown, whatIf), [breakdown, whatIf]);
  const allAssignments = breakdown ? breakdown.groups.flatMap((g) => g.assignments) : [];
  const ungraded = allAssignments.filter((a) => !a.graded && !a.excused && a.points > 0);
  const targetAssignment = targetId ? allAssignments.find((a) => String(a.id) === targetId) : null;
  const answer =
    breakdown && targetAssignment
      ? scoreNeeded(breakdown, { ...whatIf, [targetAssignment.id]: undefined }, targetAssignment, Number(target))
      : null;
  const overall = breakdown && !targetAssignment ? averageNeeded(breakdown, whatIf, Number(target)) : null;
  const anyDropRules = breakdown?.groups.some((g) => g.hasDropRules);
  const edited = Object.keys(whatIf).length > 0;
  const result = answer || overall;

  function setScore(id, value) {
    setWhatIf((w) => {
      const next = { ...w };
      if (value === "") delete next[id];
      else next[id] = value;
      return next;
    });
  }

  const big = (text) => <b className="font-display text-base font-extrabold">{text}</b>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="modal-backdrop absolute inset-0 cursor-default" onClick={onClose} aria-label="Close what-if" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatif-title"
        tabIndex={-1}
        className="modal-in relative flex max-h-full w-full max-w-[620px] flex-col"
        style={{ outline: "none" }}
      >
        <div
          className="modal-glow flex max-h-full min-h-0 flex-col overflow-y-auto rounded-[26px] bg-[var(--bg)]"
          style={{ "--c": course.color, color: INK }}
        >
          <div className="h-2 shrink-0" style={{ background: "var(--c)" }} />
          <div className="c-tint c-text flex shrink-0 flex-col gap-3.5 px-5 pb-5 pt-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.1em]">What-if</p>
                <h2 id="whatif-title" className="font-display mt-1 text-[26px] font-extrabold leading-tight">
                  {course.name}
                </h2>
                {course.code && <p className="text-xs font-semibold opacity-80">{course.code}</p>}
              </div>
              <button onClick={onClose} className="btn btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-[14px] px-3.5 py-3" style={{ background: "var(--glass)" }}>
                <p className="text-xs font-bold">Current grade</p>
                <p className="font-display mt-0.5 text-[26px] font-extrabold leading-tight sm:text-[30px]">
                  {course.score === null || course.score === undefined ? "–" : `${Number(course.score).toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-[14px] bg-[var(--surface)] px-3.5 py-3" style={{ boxShadow: "0 0 0 2px var(--c)" }}>
                <p className="text-xs font-bold">{edited ? "With your what-ifs" : "Calculated here"}</p>
                <p className="font-display mt-0.5 text-[26px] font-extrabold leading-tight sm:text-[30px]">{pct(projected)}</p>
              </div>
            </div>
          </div>

          <div className="min-h-60 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6">
            {error && (
              <p className="rounded-xl bg-[var(--surface)] p-4 text-sm" style={{ color: "var(--red-fg)" }}>
                Couldn&apos;t load assignments: {error}
              </p>
            )}
            {!breakdown && !error && <p className="py-2 text-sm" style={{ color: MUTED }}>Loading assignments…</p>}

            {breakdown && (
              <div className="flex flex-col gap-3.5">
                {/* What do I need? */}
                {ungraded.length === 0 ? (
                  <p className="text-sm font-semibold" style={{ color: MUTED }}>Everything in this class is already graded.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2.5 text-[15px] font-semibold">
                      <label htmlFor="whatif-target">I want at least</label>
                      <span className="flex items-center gap-1.5">
                        <input
                          id="whatif-target"
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                          className={`font-display rounded-[10px] bg-[var(--field)] px-2.5 py-2 text-center text-lg font-extrabold tabular-nums ${NUMBER_FIELD} min-w-[calc(3ch+20px)] max-w-[calc(6ch+20px)] w-[calc(5ch+20px)]`}
                        />
                        <span>%</span>
                      </span>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="w-full min-w-0 rounded-lg bg-[var(--field)] px-3 py-2 text-sm font-semibold sm:w-auto sm:max-w-[260px]"
                        aria-label="Work to count"
                      >
                        <option value="">on everything left</option>
                        {ungraded.map((a) => (
                          <option key={a.id} value={a.id}>on {a.name}</option>
                        ))}
                      </select>
                    </div>

                    {result && (
                      <div className="c-tint c-text flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold">
                        <span>
                          {overall?.kind === "needed" && (
                            <>
                              Needs {big(`${overall.percent.toFixed(1)}%`)} on the {overall.count} assignment
                              {overall.count === 1 ? "" : "s"} left
                            </>
                          )}
                          {answer?.kind === "needed" && (
                            <>
                              Needs {big(`${answer.score.toFixed(1)} / ${targetAssignment.points}`)} ({answer.percent.toFixed(1)}%)
                            </>
                          )}
                          {result.kind === "locked" &&
                            (answer
                              ? `You're already there. Even a 0 on it leaves you at ${answer.atZero.toFixed(1)}%.`
                              : `You're already there. Even zeros on everything left leave you at ${overall.atZero.toFixed(1)}%.`)}
                          {result.kind === "impossible" &&
                            (answer
                              ? `Not reachable with this one alone. A perfect score gets you to ${answer.atFull.toFixed(1)}%.`
                              : `Not reachable. Perfect scores on everything left get you to ${overall.atFull.toFixed(1)}%.`)}
                          {result.kind === "none" && "Every remaining assignment already has a what-if score. Reset to recalculate."}
                          {result.kind === "unknown" && "Not enough graded work yet to calculate this."}
                        </span>
                        {overall?.kind === "needed" && (
                          <button onClick={() => setWhatIf(overall.fill)} className="btn btn-course px-2.5 py-1 text-xs">
                            Fill them in
                          </button>
                        )}
                      </div>
                    )}
                    <p className="text-xs" style={{ color: MUTED }}>
                      {targetAssignment
                        ? "Uses any what-if scores you've entered below for the other assignments."
                        : "Only counts assignments your professor has already posted in Canvas."}
                    </p>
                  </div>
                )}

                {/* Assignment groups */}
                {breakdown.groups.map((g) => {
                  const totals = groupTotals(g, whatIf);
                  return (
                    <div key={g.id} className="overflow-hidden rounded-2xl bg-[var(--surface)]" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}>
                      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--chip)] px-4 py-2.5">
                        <h3 className="text-sm font-extrabold">{g.name}</h3>
                        <span className="shrink-0 text-xs font-bold" style={{ color: MUTED }}>
                          {breakdown.weighted ? `${g.weight}% of grade · ` : ""}
                          {pct(totals.percent)}
                        </span>
                      </div>
                      {g.hasDropRules && (
                        <p className="border-b border-[var(--chip)] px-4 py-2 text-xs" style={{ color: "var(--amber-fg)" }}>
                          This group drops some scores in Canvas. The calculator doesn&apos;t apply drops, so it may run a little low.
                        </p>
                      )}
                      <ul>
                        {g.assignments.length === 0 && (
                          <li className="px-4 py-2.5 text-sm" style={{ color: MUTED }}>No assignments yet</li>
                        )}
                        {g.assignments.map((a) => {
                          const value = whatIf[a.id] ?? (a.graded ? a.score : "");
                          const changed = whatIf[a.id] !== undefined;
                          const kind = a.excused ? "excused" : changed ? "whatif" : a.graded ? "graded" : "open";
                          return (
                            <li key={a.id} className="row-hover flex items-center gap-3 border-b border-[var(--chip)] px-4 py-2 last:border-b-0">
                              <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold sm:line-clamp-1" title={a.name}>{a.name}</span>
                              <span className="hidden sm:contents"><Badge kind={kind} /></span>
                              {a.excused ? (
                                <span className="w-[124px] shrink-0 text-right text-sm" style={{ color: MUTED }}>–</span>
                              ) : (
                                <span className="flex w-[124px] shrink-0 items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    value={value}
                                    placeholder="–"
                                    onChange={(e) => setScore(a.id, e.target.value)}
                                    className={`font-display rounded-lg bg-[var(--field)] px-2 py-1.5 text-right text-[15px] font-extrabold tabular-nums ${NUMBER_FIELD} min-w-[calc(3.5ch+16px)] max-w-[calc(7ch+16px)] w-[calc(5ch+16px)]`}
                                    aria-label={`Score for ${a.name}`}
                                  />
                                  <span className="min-w-[5ch] whitespace-nowrap text-[13px] tabular-nums" style={{ color: MUTED }}>/ {a.points}</span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 text-xs" style={{ color: MUTED }}>
                    What-ifs are just for planning. Nothing here changes Canvas.{" "}
                    {anyDropRules
                      ? "Projections can differ slightly from Canvas because dropped scores aren't applied."
                      : "If this doesn't match Canvas exactly, your professor may have hidden or muted some grades."}
                  </p>
                  {edited && (
                    <button onClick={() => setWhatIf({})} className="btn btn-soft shrink-0 px-3 py-1.5 text-xs">
                      Reset to real scores
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
