"use client";

// Grade calculator (CLASS-10), the pop-up that replaced What-if. It opens on "Where you stand"
// (CLASS-14): no goal picked, (2) shows the grade as it is today and (3) each item's score or status.
// Picking a grade switches to goal mode. Left: (1) pick the final grade you
// want, (2) one plain answer with two bars. Right: (3) every assignment grouped by category: graded
// ones (dimmed, with the score; CLASS-13) above what each open one needs, and (4) an optional
// "I expect" box per open row that re-solves the rest. The math is in
// lib/gradeCalc.js (tested); this file only loads the class and draws. Nothing here touches Canvas;
// "Save as my goal" saves the goal like the goal picker does.
import { useEffect, useMemo, useRef, useState } from "react";
import { GOAL_PRESETS, letterFor, letterScale } from "@/lib/gradeGoals";
import {
  bestReachable,
  calcModel,
  countsLine,
  goalText,
  groupSummary,
  halfUp,
  leftOutNote,
  letterChoices,
  lockValue,
  openStatusText,
  pct1,
  scoreText,
  solvePlan,
  standing,
  toComeText,
  trim,
  up1,
  withArticle,
} from "@/lib/gradeCalc";
import { saveGoal } from "./GradeGoal";

const MUTED = "var(--muted)";
const SOFT = "var(--ink-soft)";
const HELP_KEY = "dashboard-calc-help-seen";
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Pop-up plumbing: focus moves into the dialog, Tab stays inside it, Escape closes it, the page
// behind doesn't scroll, and focus goes back to the button that opened it afterwards.
function useDialog(ref, onEscape) {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const node = ref.current;
    const opener = document.activeElement;
    node?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        escRef.current();
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

const TONES = {
  green: { background: "var(--green-bg)", color: "var(--green-fg)" },
  amber: { background: "var(--amber-bg)", color: "var(--amber-fg)" },
  red: { background: "var(--red-bg)", color: "var(--red-fg)" },
  plain: { background: "var(--chip)", color: "var(--ink)" },
};

const things = (n) => `${n} thing${n === 1 ? "" : "s"}`;
const cleanNumber = (v) => v.replace(/[^0-9.]/g, "").slice(0, 5);

function dueText(iso) {
  if (!iso) return "No date yet";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function StepNumber({ n, soft = false }) {
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold tabular-nums"
      style={soft ? { background: "var(--surface-2)", color: SOFT } : { background: "var(--ink)", color: "var(--surface)" }}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

export default function GradeCalculator({ course, goal = null, onClose }) {
  const [data, setData] = useState(null); // { breakdown } | { error }
  const [target, setTarget] = useState(null); // typed or picked goal (string); null = Where you stand (CLASS-14)
  const [locks, setLocks] = useState({}); // { itemId: "85" } from the "I expect" boxes
  const [fineTune, setFineTune] = useState(false);
  const [details, setDetails] = useState(false);
  const [showGraded, setShowGraded] = useState(true); // graded rows in (3) (CLASS-13)
  const [saved, setSaved] = useState(goal);
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | "error"
  const [help, setHelp] = useState(() => {
    try {
      return !localStorage.getItem(HELP_KEY);
    } catch {
      return false;
    }
  });
  const dialogRef = useRef(null);
  const helpBtnRef = useRef(null);

  function closeHelp() {
    setHelp(false);
    try {
      localStorage.setItem(HELP_KEY, "1");
    } catch {}
  }
  // Escape closes the "How this works" bubble first, then the calculator.
  useDialog(dialogRef, () => {
    if (help) {
      closeHelp();
      helpBtnRef.current?.focus();
    } else onClose();
  });

  useEffect(() => {
    let stop = false;
    fetch(`/api/breakdown?courseId=${encodeURIComponent(course.id)}`)
      .then((r) => r.json())
      .then((res) => !stop && setData(res.ok ? { breakdown: res.breakdown } : { error: res.error || "Canvas didn't answer." }))
      .catch(() => !stop && setData({ error: "Canvas didn't answer." }));
    return () => {
      stop = true;
    };
  }, [course.id]);

  const breakdown = data?.breakdown || null;
  const scale = useMemo(() => letterScale(breakdown?.scheme), [breakdown]);
  const model = useMemo(() => calcModel(breakdown), [breakdown]);
  const current = course.score === null || course.score === undefined ? null : Number(course.score);
  const currentLetter = current === null ? "" : letterFor(current, scale) || course.grade || "";
  const letters = letterChoices(scale, GOAL_PRESETS);
  // Where you stand until a grade is picked or typed; then goal mode (a half-typed box keeps
  // goal mode and falls back to the saved goal, else 90, for the plan).
  const goalMode = target !== null;
  const targetStr = target ?? "";
  const tNum = Number(targetStr);
  const tValid = targetStr !== "" && Number.isFinite(tNum) && tNum > 0 && tNum <= 100;
  const goalNum = tValid ? tNum : saved ?? 90;
  const words = goalText(goalNum, scale);
  const stand = useMemo(() => standing(model), [model]);
  const fineTuneOn = goalMode && fineTune;

  const plan = solvePlan(model, goalNum, locks, current);
  const before = solvePlan(model, goalNum, {}, current);
  const typedCount = plan.typed;
  const hasLocks = typedCount > 0;

  function pickTarget(v) {
    setTarget(String(v));
    setSaveState("");
  }
  function setLock(id, v) {
    setLocks((l) => {
      const next = { ...l };
      if (v === "") delete next[id];
      else next[id] = v;
      return next;
    });
    setSaveState("");
  }
  function reset() {
    setTarget(null);
    setLocks({});
    setFineTune(false);
    setSaveState("");
  }
  async function save() {
    if (!goalMode || !tValid) return;
    setSaveState("saving");
    if (await saveGoal(course.id, tNum)) {
      setSaved(tNum);
      setSaveState("saved");
    } else setSaveState("error");
  }

  // ---- (2) Here's what it takes ----
  const curText = current === null ? "" : pct1(current);
  let ans;
  if (plan.kind === "doable" || plan.kind === "ontrack") {
    const p = Math.min(100, Math.ceil(plan.p - 1e-9));
    const rest = hasLocks
      ? plan.free === 1 ? "the one other thing left" : `the other ${things(plan.free)} left`
      : plan.free === 1 ? "the one thing still left" : `each of the ${things(plan.free)} still left`;
    ans = {
      big: `Score about ${p}% on ${rest}.`,
      chip: plan.kind === "ontrack" ? "On track" : "Doable",
      why:
        current === null
          ? "Nothing is graded yet, so there's no pace to compare with."
          : plan.kind === "ontrack"
            ? `You're already scoring about that (${curText} so far). Keep it up.`
            : `You can get there. It takes a little more than you've been scoring so far (${curText}).`,
      tone: current === null ? "plain" : plan.kind === "ontrack" ? "green" : "amber",
    };
  } else if (plan.kind === "impossible") {
    const best = bestReachable(plan.a1, scale);
    ans = {
      big: `Even 100% on everything left ends at ${pct1(plan.a1)}.`,
      chip: "Out of reach",
      why: best
        ? `The highest you can reach is ${withArticle(best.label)} (${pct1(plan.a1)}). That's still a strong finish.`
        : `The highest you can reach is ${pct1(plan.a1)}.`,
      tone: "red",
      fix: best,
    };
  } else if (plan.kind === "locked") {
    ans = {
      big: `You've already locked in ${words}.`,
      chip: "Already locked in",
      why: `Even a 0 on the ${things(plan.free)} left keeps you at ${pct1(plan.a0)} or higher.`,
      tone: "green",
    };
  } else if (plan.kind === "set") {
    ans = {
      big: plan.open ? `Your scores finish at ${pct1(plan.finish)}.` : `Everything is graded. You finished at ${pct1(plan.finish)}.`,
      chip: plan.reached ? "Goal reached" : "Short of goal",
      why: plan.reached
        ? `That reaches ${words}.`
        : plan.open ? `That's below ${words}. Try higher scores, or a different goal.` : `That's below ${words}.`,
      tone: plan.reached ? "green" : "red",
    };
  } else {
    ans = { big: "Not enough graded work yet to work this out.", chip: "Can't tell yet", why: "Once Canvas has some grades or categories, this fills in.", tone: "plain" };
  }
  const showRange = plan.kind === "doable" || plan.kind === "ontrack" || plan.kind === "locked";
  const needPct = plan.p;
  const needLabel = hasLocks ? "Needed on the rest" : "Needed from here";

  // ---- (3) What each one needs ----
  const reachedAll = plan.kind === "locked" || (plan.kind === "set" && plan.reached);
  let listHint = `To finish with ${words}, aim for these scores.`;
  if (plan.kind === "impossible") listHint = `Even full marks on all of these leave you short of ${trim(goalNum)}%. Pick a goal you can reach to see real targets.`;
  else if (reachedAll) listHint = `You've reached ${words} whatever you score on these.`;
  else if (plan.kind === "set" && !plan.open) listHint = "Everything here is graded.";
  else if (plan.kind === "set") listHint = `With the scores you typed, you finish below ${words}.`;
  else if (plan.kind === "unknown") listHint = "Canvas hasn't graded enough yet to work out targets.";
  else if (hasLocks) listHint = `To finish with ${words}. Rows you typed a score for are marked.`;
  if (!goalMode) listHint = "Everything as Canvas has it today. Pick a grade on the left to see what each one needs.";
  const anyGraded = model ? [...model.groups, ...model.zeroGroups].some((g) => g.graded.length) : false;
  const gradedOn = showGraded && anyGraded;
  const needHead = !goalMode
    ? "Score / status"
    : gradedOn
    ? plan.kind === "impossible" ? "You got / best" : "You got / need"
    : plan.kind === "impossible" ? "Best you can do" : "You need";
  const cols = ["minmax(0,1fr)", fineTuneOn ? "96px" : "108px", fineTuneOn ? "80px" : null, details ? "86px" : null, goalMode ? "132px" : "minmax(132px,auto)"].filter(Boolean).join(" ");
  const note = leftOutNote(model);
  const counts = countsLine(model, plan);

  let ftSub = "Type a score you expect, and we work out what the rest need.";
  if (fineTune) {
    ftSub = 'Type a score in the "I expect" box on any row. The others update.';
    if (hasLocks) {
      const was = before.p !== null && (before.kind === "doable" || before.kind === "ontrack") ? ` (was ${up1(before.p).toFixed(1)}% each)` : "";
      ftSub =
        plan.free > 0
          ? `You typed ${things(typedCount).replace("thing", "score")}, so we worked out the other ${plan.free} again${was}.`
          : `You typed a score for every one, so there's nothing left to work out.`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="modal-backdrop absolute inset-0 cursor-default" onClick={onClose} aria-label="Close grade calculator" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-title"
        tabIndex={-1}
        className="modal-in relative flex h-[min(700px,100%)] w-full max-w-[1000px] flex-col"
        style={{ outline: "none" }}
      >
        <section
          className="modal-glow relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] bg-[var(--surface)]"
          style={{ "--c": course.color, color: "var(--ink)" }}
        >
          {/* Header */}
          <header className="flex min-h-[72px] shrink-0 items-center gap-4 border-b border-[var(--line)] py-2.5 pl-5 pr-4 sm:pl-7">
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <h2 id="calc-title" className="font-display text-[21px] font-extrabold leading-tight tracking-[-0.3px]">
                Grade calculator
              </h2>
              {/* Long class names wrap instead of being cut off. */}
              <span className="flex min-w-0 items-baseline gap-[7px] text-[13px] font-semibold leading-snug" style={{ color: SOFT }}>
                <span className="c-dot h-[9px] w-[9px] shrink-0 translate-y-[-1px] rounded-full" aria-hidden="true" />
                <span className="min-w-0">
                  {course.name}
                  {course.code && <span className="ml-1.5 whitespace-nowrap" style={{ color: MUTED }}>{course.code}</span>}
                </span>
              </span>
            </div>
            <div className="hidden shrink-0 items-baseline gap-2 pr-2 sm:flex">
              <span className="text-[13px] font-semibold" style={{ color: MUTED }}>
                Your grade right now
              </span>
              <span className="font-display text-xl font-extrabold tabular-nums">{current === null ? "–" : pct1(current)}</span>
              {currentLetter && (
                <span className="text-[13px] font-extrabold" style={{ color: SOFT }}>
                  {currentLetter}
                </span>
              )}
            </div>
            <button
              ref={helpBtnRef}
              onClick={() => (help ? closeHelp() : setHelp(true))}
              aria-expanded={help}
              aria-controls="calc-help"
              className="btn btn-soft h-8 shrink-0 rounded-full px-2.5 text-[12.5px]"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2.2-2.4 3.6M12 17h.01" />
              </svg>
              How this works
            </button>
            <button onClick={onClose} className="calc-icon-btn grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" aria-label="Close grade calculator">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          {/* Body */}
          {!data && <CalcSkeleton />}
          {data?.error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="font-display text-lg font-extrabold">Couldn&apos;t load this class from Canvas.</p>
              <p className="text-sm" style={{ color: MUTED }}>
                Try again in a minute. {course.gradesUrl ? "You can still see your grades in Canvas." : ""}
              </p>
              {course.gradesUrl && (
                <a href={course.gradesUrl} target="_blank" rel="noreferrer" className="btn btn-secondary mt-2 h-10 px-4 text-sm">
                  Grades in Canvas
                </a>
              )}
            </div>
          )}
          {breakdown && (
            <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[392px_minmax(0,1fr)] lg:overflow-hidden">
              {/* Left: (1) goal, (2) the answer */}
              <div className="flex min-h-0 flex-col gap-[22px] border-[var(--line)] bg-[var(--well)] px-5 py-6 sm:px-7 lg:overflow-y-auto lg:border-r">
                <section aria-labelledby="calc-s1" className="flex flex-col gap-3">
                  <div className="flex items-start gap-2.5">
                    <StepNumber n={1} />
                    <div className="flex flex-col gap-[3px]">
                      <h3 id="calc-s1" className="font-display text-[17px] font-extrabold leading-6 tracking-[-0.2px]">
                        What final grade do you want?
                      </h3>
                      <p className="text-[12.5px] leading-[1.4]" style={{ color: MUTED }}>
                        {goalMode ? "Your final grade is the one Canvas shows when the term ends." : "Pick a grade to see what each assignment needs."}
                      </p>
                    </div>
                  </div>
                  {goalMode && (
                    <button onClick={reset} className="text-link flex items-center gap-1 self-start rounded-md px-0.5 py-1 text-[12.5px] font-bold" style={{ color: MUTED }}>
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 6l-6 6 6 6" />
                      </svg>
                      Back to where I stand
                    </button>
                  )}
                  {!goalMode && saved !== null && saved !== undefined && (
                    <button onClick={() => pickTarget(saved)} className="calc-goal-chip flex items-center gap-2 self-start rounded-full py-1.5 pl-3 pr-3.5 text-[13px] font-semibold">
                      <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
                      <span style={{ color: SOFT }}>Your goal: {goalText(Number(saved), scale)}</span>
                      <span className="font-extrabold">Use it</span>
                    </button>
                  )}
                  <div role="group" aria-label="Pick a letter from this class's grading scale" className="grid grid-cols-5 gap-1.5">
                    {letters.map((l) => {
                      const on = tValid && Math.abs(tNum - l.value) < 1e-9;
                      return (
                        <button key={l.label} onClick={() => pickTarget(l.value)} aria-pressed={on} className="calc-goal flex h-[50px] flex-col items-center justify-center gap-px rounded-[12px]">
                          <span className="font-display text-base font-extrabold leading-none">{l.label}</span>
                          <span className="text-[11px] font-semibold tabular-nums opacity-80">{trim(l.value)}%</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <label htmlFor="calc-target" className="text-[13px] font-semibold" style={{ color: SOFT }}>
                      Or type your own
                    </label>
                    <span className="relative inline-flex">
                      <input
                        id="calc-target"
                        inputMode="decimal"
                        autoComplete="off"
                        value={targetStr}
                        placeholder="–"
                        onChange={(e) => {
                          const v = cleanNumber(e.target.value);
                          if (v === "" && !goalMode) return;
                          pickTarget(v);
                        }}
                        aria-invalid={goalMode && !tValid}
                        className="h-9 w-[88px] rounded-[10px] bg-[var(--field)] pl-3 pr-7 text-[15px] font-extrabold tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-[11px] top-[9px] text-[13px] font-extrabold" style={{ color: MUTED }}>
                        %
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold" style={{ color: tValid || !goalMode ? MUTED : "var(--red-fg)" }}>
                      {!goalMode ? "" : tValid ? (letterFor(tNum, scale) ? `= ${letterFor(tNum, scale)}` : "") : "Type 1 to 100"}
                    </span>
                  </div>
                </section>

                <div className="h-px shrink-0 bg-[var(--line)]" />

                {!goalMode ? (
                  <StandSection stand={stand} current={current} currentLetter={currentLetter} weighted={model.weighted} />
                ) : (
                  <section aria-labelledby="calc-s2" aria-live="polite" className="flex flex-col gap-3.5">
                    <div className="flex items-center gap-2.5">
                      <StepNumber n={2} />
                      <h3 id="calc-s2" className="font-display text-[17px] font-extrabold tracking-[-0.2px]">
                        Here&apos;s what it takes
                      </h3>
                    </div>
                    <p className="font-display text-[25px] font-bold leading-[1.22] tracking-[-0.4px]">{ans.big}</p>
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-extrabold" style={TONES[ans.tone]}>
                        {ans.chip}
                      </span>
                      <p className="pt-0.5 text-[13px] leading-[1.45]" style={{ color: SOFT }}>
                        {ans.why}
                      </p>
                    </div>
                    {ans.fix && (
                      <button onClick={() => pickTarget(ans.fix.value)} className="btn btn-secondary h-9 self-start px-3.5 text-[13px]">
                        Aim for {withArticle(ans.fix.label)} instead
                      </button>
                    )}
                    <div
                      className="flex flex-col gap-[9px] pt-0.5"
                      aria-label={`Your scores so far average ${current === null ? "nothing yet" : curText}.${needPct !== null ? ` You need ${up1(needPct).toFixed(1)}% on what's left.` : ""}`}
                    >
                      <Bar label="Your scores so far" value={current} text={current === null ? "–" : curText} />
                      <Bar
                        label={needLabel}
                        strong
                        value={needPct}
                        text={needPct === null ? "–" : `${up1(needPct).toFixed(1)}%`}
                        color={plan.kind === "impossible" ? "var(--red-fg)" : "var(--c)"}
                      />
                    </div>
                    {counts && (
                      <p className="text-[12.5px] font-semibold leading-[1.45]" style={{ color: SOFT }}>
                        {counts}
                      </p>
                    )}
                    {showRange && (
                      <p className="text-xs leading-[1.45] tabular-nums" style={{ color: MUTED }}>
                        Lowest you could finish: {pct1(plan.a0)} (a 0 on everything left). Highest: {pct1(plan.a1)} (100% on everything left).
                      </p>
                    )}
                  </section>
                )}
              </div>

              {/* Right: (3) each one, (4) fine-tune */}
              <div className="flex min-h-0 flex-col">
                <div className="flex shrink-0 items-start gap-2.5 px-5 pb-2.5 pt-6 sm:px-7">
                  <StepNumber n={3} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <h3 className="font-display text-[17px] font-extrabold leading-6 tracking-[-0.2px]">Your work, graded and still to come</h3>
                    <p className="text-[12.5px] leading-[1.4]" style={{ color: MUTED }}>
                      {listHint}
                    </p>
                  </div>
                  <div className="mt-0.5 flex shrink-0 items-center gap-3">
                    {anyGraded && (
                      <button onClick={() => setShowGraded(!showGraded)} aria-pressed={showGraded} className="text-link rounded-md px-0.5 py-1 text-[12.5px] font-bold" style={{ color: MUTED }}>
                        {showGraded ? "Hide graded" : "Show graded"}
                      </button>
                    )}
                    <button onClick={() => setDetails(!details)} aria-pressed={details} className="text-link rounded-md px-0.5 py-1 text-[12.5px] font-bold" style={{ color: MUTED }}>
                      {details ? "Hide details" : "Show details"}
                    </button>
                  </div>
                </div>

                {/* Same side padding and scrollbar gutter as the list below, so the columns line up. */}
                <div className="shrink-0 overflow-hidden pl-5 pr-3 [scrollbar-gutter:stable] sm:pl-7 sm:pr-5">
                  <div className="calc-cols grid items-end gap-x-4 border-b border-[var(--line)] px-[13px] pb-2" style={{ gridTemplateColumns: cols }}>
                    <span className="calc-cap">Assignment</span>
                    <span className="calc-cap">Due</span>
                    {fineTuneOn && <span className="calc-cap">I expect</span>}
                    {details && <span className="calc-cap text-right">Share of final</span>}
                    <span className="calc-cap text-right">{needHead}</span>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4 pl-5 pr-3 pt-3 [scrollbar-gutter:stable] sm:pl-7 sm:pr-5">
                  {!model.groups.length && !model.zeroGroups.length && (
                    <p className="py-6 text-sm" style={{ color: SOFT }}>
                      Canvas doesn&apos;t list any assignments or categories for this class yet.
                    </p>
                  )}
                  {/* Each category is its own card (CLASS-15): a header with the name, its weight and a
                      graded / still to come bar, then its rows. */}
                  {[...model.groups, ...model.zeroGroups].map((g) => (
                    <div key={g.id} className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                      <CategoryHeader g={g} weighted={model.weighted} />
                      <div className="flex flex-col px-3 py-1.5">
                        {showGraded && g.graded.map((r) => <GradedRow key={r.id} r={r} cols={cols} fineTune={fineTuneOn} details={details} />)}
                        {g.open.map((it) =>
                          g.zero ? (
                            <ZeroRow key={it.id} it={it} cols={cols} fineTune={fineTuneOn} details={details} />
                          ) : (
                            <ItemRow
                              key={it.id}
                              it={it}
                              group={g}
                              cols={cols}
                              plan={plan}
                              goalMode={goalMode}
                              reachedAll={reachedAll}
                              fineTune={fineTuneOn}
                              details={details}
                              typed={locks[it.id] ?? ""}
                              onType={(v) => setLock(it.id, v)}
                            />
                          )
                        )}
                        {!showGraded && !g.open.length && (
                          <p className="py-2 text-[12.5px] font-semibold" style={{ color: MUTED }}>
                            All graded. Show graded to see the scores.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {note && (
                    <p className="shrink-0 rounded-xl bg-[var(--surface-2)] px-3.5 py-3 text-[12.5px] leading-[1.45]" style={{ color: SOFT }}>
                      <b className="font-bold">Not in this list:</b> {note}
                    </p>
                  )}
                </div>

                {plan.open > 0 && !goalMode && (
                  <div className="mx-5 mb-4 flex shrink-0 items-center gap-3 rounded-[14px] bg-[var(--well)] px-3.5 py-3 sm:ml-7" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
                    <StepNumber n={4} soft />
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="text-sm font-extrabold" style={{ color: SOFT }}>
                        Already know a score? Fine-tune it{" "}
                        <span className="font-semibold" style={{ color: MUTED }}>
                          (optional)
                        </span>
                      </span>
                      <span className="text-[12.5px]" style={{ color: MUTED }}>
                        Pick a grade first. Then you can type scores you expect.
                      </span>
                    </span>
                  </div>
                )}
                {plan.open > 0 && goalMode && (
                  <div
                    className="mx-5 mb-4 flex shrink-0 flex-col gap-2 rounded-[14px] px-3.5 py-3 sm:ml-7"
                    style={{ boxShadow: `inset 0 0 0 1.5px ${fineTune ? "var(--c)" : "var(--line)"}`, background: fineTune ? "var(--surface)" : "var(--well)" }}
                  >
                    <button onClick={() => setFineTune(!fineTune)} aria-expanded={fineTune} className="calc-fold flex w-full items-center gap-3 rounded-xl text-left">
                      <StepNumber n={4} soft />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="calc-fold-title text-sm font-extrabold">
                          Already know a score? Fine-tune it{" "}
                          <span className="font-semibold" style={{ color: MUTED }}>
                            (optional)
                          </span>
                        </span>
                        <span className="text-[12.5px]" style={{ color: MUTED }}>
                          {ftSub}
                        </span>
                      </span>
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ color: MUTED, transform: fineTune ? "rotate(180deg)" : undefined }}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {fineTune && hasLocks && (
                      <div className="flex items-center pl-9">
                        <button onClick={() => setLocks({})} className="text-link ml-auto rounded-md px-0.5 py-1 text-[12.5px] font-bold" style={{ color: MUTED }}>
                          Clear my scores
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <footer className="flex min-h-16 shrink-0 flex-wrap items-center gap-2.5 border-t border-[var(--line)] py-3 pl-5 pr-5 sm:pl-7">
            <p className="min-w-0 flex-1 basis-60 text-xs leading-[1.4]" style={{ color: MUTED }}>
              {breakdown && !breakdown.weighted ? "Uses this class's points from Canvas." : "Uses this class's weights from Canvas."} Nothing here changes Canvas. If your teacher drops a lowest score, you may need a little less.
            </p>
            {saveState === "saved" && (
              <span className="shrink-0 text-[13px] font-extrabold" style={{ color: "var(--green-fg)" }} role="status">
                Saved: {goalText(saved, scale)}
              </span>
            )}
            {saveState === "error" && (
              <span className="shrink-0 text-[13px] font-extrabold" style={{ color: "var(--red-fg)" }} role="alert">
                Couldn&apos;t save. Try again.
              </span>
            )}
            <button onClick={reset} className="btn btn-soft h-9 px-3.5 text-[13px]" disabled={!breakdown}>
              Reset
            </button>
            <button onClick={save} className="btn btn-primary h-9 px-3.5 text-[13px]" disabled={!breakdown || !goalMode || !tValid || saveState === "saving"}
              title={goalMode ? undefined : "Pick a grade first"}>
              Save as my goal
            </button>
            <button onClick={onClose} className="btn btn-secondary h-9 px-3.5 text-[13px]">
              Close
            </button>
          </footer>

          {help && (
            <div
              id="calc-help"
              role="dialog"
              aria-labelledby="calc-help-title"
              className="calc-help absolute right-4 top-16 z-10 flex w-[min(360px,calc(100%-32px))] flex-col gap-3 rounded-[18px] bg-[var(--surface)] px-[18px] pb-4 pt-[18px] sm:right-16"
            >
              <span aria-hidden="true" className="calc-help-tip absolute -top-[7px] right-[72px] h-3.5 w-3.5 rotate-45 bg-[var(--surface)]" />
              <h3 id="calc-help-title" className="font-display text-[17px] font-extrabold">
                New here? This takes 3 steps
              </h3>
              <ol className="flex flex-col gap-2.5">
                <HelpStep n={1}>
                  <b style={{ color: "var(--ink)" }}>Pick the grade you want</b> to end the class with.
                </HelpStep>
                <HelpStep n={2}>
                  We look at <b style={{ color: "var(--ink)" }}>your scores so far</b> and how much each part of the class counts, then show what you need on everything not graded yet.
                </HelpStep>
                <HelpStep n={3}>
                  It&apos;s just a planner. <b style={{ color: "var(--ink)" }}>Nothing here changes Canvas</b> or your real grades.
                </HelpStep>
              </ol>
              <button
                onClick={() => {
                  closeHelp();
                  helpBtnRef.current?.focus();
                }}
                className="btn btn-primary h-9 self-end px-3.5 text-[13px]"
              >
                Got it
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HelpStep({ n, children }) {
  return (
    <li className="flex gap-2.5 text-[13px] leading-[1.45]" style={{ color: SOFT }}>
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[11.5px] font-extrabold" style={{ color: "var(--ink)" }}>
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Bar({ label, value, text, strong = false, color = "var(--line-2)" }) {
  const w = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)_52px] items-center gap-2.5">
      <span className="text-[12.5px]" style={{ color: strong ? "var(--ink)" : MUTED, fontWeight: strong ? 700 : 600 }}>
        {label}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${w}%`, background: color }} />
      </span>
      <span className="text-right text-[13px] tabular-nums" style={{ fontWeight: strong ? 800 : 700, color: strong ? "var(--ink)" : SOFT }}>
        {text}
      </span>
    </div>
  );
}

function ItemRow({ it, group, cols, plan, goalMode = true, reachedAll, fineTune, details, typed, onType }) {
  const lock = lockValue(typed);
  const mine = goalMode && lock !== null;
  let need = "";
  let pctText = "";
  let needStyle = {};
  let pctStyle = { fontSize: 12, fontWeight: 600, color: MUTED };
  if (!goalMode) {
    // Where you stand (CLASS-14): the item's status instead of what it needs.
    need = openStatusText(it);
    needStyle = {
      fontSize: 12.5,
      fontWeight: 700,
      whiteSpace: "normal",
      textAlign: "right",
      color: it.submitted ? "var(--brand-text)" : it.missing ? "var(--red-fg)" : MUTED,
    };
  } else if (mine) {
    need = "You typed";
    pctText = `${trim(lock * 100)}%`;
    needStyle = { fontSize: 12.5, fontWeight: 700, color: MUTED };
  } else if (reachedAll) {
    need = "Anything";
    needStyle = { color: "var(--green-fg)" };
  } else if (plan.kind === "impossible") {
    need = it.placeholder ? "Full marks" : `${trim(it.points)} / ${trim(it.points)}`;
    pctText = "100%";
    needStyle = { color: MUTED };
  } else if (plan.p !== null) {
    const p = plan.p / 100;
    if (it.placeholder) {
      pctText = `${up1(plan.p).toFixed(1)}%`;
      pctStyle = { fontSize: 14, fontWeight: 800, color: "var(--ink)" };
    } else {
      need = `${trim(halfUp(p * it.points))} / ${trim(it.points)}`;
      pctText = `${up1(plan.p).toFixed(1)}%`;
    }
  } else {
    need = "–";
    needStyle = { color: MUTED };
  }
  const tip = `${it.name}: ${it.placeholder ? "not posted yet" : `${trim(it.points)} points`}, worth ${it.share.toFixed(1)}% of your final grade`;
  return (
    <div
      className={`${mine ? "c-tint" : "row-hover"} -mx-2 grid min-h-12 items-center gap-x-4 rounded-[10px] px-2 py-1.5`}
      style={{ gridTemplateColumns: cols }}
      title={tip}
    >
      <div className="flex min-w-0 flex-col gap-px">
        {/* Long names wrap (the row grows) instead of ending in "...". A slash is a place to break. */}
        <span className="text-[13.5px] font-semibold leading-snug [overflow-wrap:anywhere]">{it.name.replaceAll("/", "/\u200B")}</span>
        {it.placeholder && (
          <span className="text-[11.5px] leading-snug" style={{ color: MUTED }}>
            {goalMode ? `Not posted yet, counts as one item worth ${trim(group.weight)}%` : `Counts as one item worth ${trim(group.weight)}%`}
          </span>
        )}
        {goalMode && <OpenStatus it={it} />}
      </div>
      <span className="text-[12.5px] font-semibold leading-snug" style={{ color: it.dueAt ? SOFT : MUTED }}>
        {it.placeholder ? (goalMode ? "Not posted yet" : "No date yet") : dueText(it.dueAt)}
      </span>
      {fineTune && (
        <span className="relative inline-flex">
          <input
            inputMode="decimal"
            autoComplete="off"
            aria-label={`Score you expect on ${it.name}, percent`}
            placeholder="–"
            value={typed}
            onChange={(e) => onType(cleanNumber(e.target.value))}
            className={`h-8 w-[76px] rounded-[9px] pl-2.5 pr-6 text-[13.5px] font-extrabold tabular-nums ${mine ? "calc-typed bg-[var(--surface)]" : "bg-[var(--field)]"}`}
          />
          <span className="pointer-events-none absolute left-[57px] top-2 text-xs font-bold" style={{ color: MUTED }}>
            %
          </span>
        </span>
      )}
      {details && (
        <span className="text-right text-[12.5px] font-semibold tabular-nums" style={{ color: MUTED }}>
          {it.share.toFixed(1)}%
        </span>
      )}
      <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
        {need && (
          <span className="text-sm font-extrabold tabular-nums" style={needStyle}>
            {need}
          </span>
        )}
        {goalMode && (
          <span className="w-[50px] text-right tabular-nums" style={pctStyle}>
            {pctText}
          </span>
        )}
      </div>
    </div>
  );
}

// A category card's header (CLASS-15): name, a weight pill, the graded / left summary, and a thin
// bar of how much of the category's points are graded (solid) vs still to come.
function CategoryHeader({ g, weighted }) {
  const sum = groupSummary(g, weighted);
  const pill = g.zero ? "Doesn't count" : weighted ? `${trim(g.weight)}% of grade` : `${trim(g.possible)} pts`;
  const done = g.zero ? null : g.possible > 0 ? Math.max(0, Math.min(1, g.gradedPossible / g.possible)) : 0;
  const right = [sum.graded, sum.left].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--line)] bg-[var(--well)] px-[13px] pb-2.5 pt-2.5">
      {/* Long category names wrap onto a second line instead of being cut off. */}
      <div className="flex items-center gap-2.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-[15px] font-extrabold leading-snug tracking-[-0.1px]" style={g.zero ? { color: SOFT } : undefined}>
            {g.name}
          </span>
          <span className="whitespace-nowrap rounded-full bg-[var(--chip)] px-2 py-0.5 text-[11.5px] font-bold tabular-nums" style={{ color: SOFT }}>
            {pill}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: MUTED }}>
          {right}
        </span>
      </div>
      {done !== null && (
        <span className="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]" title={`${Math.round(done * 100)}% of this category is graded`} aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${done * 100}%`, background: "var(--c)" }} />
        </span>
      )}
    </div>
  );
}

// (2) in Where you stand (CLASS-14): the grade today, counts, the 0 / 100% bounds and each
// category's average so far. Facts only; picking a grade switches to the plan.
function StandSection({ stand: s, current, currentLetter, weighted }) {
  return (
    <section aria-labelledby="calc-s2" className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <StepNumber n={2} />
        <h3 id="calc-s2" className="font-display text-[17px] font-extrabold tracking-[-0.2px]">
          Where you stand now
        </h3>
      </div>
      <p className="font-display text-[25px] font-bold leading-[1.22] tracking-[-0.4px]">
        {current === null ? "Nothing is graded yet." : `You're at ${pct1(current)}${currentLetter ? ` (${currentLetter})` : ""} right now.`}
      </p>
      <ul className="flex flex-col gap-1 text-[13px] leading-[1.45]" style={{ color: SOFT }}>
        <li>
          <b className="font-bold" style={{ color: "var(--ink)" }}>
            {s.graded} graded {s.graded === 1 ? "score" : "scores"}
          </b>{" "}
          so far.
        </li>
        <li>{toComeText(s)}</li>
      </ul>
      {s.open > 0 && s.a0 !== null && (
        <div className="grid grid-cols-2 gap-2">
          <Bound label="With 0 on the rest" value={s.a0} />
          <Bound label="With 100% on the rest" value={s.a1} />
        </div>
      )}
      {s.categories.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <span className="calc-cap">{weighted ? "Each category so far" : "Each category so far (points)"}</span>
          {s.categories.map((c) => (
            <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_74px_48px] items-center gap-2.5">
              <span className="min-w-0 text-[12.5px] font-semibold leading-snug [overflow-wrap:anywhere]">
                {c.name}{" "}
                <span className="whitespace-nowrap" style={{ color: MUTED }}>
                  · {weighted ? `${trim(c.weight)}%` : `${trim(c.possible)} pts`}
                </span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <span className="block h-full rounded-full" style={{ width: `${c.pct === null ? 0 : Math.max(0, Math.min(100, c.pct))}%`, background: "var(--line-2)" }} />
              </span>
              <span className="text-right text-[12.5px] tabular-nums" style={{ fontWeight: c.pct === null ? 600 : 700, color: c.pct === null ? MUTED : SOFT }}>
                {c.pct === null ? "–" : pct1(c.pct)}
              </span>
            </div>
          ))}
          <p className="text-xs leading-[1.45]" style={{ color: MUTED }}>
            &ldquo;–&rdquo; means nothing is graded there yet.
          </p>
        </div>
      )}
    </section>
  );
}

function Bound({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--surface)] px-3 py-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}>
      <span className="text-[11.5px] font-semibold leading-snug" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="font-display text-lg font-extrabold tabular-nums">{value === null ? "–" : pct1(value)}</span>
    </div>
  );
}

// Under an open row's name: turned in and waiting for a grade, or marked missing (CLASS-13).
// Turned-in work still counts as "still to come" in the plan until Canvas has a score.
function OpenStatus({ it }) {
  if (it.submitted) {
    return (
      <span className="flex items-center gap-1 text-[11.5px] font-semibold leading-snug" style={{ color: "var(--brand-text)" }}>
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {it.late ? "Submitted late" : "Submitted"} · waiting for a grade
      </span>
    );
  }
  if (it.missing) {
    return (
      <span className="text-[11.5px] font-semibold leading-snug" style={{ color: "var(--red-fg)" }}>
        Marked missing in Canvas
      </span>
    );
  }
  return null;
}

// Empty cells so a read-only row lines up with the "I expect" and "Share of final" columns.
function Spacers({ fineTune, details }) {
  return (
    <>
      {fineTune && <span />}
      {details && <span />}
    </>
  );
}

const num = (n) => `${+Number(n).toFixed(2)}`;

// A graded (or excused) assignment: read-only and dimmed, with the real score (CLASS-13).
function GradedRow({ r, cols, fineTune, details }) {
  return (
    <div
      className="row-hover -mx-2 grid min-h-9 items-center gap-x-4 rounded-[10px] px-2 py-1"
      style={{ gridTemplateColumns: cols }}
      title={`${r.name}: ${scoreText(r)}`}
    >
      <span className="min-w-0 text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: SOFT }}>
        {r.name.replaceAll("/", "/\u200B")}
      </span>
      <span className="flex items-center gap-1 text-xs font-bold leading-snug" style={{ color: r.excused ? MUTED : "var(--green-fg)" }}>
        {!r.excused && (
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
        {r.excused ? "Excused" : "Graded"}
      </span>
      <Spacers fineTune={fineTune} details={details} />
      <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
        {r.excused ? (
          <span className="text-[12.5px] font-semibold" style={{ color: MUTED }}>
            Doesn&apos;t count
          </span>
        ) : (
          <>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: SOFT }}>
              {r.pct === null ? `${num(r.score)} pts` : `${num(r.score)} / ${num(r.points)}`}
            </span>
            <span className="w-[50px] text-right text-xs font-semibold tabular-nums" style={{ color: MUTED }}>
              {r.pct === null ? "" : pct1(r.pct)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// Open work in a category worth 0%: listed so nothing seems missing, but it needs nothing.
function ZeroRow({ it, cols, fineTune, details }) {
  return (
    <div className="row-hover -mx-2 grid min-h-9 items-center gap-x-4 rounded-[10px] px-2 py-1" style={{ gridTemplateColumns: cols }}>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: SOFT }}>
          {it.name.replaceAll("/", "/\u200B")}
        </span>
        <OpenStatus it={it} />
      </div>
      <span className="text-[12.5px] font-semibold leading-snug" style={{ color: MUTED }}>
        {dueText(it.dueAt)}
      </span>
      <Spacers fineTune={fineTune} details={details} />
      <span className="text-right text-[12.5px] font-semibold" style={{ color: MUTED }}>
        Doesn&apos;t count
      </span>
    </div>
  );
}

// Placeholder shaped like the calculator while the class loads, so nothing jumps.
function CalcSkeleton() {
  const box = "settings-skeleton rounded-xl bg-[var(--surface-2)]";
  return (
    <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[392px_minmax(0,1fr)]" aria-label="Loading this class" role="status">
      <div className="flex flex-col gap-4 border-[var(--line)] bg-[var(--well)] px-7 py-6 lg:border-r">
        <div className={`${box} h-6 w-3/4`} />
        <div className="grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`${box} h-[50px]`} />
          ))}
        </div>
        <div className={`${box} h-9 w-1/2`} />
        <div className={`${box} mt-4 h-16`} />
        <div className={`${box} h-10`} />
      </div>
      <div className="hidden flex-col gap-3 px-7 py-6 lg:flex">
        <div className={`${box} h-6 w-1/2`} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${box} h-10`} />
        ))}
      </div>
    </div>
  );
}
