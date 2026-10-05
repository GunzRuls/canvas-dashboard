// Grade calculator (CLASS-10): pure helpers, no server imports, so tests and the browser share them.
// Same rules as lib/gradeMath.js and lib/gradeGoals.js:
//   weighted class: final = Σ weight × earned / possible per counted category ÷ Σ weights.
//     Categories worth 0% don't count. A counted category with nothing posted yet (often the
//     final exam) counts as one 100-point item still to come.
//   points class: final = all points earned ÷ all points possible.
//   Extra credit / bonus categories (by name) are optional, so they're left out of the plan.
// The plan: every open item that you haven't typed a score for gets the same percent p, and p is
// solved in a straight line between "0 on all of them" and "100% on all of them". Items you typed
// a score for ("I expect 85%") keep it.
import { letterFor, letterScale } from "./gradeGoals.js";

const BONUS = /bonus|extra credit/i;
const EPS = 1e-9;

// The class as the calculator sees it: counted categories with their open (not graded) items and,
// for showing only (CLASS-13), their graded and excused items; categories worth 0% (listed at the
// bottom, never in the math); and the extra credit categories that are left out (the note).
export function calcModel(breakdown) {
  if (!breakdown) return null;
  const weighted = Boolean(breakdown.weighted);
  const groups = [];
  const zeroGroups = []; // categories worth 0%: shown, but they don't change the grade
  const zeroWeight = []; // names of open items in 0% categories
  const bonus = []; // names of extra credit categories
  for (const g of breakdown.groups || []) {
    const all = g.assignments || [];
    const live = all.filter((a) => !a.excused);
    if (BONUS.test(g.name || "")) {
      if (live.length || (weighted && g.weight > 0)) bonus.push(g.name);
      continue;
    }
    const graded = live.filter((a) => a.graded);
    const done = gradedRows(all);
    const open = live
      .filter((a) => !a.graded && a.points > 0)
      .map((a) => ({
        id: String(a.id),
        name: a.name,
        points: a.points,
        dueAt: a.dueAt || null,
        placeholder: false,
        submitted: Boolean(a.submitted),
        missing: Boolean(a.missing),
        late: Boolean(a.late),
      }));
    if (weighted && !(g.weight > 0)) {
      for (const a of open) zeroWeight.push(a.name);
      if (done.length || open.length) zeroGroups.push({ id: String(g.id), name: g.name, weight: 0, graded: done, open, zero: true });
      continue;
    }
    const earned = graded.reduce((s, a) => s + (Number(a.score) || 0), 0);
    let possible = graded.reduce((s, a) => s + (a.points || 0), 0) + open.reduce((s, a) => s + a.points, 0);
    if (weighted && possible <= 0) {
      // Nothing posted yet: one placeholder worth the whole category.
      open.push({ id: `unposted-${g.id}`, name: g.name, points: 100, dueAt: null, placeholder: true, submitted: false, missing: false, late: false });
      possible = 100;
    }
    if (!weighted && possible <= 0) continue;
    groups.push({
      id: String(g.id),
      name: g.name,
      weight: weighted ? g.weight : 0,
      earned,
      gradedPossible: graded.reduce((s, a) => s + (a.points || 0), 0),
      gradedCount: graded.length,
      possible,
      open,
      graded: done,
    });
  }
  const weightSum = groups.reduce((s, g) => s + g.weight, 0);
  const pointsSum = groups.reduce((s, g) => s + g.possible, 0);
  // Each open item's share of the final grade, in percent ("Share of final").
  for (const g of groups) {
    for (const it of g.open) {
      it.share = weighted
        ? weightSum > 0 ? (g.weight * (it.points / g.possible) / weightSum) * 100 : 0
        : pointsSum > 0 ? (it.points / pointsSum) * 100 : 0;
    }
  }
  return { weighted, groups, zeroGroups, weightSum, pointsSum, zeroWeight, bonus };
}

