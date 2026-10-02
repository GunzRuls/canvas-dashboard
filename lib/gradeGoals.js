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

// The picker's presets on this class's letter scale, so a preset's label always matches the letter
// the goal text shows ("90" is an A- on a scale where A starts at 94). Each fixed preset becomes
// that letter's real cutoff, or the scale's letter with the nearest cutoff when the scale doesn't
// have it. No scale: the fixed presets.
export function goalPresets(scale) {
  if (!Array.isArray(scale) || !scale.length) return GOAL_PRESETS;
  const usable = scale.filter((s) => s.min > 0 && s.min <= 100);
  if (!usable.length) return GOAL_PRESETS;
  const out = [];
  for (const p of GOAL_PRESETS) {
    const exact = usable.find((s) => s.name === p.label);
    const pick =
      exact ||
      usable.reduce((best, s) => {
        const d = Math.abs(s.min - p.value);
        const bd = Math.abs(best.min - p.value);
        return d < bd || (d === bd && s.min > best.min) ? s : best;
      });
    if (!out.some((o) => o.label === pick.name)) out.push({ label: pick.name, value: pick.min });
  }
  return out;
}

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
    scheme: letterScale(breakdown.scheme),
  };
}

// Canvas's letter scale as [{ name, min }] in percent, highest first. Canvas sends it as pairs
// ([["A", 0.94], ["A-", 0.9], ...], from courses/:id?include[]=grading_scheme); { name, value }
// objects work too, and a value above 1 is read as a percent. Anything malformed is skipped.
export function letterScale(scheme) {
  if (!Array.isArray(scheme)) return [];
  return scheme
    .map((s) => {
      const [rawName, rawValue] = Array.isArray(s) ? s : [s?.name, s?.value];
      const v = rawValue === null || rawValue === "" ? NaN : Number(rawValue);
      const name = typeof rawName === "string" ? rawName.trim().slice(0, 8) : "";
      if (!name || !Number.isFinite(v) || v < 0) return null;
      return { name, min: v <= 1 ? Math.round(v * 10000) / 100 : v };
    })
    .filter(Boolean)
    .sort((x, y) => y.min - x.min);
}

// The letter a percent earns on that scale ("" when the class has none).
export function letterFor(percent, scale) {
  if (!Array.isArray(scale) || !scale.length || !Number.isFinite(percent)) return "";
  return scale.find((s) => percent >= s.min - 1e-9)?.name || "";
}

// A goal as the picker and status lines say it: "90%", or "90% (A-)" when the class has a letter scale.
// The goal is always the FINAL grade you want in the class, not a score on the work that's left.
export function goalWords(goal, scale) {
  const letter = letterFor(goal, scale);
  return `${fmt(goal)}%${letter ? ` (${letter})` : ""}`;
}

// The status pill. Rules:
//   nothing left to grade: "Locked in" if the grade is at or above the goal, else "Missed".
//   even 0% on what's left still reaches the goal: "Locked in".
//   even 100% on what's left falls short: "Out of reach".
//   the average needed on what's left is at or below your current grade: "On track"
//     (keep doing what you're doing).
//   otherwise: "Avg X% on rest" (X rounded up, so it's never too low). It's the average over
//     everything still to be graded, not the next assignment, so the words say so.
// tone: "good" | "warn" | "bad" | "plain" (plain = nothing graded yet, so no pace to compare).
// detail is the full sentence for the tooltip and the goal picker; it names the goal (with the
// class's letter when Canvas has a scale), e.g. "80% (B-)".
export function goalStatus(outlook, goal) {
  const target = cleanGoal(goal);
  if (!outlook || target === null) return null;
  const { current, remaining, atZero, atFull } = outlook;
  const goalText = goalWords(target, outlook.scheme);

  if (!remaining) {
    if (current === null) return { kind: "unknown", tone: "plain", label: "No grades yet", detail: `Goal ${goalText}: nothing graded or left to grade yet.` };
    return current >= target
      ? { kind: "locked", tone: "good", label: "Locked in", detail: `Everything is graded and you're at or above ${goalText}.` }
      : { kind: "missed", tone: "bad", label: "Missed", detail: `Everything is graded and you finished below ${goalText}.` };
  }
  if (atZero === null || atFull === null) {
    return { kind: "unknown", tone: "plain", label: "Can't tell yet", detail: `Goal ${goalText}: this class doesn't have enough grade data yet.` };
  }
  if (atZero >= target) {
    return { kind: "locked", tone: "good", label: "Locked in", detail: `You finish at ${goalText} or higher even with a 0 on everything left.` };
  }
  if (atFull < target) {
    return {
      kind: "impossible",
      tone: "bad",
      label: "Out of reach",
      detail: `Even 100% on everything left ends at ${fmt(atFull)}%, below your ${goalText} goal.`,
    };
  }
  const needed = ((target - atZero) / (atFull - atZero)) * 100;
  const shown = Math.min(100, Math.ceil(needed - 1e-9));
  if (current !== null && needed <= current) {
    return {
      kind: "ontrack",
      tone: "good",
      label: "On track",
      needed,
      detail: `To finish with ${goalText}, you'd need about ${shown}% on the rest, and you're already averaging that.`,
    };
  }
  return {
    kind: "needed",
    tone: current === null ? "plain" : "warn",
    label: `Avg ${shown}% on rest`,
    needed,
    detail: `To finish with ${goalText}, you'd need about ${shown}% on the rest. That's the average on everything not graded yet (assignments, quizzes and exams), weighted the way Canvas weighs it.`,
  };
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
