// Grade goals (CLASS-6): pure helpers, no imports from the server, so tests and the browser can
// use them. The server sends a small "outlook" per class; the row turns it into a status for
// whatever goal you pick, without asking the server again.
import { computeGrade, remainingAssignments } from "./gradeMath.js";

// Letter presets shown in the goal picker.
export const GOAL_PRESETS = [
  { label: "A", value: 90 },
  { label: "B+", value: 87 },
  { label: "B", value: 80 },
  { label: "C", value: 70 },
];

// A goal is a percent from 1 to 100 (decimals allowed, e.g. 89.5). Returns null when it isn't one.
export function cleanGoal(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

// Everything the status needs, from the assignment groups (the same data What-if uses):
// the current grade, and the final grade if everything left scored 0% or 100%. The final grade
// moves in a straight line between those two, so any goal can be solved from them.
// In weighted classes, a category that counts but has nothing posted yet (often the final exam)
// still belongs to the final grade, so it's counted as one placeholder assignment left.
// Categories worth 0% are ignored.
export function goalOutlook(breakdown) {
  if (!breakdown) return null;
  const current = computeGrade(breakdown);
  const unposted = [];
  const full = {
    ...breakdown,
    groups: breakdown.groups.map((g) => {
      if (!breakdown.weighted || !(g.weight > 0) || g.assignments.some((a) => a.points > 0)) return g;
      if (/bonus|extra credit/i.test(g.name || "")) return g; // optional, not owed

      unposted.push(g.name);
      const placeholder = { id: `unposted-${g.id}`, points: 100, score: null, graded: false, excused: false };
      return { ...g, assignments: [...g.assignments, placeholder] };
    }),
  };
  const counts = (a) =>
    !breakdown.weighted || full.groups.some((g) => g.weight > 0 && g.assignments.includes(a));
  const left = remainingAssignments(full).filter(counts);
  const fill = (fraction) => Object.fromEntries(left.map((a) => [a.id, a.points * fraction]));
  const remaining = left.length;
  const atZero = remaining ? computeGrade(full, fill(0)) : current;
  const atFull = remaining ? computeGrade(full, fill(1)) : current;
  return {
    current,
    remaining,
    atZero,
    atFull,
    unposted,
    hasDropRules: breakdown.groups.some((g) => g.hasDropRules),
  };
}

// The status pill. Rules:
//   nothing left to grade: "Locked in" if the grade is at or above the goal, else "Missed".
//   even 0% on what's left still reaches the goal: "Locked in".
//   even 100% on what's left falls short: "Out of reach".
//   the average needed on what's left is at or below your current grade: "On track"
//     (keep doing what you're doing).
//   otherwise: "Need X%" (X rounded up, so it's never too low).
// tone: "good" | "warn" | "bad" | "plain" (plain = nothing graded yet, so no pace to compare).
export function goalStatus(outlook, goal) {
  const target = cleanGoal(goal);
  if (!outlook || target === null) return null;
  const { current, remaining, atZero, atFull } = outlook;

  if (!remaining) {
    if (current === null) return { kind: "unknown", tone: "plain", label: "No grades yet", detail: "Nothing graded or left to grade yet." };
    return current >= target
      ? { kind: "locked", tone: "good", label: "Locked in", detail: `Everything is graded and you're at or above ${fmt(target)}%.` }
      : { kind: "missed", tone: "bad", label: "Missed", detail: `Everything is graded and you finished below ${fmt(target)}%.` };
  }
  if (atZero === null || atFull === null) return { kind: "unknown", tone: "plain", label: "Can't tell yet", detail: "This class doesn't have enough grade data." };
  if (atZero >= target) {
    return { kind: "locked", tone: "good", label: "Locked in", detail: `You reach ${fmt(target)}% even with a 0 on everything left.` };
  }
  if (atFull < target) {
    return {
      kind: "impossible",
      tone: "bad",
      label: "Out of reach",
      detail: `Even 100% on everything left ends at ${fmt(atFull)}%.`,
    };
  }
  const needed = ((target - atZero) / (atFull - atZero)) * 100;
  const shown = Math.min(100, Math.ceil(needed - 1e-9));
  if (current !== null && needed <= current) {
    return { kind: "ontrack", tone: "good", label: "On track", needed, detail: `Keep averaging ${shown}% on everything left.` };
  }
  return {
    kind: "needed",
    tone: current === null ? "plain" : "warn",
    label: `Need ${shown}%`,
    needed,
    detail: `You need about ${shown}% on average on everything left.`,
  };
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