// A category's graded and excused work as read-only rows (CLASS-13), in Canvas's order:
// { id, name, points, score, pct (null when the item is worth 0 points), excused }.
export function gradedRows(assignments) {
  return (assignments || [])
    .filter((a) => a.graded || a.excused)
    .map((a) => {
      const excusedRow = Boolean(a.excused);
      const score = excusedRow ? null : Number(a.score) || 0;
      return {
        id: String(a.id),
        name: a.name,
        points: a.points || 0,
        score,
        pct: !excusedRow && a.points > 0 ? (score / a.points) * 100 : null,
        excused: excusedRow,
      };
    });
}

// How a graded row's score reads: "76.67 / 100 · 76.7%", "Excused, doesn't count", or "3 pts" for
// work worth 0 points.
export function scoreText(row) {
  if (row.excused) return "Excused, doesn't count";
  const pts = `${+Number(row.score).toFixed(2)}`;
  if (row.pct === null) return `${pts} pts`;
  return `${pts} / ${+Number(row.points).toFixed(2)} · ${pct1(row.pct)}`;
}

// The small summary next to a category's name (CLASS-13):
//   weight: "counts for 15%" | "120 points in all" | "doesn't count toward your grade"
//   graded: "3 graded (74.6%)" | "" when nothing is graded
//   left:   "1 left" | "All graded" | "Not posted yet" (a counted category with nothing in Canvas)
export function groupSummary(g, weighted) {
  const scored = (g.graded || []).filter((r) => !r.excused);
  const pts = scored.reduce((s, r) => s + r.points, 0);
  const got = scored.reduce((s, r) => s + r.score, 0);
  const real = g.open.filter((it) => !it.placeholder);
  const weight = g.zero
    ? "doesn't count toward your grade"
    : weighted ? `counts for ${trim(g.weight)}%` : `${trim(g.possible)} points in all`;
  const graded = scored.length ? `${scored.length} graded${pts > 0 ? ` (${trim((got / pts) * 100)}%)` : ""}` : "";
  const left = real.length ? `${real.length} left` : g.open.length ? "Not posted yet" : "All graded";
  return { weight, graded, left };
}

// The line under the bars (CLASS-13): graded scores count, and the plan covers what's left.
// "Counts your 4 graded scores; the plan is for the 6 things still to come (2 turned in, waiting
// for a grade)."
export function countsLine(model, plan) {
  if (!model || !model.groups.length) return "";
  const graded = model.groups.reduce((s, g) => s + g.gradedCount, 0);
  const open = model.groups.flatMap((g) => g.open);
  const waiting = open.filter((it) => it.submitted).length;
  const scores = `${graded} graded score${graded === 1 ? "" : "s"}`;
  const rest = plan?.open ?? open.length;
  const wait = waiting ? ` (${waiting} turned in, waiting for a grade)` : "";
  if (!rest) return graded ? `Counts your ${scores}. Nothing is left to plan.` : "";
  const thing = `${rest} thing${rest === 1 ? "" : "s"}`;
  if (!graded) return `Nothing is graded yet, so the plan is for ${rest === 1 ? "the one thing" : `all ${thing}`} still to come${wait}.`;
  return `Counts your ${scores}; the plan is for the ${thing} still to come${wait}.`;
}

// "Where you stand" (CLASS-14): the calculator's opening view, before any goal is picked. Plain
// facts about the class as Canvas has it today:
//   graded: counted scores so far (excused and 0% categories left out)
//   open: things still to come in counted categories (a "not posted yet" category counts as one)
//   waiting: turned in, waiting for a grade · missing: marked missing · unposted: categories with
//   nothing posted yet
//   a0 / a1: the final grade with 0 / 100% on everything left (same math as the plan's bounds)
//   categories: [{ id, name, weight, possible, pct (average of graded work, null when nothing is
//     graded), graded, left, unposted, done (graded share of the category's points, 0 to 1) }]
export function standing(model) {
  const empty = { graded: 0, open: 0, waiting: 0, missing: 0, unposted: 0, a0: null, a1: null, categories: [] };
  if (!model) return empty;
  const open = model.groups.flatMap((g) => g.open);
  const categories = model.groups.map((g) => {
    const real = g.open.filter((it) => !it.placeholder);
    return {
      id: g.id,
      name: g.name,
      weight: g.weight,
      possible: g.possible,
      pct: g.gradedCount && g.gradedPossible > 0 ? (g.earned / g.gradedPossible) * 100 : null,
      graded: g.gradedCount,
      left: real.length,
      unposted: g.open.some((it) => it.placeholder),
      done: g.possible > 0 ? g.gradedPossible / g.possible : 0,
    };
  });
  return {
    graded: model.groups.reduce((s, g) => s + g.gradedCount, 0),
    open: open.length,
    waiting: open.filter((it) => it.submitted).length,
    missing: open.filter((it) => it.missing && !it.submitted).length,
    unposted: open.filter((it) => it.placeholder).length,
    a0: finalAt(model, 0),
    a1: finalAt(model, 1),
    categories,
  };
}

