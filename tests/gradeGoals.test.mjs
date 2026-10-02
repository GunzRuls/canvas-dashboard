// Tests for lib/gradeGoals.js (CLASS-6). Every expected number was worked out by hand from the
// made-up grades below. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { GOAL_PRESETS, cleanGoal, goalOutlook, goalPresets, goalStatus, letterScale, letterFor } from "../lib/gradeGoals.js";

const graded = (id, score, points) => ({ id, score, points, graded: true, excused: false });
const ungraded = (id, points) => ({ id, score: null, points, graded: false, excused: false });
const excused = (id, points) => ({ id, score: null, points, graded: false, excused: true });

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: expected ${expected}, got ${actual}`);

// Points class: 85/100 graded, 100 points left (an excused one doesn't count).
const pointsClass = {
  weighted: false,
  groups: [
    { id: "hw", weight: 0, assignments: [graded("a1", 40, 50), graded("a2", 45, 50), ungraded("a3", 50), excused("a4", 50)] },
    { id: "exam", weight: 0, assignments: [ungraded("b1", 50)] },
  ],
};

test("outlook: current grade and the 0% / 100% ends", () => {
  const o = goalOutlook(pointsClass);
  close(o.current, 85, "current"); // 85 / 100
  close(o.atZero, 42.5, "atZero"); // 85 / 200
  close(o.atFull, 92.5, "atFull"); // 185 / 200
  assert.equal(o.remaining, 2);
  assert.equal(o.hasDropRules, false);
});

test("need more than your current grade: amber 'Avg X% on rest'", () => {
  // (90 - 42.5) / (92.5 - 42.5) = 95%, above the current 85%
  const s = goalStatus(goalOutlook(pointsClass), 90);
  assert.equal(s.kind, "needed");
  assert.equal(s.tone, "warn");
  assert.equal(s.label, "Avg 95% on rest");
  close(s.needed, 95, "needed");
  assert.match(s.detail, /^To finish with 90%, you'd need about 95% on the rest\. That's the average on everything not graded yet/);
});

test("the shown percent rounds up, never down", () => {
  // (86.3 - 42.5) / 50 = 87.6% -> "Avg 88% on rest"
  assert.equal(goalStatus(goalOutlook(pointsClass), 86.3).label, "Avg 88% on rest");
});

test("on track when the needed average is at or below your current grade", () => {
  // (80 - 42.5) / 50 = 75% <= 85%
  const s = goalStatus(goalOutlook(pointsClass), 80);
  assert.equal(s.kind, "ontrack");
  assert.equal(s.tone, "good");
  close(s.needed, 75, "needed");
  // exactly equal: (85 - 42.5) / 50 = 85% <= 85%
  assert.equal(goalStatus(goalOutlook(pointsClass), 85).kind, "ontrack");
});

test("out of reach when even 100% on the rest falls short", () => {
  const s = goalStatus(goalOutlook(pointsClass), 95); // best case 92.5%
  assert.equal(s.kind, "impossible");
  assert.equal(s.tone, "bad");
  assert.equal(s.label, "Out of reach");
});

test("locked in when even 0% on the rest keeps the goal", () => {
  assert.equal(goalStatus(goalOutlook(pointsClass), 40).kind, "locked"); // worst case 42.5%
});

// Weighted: homework 40% (18/20 = 90%), exam 60% (nothing graded, 100 points left).
const weightedClass = {
  weighted: true,
  groups: [
    { id: "hw", weight: 40, assignments: [graded("h1", 18, 20)] },
    { id: "exam", weight: 60, assignments: [ungraded("e1", 100)] },
  ],
};

test("weighted class: the empty exam group joins once it's filled in", () => {
  const o = goalOutlook(weightedClass);
  close(o.current, 90, "current"); // only homework counts so far
  close(o.atZero, 36, "atZero"); // 0.9 * 40
  close(o.atFull, 96, "atFull"); // 36 + 60
  // (90 - 36) / 60 = 90% <= 90%: on track
  assert.equal(goalStatus(o, 90).kind, "ontrack");
  // (93 - 36) / 60 = 95%
  assert.equal(goalStatus(o, 93).label, "Avg 95% on rest");
});

test("nothing left to grade: locked in or missed", () => {
  const done = { weighted: false, groups: [{ id: "g", weight: 0, assignments: [graded("x", 45, 50)] }] };
  const o = goalOutlook(done);
  assert.equal(o.remaining, 0);
  assert.equal(goalStatus(o, 90).kind, "locked"); // 90% >= 90
  assert.equal(goalStatus(o, 91).kind, "missed");
  assert.equal(goalStatus(o, 91).tone, "bad");
});

test("nothing graded yet: shows what's needed without a pace to compare", () => {
  const fresh = { weighted: false, groups: [{ id: "g", weight: 0, assignments: [ungraded("x", 100)] }] };
  const s = goalStatus(goalOutlook(fresh), 80);
  assert.equal(s.kind, "needed");
  assert.equal(s.tone, "plain");
  assert.equal(s.label, "Avg 80% on rest");
});

test("no goal or no data means no status", () => {
  assert.equal(goalStatus(goalOutlook(pointsClass), null), null);
  assert.equal(goalStatus(null, 90), null);
});

test("goals must be a percent above 0 and up to 100", () => {
  assert.equal(cleanGoal(90), 90);
  assert.equal(cleanGoal("87"), 87);
  assert.equal(cleanGoal(89.456), 89.46);
  assert.equal(cleanGoal(100), 100);
  assert.equal(cleanGoal(0), null);
  assert.equal(cleanGoal(101), null);
  assert.equal(cleanGoal(""), null);
  assert.equal(cleanGoal(null), null);
  assert.equal(cleanGoal("abc"), null);
});

test("weighted class: a category with nothing posted yet still counts; 0% categories don't", () => {
  const early = {
    weighted: true,
    groups: [
      { id: "hw", name: "Homework", weight: 40, assignments: [graded("h1", 18, 20)] },
      { id: "final", name: "Final Exam", weight: 60, assignments: [] },
      { id: "extra", name: "Imported", weight: 0, assignments: [ungraded("x1", 50)] },
      { id: "bonus", name: "Course Evaluation - Bonus", weight: 2, assignments: [] },
    ],
  };
  const o = goalOutlook(early);
  close(o.current, 90, "current"); // only homework is graded
  assert.equal(o.remaining, 1); // the final, not the 0% category
  assert.deepEqual(o.unposted, ["Final Exam"]);
  close(o.atZero, 36, "atZero"); // 0.9 * 40 + 0 * 60
  close(o.atFull, 96, "atFull"); // 36 + 60
  // (90 - 36) / 60 = 90%
  assert.equal(goalStatus(o, 90).kind, "ontrack");
});

test("the wording names the goal and its letter from the class's scale", () => {
  // The shape Canvas sends (courses/:id?include[]=grading_scheme).
  const scheme = [["A", 0.93], ["A-", 0.9], ["B+", 0.87], ["B", 0.83], ["B-", 0.8], ["F", 0]];
  const o = goalOutlook({ ...pointsClass, scheme });
  // (85 - 42.5) / 50 = 85% <= 85%: on track
  assert.equal(
    goalStatus(o, 85).detail,
    "To finish with 85% (B), you'd need about 85% on the rest, and you're already averaging that."
  );
  // (86.3 - 42.5) / 50 = 87.6% -> 88%; 86.3 is a B on this scale
  assert.equal(
    goalStatus(o, 86.3).detail,
    "To finish with 86.3% (B), you'd need about 88% on the rest. That's the average on everything not graded yet (assignments, quizzes and exams), weighted the way Canvas weighs it."
  );
  // best case 92.5%
  assert.equal(goalStatus(o, 95).detail, "Even 100% on everything left ends at 92.5%, below your 95% (A) goal.");
  // no scale: no letter
  assert.equal(goalStatus(goalOutlook(pointsClass), 95).detail, "Even 100% on everything left ends at 92.5%, below your 95% goal.");
});

test("letter scale: fractions or percents, highest first, junk skipped", () => {
  const scale = letterScale([{ name: "B", value: 80 }, { name: "A", value: 0.9 }, { name: "", value: 0.5 }, { name: "X", value: "abc" }, { name: "F", value: 0 }]);
  assert.deepEqual(scale, [{ name: "A", min: 90 }, { name: "B", min: 80 }, { name: "F", min: 0 }]);
  assert.equal(letterFor(90, scale), "A");
  assert.equal(letterFor(89.99, scale), "B");
  assert.equal(letterFor(10, scale), "F");
  assert.equal(letterFor(90, []), "");
  assert.deepEqual(letterScale(null), []);
  assert.deepEqual(letterScale([["A", 0.94], ["B-", 0.8], [null, 0.5], ["X"]]), [{ name: "A", min: 94 }, { name: "B-", min: 80 }]);
  // The owner's example: 80% is a B- on Florida Poly's usual scale.
  assert.equal(letterFor(80, letterScale([["B", 0.84], ["B-", 0.8], ["C+", 0.77]])), "B-");
});

test("goal presets follow the class's letter scale", () => {
  // Florida Poly's usual scale: 90 is an A-, so the A preset is 94.
  const fpu = letterScale([["A", 0.94], ["A-", 0.9], ["B+", 0.87], ["B", 0.84], ["B-", 0.8], ["C+", 0.77], ["C", 0.74], ["C-", 0.7], ["D", 0.6], ["F", 0]]);
  assert.deepEqual(goalPresets(fpu), [
    { label: "A", value: 94 },
    { label: "B+", value: 87 },
    { label: "B", value: 84 },
    { label: "C", value: 74 },
  ]);
  // Every preset's label is the letter its own value earns, so the pill text can't disagree.
  for (const p of goalPresets(fpu)) assert.equal(letterFor(p.value, fpu), p.label);
  // A plain A/B/C/D/F scale has no B+: the nearest cutoff to 87 is A (90), already used, so it's skipped.
  const plain = letterScale([["A", 0.9], ["B", 0.8], ["C", 0.7], ["D", 0.6], ["F", 0]]);
  assert.deepEqual(goalPresets(plain), [
    { label: "A", value: 90 },
    { label: "B", value: 80 },
    { label: "C", value: 70 },
  ]);
  // No scale: the fixed presets.
  assert.deepEqual(goalPresets([]), GOAL_PRESETS);
  assert.deepEqual(goalPresets(undefined), GOAL_PRESETS);
});
