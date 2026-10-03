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

// The class as the calculator sees it: counted categories with their open (not graded) items,
// plus what is left out and why (for the quiet note under the list).
export function calcModel(breakdown) {
  if (!breakdown) return null;
  const weighted = Boolean(breakdown.weighted);
  const groups = [];
  const zeroWeight = []; // names of open items in 0% categories
  const bonus = []; // names of extra credit categories
  for (const g of breakdown.groups || []) {
    const live = (g.assignments || []).filter((a) => !a.excused);
    if (BONUS.test(g.name || "")) {
      if (live.length || (weighted && g.weight > 0)) bonus.push(g.name);
      continue;
    }
    if (weighted && !(g.weight > 0)) {
      for (const a of live) if (!a.graded && a.points > 0) zeroWeight.push(a.name);
      continue;
    }
    const graded = live.filter((a) => a.graded);
    const open = live
      .filter((a) => !a.graded && a.points > 0)
      .map((a) => ({ id: String(a.id), name: a.name, points: a.points, dueAt: a.dueAt || null, placeholder: false }));
    const earned = graded.reduce((s, a) => s + (Number(a.score) || 0), 0);
    let possible = graded.reduce((s, a) => s + (a.points || 0), 0) + open.reduce((s, a) => s + a.points, 0);
    if (weighted && possible <= 0) {
      // Nothing posted yet: one placeholder worth the whole category.
      open.push({ id: `unposted-${g.id}`, name: g.name, points: 100, dueAt: null, placeholder: true });
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
  return { weighted, groups, weightSum, pointsSum, zeroWeight, bonus };
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

// The quiet note under the list: what isn't listed and why.
export function leftOutNote(model) {
  if (!model) return "";
  const parts = [];
  const done = model.groups.filter((g) => !g.open.length && g.gradedCount > 0);
  if (done.length) {
    const names = done.map((g) => `${g.name}${g.gradedPossible > 0 ? ` (${trim((g.earned / g.gradedPossible) * 100)}%)` : ""}`);
    parts.push(`${list(names)} ${done.length === 1 ? "is" : "are"} already graded.`);
  } else if (model.groups.some((g) => g.gradedCount > 0)) {
    parts.push("Work that's already graded isn't listed.");
  }
  if (model.zeroWeight.length) {
    const z = model.zeroWeight;
    parts.push(
      z.length <= 2
        ? `${list(z)} ${z.length === 1 ? "is" : "are"} in a part of the class that counts for 0%, so ${z.length === 1 ? "it doesn't" : "they don't"} change your grade.`
        : `${z.length} things are in parts of the class that count for 0%, so they don't change your grade.`
    );
  }
  if (model.bonus.length) parts.push(`${list(model.bonus)} ${model.bonus.length === 1 ? "is" : "are"} extra credit, so ${model.bonus.length === 1 ? "it isn't" : "they aren't"} counted.`);
  return parts.join(" ");
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