// The "still to come" line for Where you stand: "6 still to come: 2 turned in and waiting for a
// grade, 3 not posted yet." | "Nothing left to come. Everything is graded."
export function toComeText(s) {
  if (!s.open) return "Nothing left to come. Everything is graded.";
  const parts = [];
  if (s.waiting) parts.push(`${s.waiting} turned in and waiting for a grade`);
  if (s.missing) parts.push(`${s.missing} marked missing`);
  if (s.unposted) parts.push(`${s.unposted} not posted yet`);
  return `${s.open} still to come${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

// An open row's status in Where you stand (the column that shows "You need" once a goal is picked).
export function openStatusText(it) {
  if (it.placeholder) return "Not posted yet";
  if (it.submitted) return `${it.late ? "Submitted late" : "Submitted"} · waiting for a grade`;
  if (it.missing) return "Marked missing in Canvas";
  return "Not graded yet";
}

// A typed "I expect" percent as a fraction (0 to 1.5), or null when the box is empty or not a number.
export function lockValue(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 150 ? n / 100 : null;
}

// The final grade (percent) if every open item without a typed score gets fraction p, and typed
// items get theirs. null when the class has nothing to count.
export function finalAt(model, p, locks = {}) {
  if (!model || !model.groups.length) return null;
  let sum = 0;
  let base = 0;
  for (const g of model.groups) {
    let e = g.earned;
    for (const it of g.open) {
      const l = lockValue(locks[it.id]);
      e += it.points * (l === null ? p : l);
    }
    if (model.weighted) {
      sum += g.weight * (e / g.possible);
      base += g.weight;
    } else {
      sum += e;
      base += g.possible;
    }
  }
  return base > 0 ? (sum / base) * 100 : null;
}

// What it takes to finish with `target` percent.
// kind: "doable" | "ontrack" | "impossible" | "locked" | "set" (nothing left to plan: every open
//   item has a typed score, or everything is graded) | "unknown" (no data).
// p = the percent (0-100) each untyped open item needs ("doable"/"ontrack"); for "impossible" it's
// the (over 100) percent that would be needed, for the red bar. finish = the final grade for "set".
export function solvePlan(model, target, locks = {}, current = null) {
  const open = model ? model.groups.flatMap((g) => g.open) : [];
  const free = open.filter((it) => lockValue(locks[it.id]) === null).length;
  const typed = open.length - free;
  const a0 = finalAt(model, 0, locks);
  const a1 = finalAt(model, 1, locks);
  const base = { free, typed, open: open.length, a0, a1, p: null, finish: null };
  if (a0 === null || a1 === null || !Number.isFinite(target)) return { ...base, kind: "unknown" };
  if (!free) return { ...base, kind: "set", finish: a0, reached: a0 >= target - EPS };
  if (a0 >= target - EPS) return { ...base, kind: "locked" };
  if (a1 < target - EPS) {
    return { ...base, kind: "impossible", p: a1 > a0 ? ((target - a0) / (a1 - a0)) * 100 : null };
  }
  const p = ((target - a0) / (a1 - a0)) * 100;
  const kind = current !== null && current !== undefined && p <= current + EPS ? "ontrack" : "doable";
  return { ...base, kind, p };
}

// Your guesses (CLASS-16): what the plan says once some open rows have a typed score ("Your
// guess") and the rest show the even percent they'd need ("Suggested").
// kind:
//   "plan"         nothing typed; every open item needs `need`% (doable or on track: `pace`)
//   "withGuesses"  some typed, goal still reachable: the `free` untyped ones need `need`% on average
//   "impossible"   nothing typed and even 100% on everything left ends at a1
//   "outWithGuesses" the guesses make it impossible: even 100% on the `free` left ends at a1
//   "allTyped"     every open item has a guess: they finish at `finish` (`reached`, else `short`)
//   "locked"       the goal is reached even with 0 on every untyped item
//   "graded"       nothing is left to come; `finish` is the final grade
//   "unknown"      not enough data
// projected = the final grade the meter shows: the goal when it's reachable, else the best (a1),
// the guesses' finish, or the lowest possible (a0) when locked in.
export function guessOutcome(model, target, locks = {}, current = null) {
  const plan = solvePlan(model, target, locks, current);
  const { typed, free, open, a0, a1 } = plan;
  const out = { typed, free, open, a0, a1, p: plan.p, need: null, finish: null, reached: false, short: null, projected: null, pace: null };
  let kind = "unknown";
  if (plan.kind === "set") {
    kind = open ? "allTyped" : "graded";
    out.finish = plan.finish;
    out.reached = plan.reached;
    out.short = plan.reached ? 0 : target - plan.finish;
    out.projected = plan.finish;
  } else if (plan.kind === "locked") {
    kind = "locked";
    out.projected = a0;
  } else if (plan.kind === "impossible") {
    kind = typed ? "outWithGuesses" : "impossible";
    out.projected = a1;
  } else if (plan.kind === "doable" || plan.kind === "ontrack") {
    kind = typed ? "withGuesses" : "plan";
    out.need = Math.min(100, Math.ceil(plan.p - EPS));
    out.pace = plan.kind;
    out.projected = target;
  }
  return { ...out, kind };
}

// The one plain sentence for a guessOutcome, from fixed templates (shown above the list and as the
// big answer on the left). `scale` names letters: "On track for 80% (B-) if you also average 88% on
// the 4 you haven't filled in."
export function guessLine(o, target, scale) {
  const words = goalText(target, scale);
  const at = (n) => {
    const l = letterFor(n, scale);
    return `${pct1(n)}${l ? ` (${l})` : ""}`;
  };
  switch (o.kind) {
    case "plan":
      return `Score about ${o.need}% on ${o.free === 1 ? "the one thing" : `each of the ${o.free} things`} still to come.`;
    case "withGuesses":
      return `On track for ${words} if you also average ${o.need}% on ${o.free === 1 ? "the one" : `the ${o.free}`} you haven't filled in.`;
    case "allTyped":
      return o.reached
        ? `Your guesses finish at ${at(o.finish)} — goal reached.`
        : `Your guesses finish at ${at(o.finish)} — ${pct1(o.short)} short of ${words}.`;
    case "outWithGuesses":
      return `Out of reach with these guesses: even 100% on ${o.free === 1 ? "the one" : `the ${o.free}`} left ends at ${pct1(o.a1)}.`;
    case "impossible":
      return `Even 100% on everything left ends at ${pct1(o.a1)}.`;
    case "locked":
      return `You've already locked in ${words}.`;
    case "graded":
      return `Everything is graded. You finished at ${pct1(o.finish)}.`;
    default:
      return "Not enough graded work yet to work this out.";
  }
}

