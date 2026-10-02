// Tests for lib/gradeGoals.js (CLASS-6). Every expected number was worked out by hand from the
// made-up grades below. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cleanGoal, goalOutlook, goalStatus } from "../lib/gradeGoals.js";

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

test("need more than your current grade: amber 'Need X%'", () => {
  // (90 - 42.5) / (92.5 - 42.5) = 95%, above the current 85%
  const s = goalStatus(goalOutlook(pointsClass), 90);
  assert.equal(s.kind, "needed");
  assert.equal(s.tone, "warn");
  assert.equal(s.label, "Need 95%");
  close(s.needed, 95, "needed");
});

test("the shown percent rounds up, never down", () => {
  // (86.3 - 42.5) / 50 = 87.6% -> "Need 88%"
  assert.equal(goalStatus(goalOutlook(pointsClass), 86.3).label, "Need 88%");
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
  assert.equal(goalStatus(o, 93).label, "Need 95%");
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
  assert.equal(s.label, "Need 80%");
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