// Rounding for what's shown. Points round UP to the nearest half point and percents UP to one
// decimal, so a target is never shown lower than it really is.
export const halfUp = (n) => Math.ceil(n * 2 - EPS) / 2;
export const up1 = (n) => Math.ceil(n * 10 - EPS) / 10;
export const pct1 = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
export function trim(n) {
  const t = (Math.round(n * 10) / 10).toFixed(1);
  return t.endsWith(".0") ? t.slice(0, -2) : t;
}

// The letters to offer as buttons: A, A-, B+, B, C from the class's own scale (those it has).
// No scale: the fixed presets passed in.
export function letterChoices(scale, fallback) {
  if (!Array.isArray(scale) || !scale.length) return fallback;
  const out = [];
  for (const name of ["A", "A-", "B+", "B", "C"]) {
    const s = scale.find((x) => x.name === name && x.min > 0 && x.min <= 100);
    if (s) out.push({ label: s.name, value: s.min });
  }
  return out.length ? out : fallback;
}

// Where the calculator starts: the saved goal, else the next letter above the current grade
// (the top letter when you're already there), else 90.
export function defaultTarget(goal, current, scale, fallback = []) {
  if (goal !== null && goal !== undefined && Number.isFinite(Number(goal))) return Number(goal);
  const steps = (Array.isArray(scale) && scale.length ? scale : fallback.map((f) => ({ name: f.label, min: f.value })))
    .filter((s) => s.min > 0 && s.min <= 100)
    .sort((x, y) => x.min - y.min);
  if (!steps.length) return 90;
  if (current === null || current === undefined || !Number.isFinite(Number(current))) return steps.find((s) => s.min >= 90)?.min ?? steps[steps.length - 1].min;
  const above = steps.find((s) => s.min > Number(current) + EPS);
  return (above || steps[steps.length - 1]).min;
}

// The best letter you can still reach (highest cutoff at or below `best`), for "Aim for an A- instead".
export function bestReachable(best, scale) {
  if (!Number.isFinite(best)) return null;
  const s = (Array.isArray(scale) ? scale : []).find((x) => x.min > 0 && x.min <= best + EPS);
  if (s) return { label: s.name, value: s.min };
  const floor = Math.floor(best * 10) / 10;
  return floor > 0 ? { label: `${trim(floor)}%`, value: floor } : null;
}

// "an A-", "a B+", "an 85%"
export function withArticle(label) {
  return `${/^[AEF8]|^11|^18/.test(label) ? "an" : "a"} ${label}`;
}

export function goalText(target, scale) {
  const l = letterFor(target, scale);
  return `${trim(target)}%${l ? ` (${l})` : ""}`;
}

// The quiet note under the list: only what isn't listed at all (extra credit categories). Graded
// work and 0% categories are listed now (CLASS-13).
export function leftOutNote(model) {
  if (!model || !model.bonus.length) return "";
  const b = model.bonus;
  return `${list(b)} ${b.length === 1 ? "is" : "are"} extra credit, so ${b.length === 1 ? "it isn't" : "they aren't"} counted.`;
}

function list(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// One goal sentence for the This term row (CLASS-11), from the same plan the calculator shows.
export function goalSentence(breakdown, goal, current = null) {
  const scale = letterScale(breakdown?.scheme);
  const model = calcModel(breakdown);
  if (goal === null || goal === undefined) {
    return { line: "No goal yet. Set one to see what the rest of the class needs.", sub: "The calculator shows what each assignment needs." };
  }
  const words = goalText(goal, scale);
  const r = solvePlan(model, goal, {}, current);
  const things = `${r.free} thing${r.free === 1 ? "" : "s"}`;
  if (r.kind === "doable" || r.kind === "ontrack") {
    return {
      line: `To finish with ${words}, you'd need about ${Math.min(100, Math.ceil(r.p - EPS))}% on the rest.`,
      sub: `That's the same score on ${r.free === 1 ? "the 1 thing" : `all ${things}`} not graded yet, weighted the way Canvas weighs them. The calculator shows each one.`,
    };
  }
  if (r.kind === "locked") return { line: `You've already locked in ${words}.`, sub: `Even a 0 on the ${things} left keeps you at ${pct1(r.a0)} or higher.` };
  if (r.kind === "impossible") return { line: `${words} is out of reach: even 100% on the rest ends at ${pct1(r.a1)}.`, sub: "The calculator can show the best goal you can still reach." };
  if (r.kind === "set") return { line: `Everything is graded. You finished at ${pct1(r.finish)}.`, sub: r.reached ? `That reaches ${words}.` : `That's below ${words}.` };
  return { line: `To finish with ${words}: not enough graded work yet to tell.`, sub: "The calculator shows what each assignment needs." };
}
