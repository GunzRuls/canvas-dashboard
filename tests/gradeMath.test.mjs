// Tests for lib/gradeMath.js. Every expected number was worked out by hand from the made-up
// grades below, so a failure means the math changed, not just the code.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { computeGrade, groupTotals, scoreNeeded, averageNeeded, remainingAssignments } from "../lib/gradeMath.js";

const graded = (id, score, points) => ({ id, score, points, graded: true, excused: false });
const ungraded = (id, points) => ({ id, score: null, points, graded: false, excused: false });
const excused = (id, points) => ({ id, score: null, points, graded: false, excused: true });

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: expected ${expected}, got ${actual}`);

// ---------- current grade, points-based class ----------

const pointsClass = {
  weighted: false,
  groups: [
    { id: "hw", weight: 0, assignments: [graded("a1", 80, 100), ungraded("a2", 100), excused("a3", 100)] },
    { id: "quiz", weight: 0, assignments: [graded("b1", 45, 50)] },
  ],
};

test("points class: only graded work counts", () => {
  // (80 + 45) / (100 + 50)
  close(computeGrade(pointsClass), 83.333, "grade");
});

test("points class: a what-if score is included", () => {
  // (80 + 100 + 45) / (100 + 100 + 50)
  close(computeGrade(pointsClass, { a2: 100 }), 90, "grade");
});

test("points class: an empty what-if box is ignored", () => {
  close(computeGrade(pointsClass, { a2: "" }), 83.333, "grade");
});

test("excused work never counts, even with a what-if typed in", () => {
  close(computeGrade(pointsClass, { a3: 0 }), 83.333, "grade");
});

test("group totals add up earned and possible points", () => {
  const t = groupTotals(pointsClass.groups[0]);
  assert.equal(t.earned, 80);
  assert.equal(t.possible, 100);
  close(t.percent, 80, "percent");
});

test("nothing graded yet means no grade", () => {
  assert.equal(computeGrade({ weighted: false, groups: [{ weight: 0, assignments: [ungraded("x", 10)] }] }), null);
});

// ---------- current grade, weighted class ----------

const weightedClass = {
  weighted: true,
  groups: [
    { id: "hw", weight: 40, assignments: [graded("h1", 90, 100)] },
    { id: "exams", weight: 60, assignments: [ungraded("e1", 100)] },
  ],
};

test("weighted class: categories with nothing graded are left out, like Canvas", () => {
  // Only Homework has grades, so it counts as 100% of the grade for now.
  close(computeGrade(weightedClass), 90, "grade");
});

test("weighted class: each category counts by its weight", () => {
  // 40% x 90% + 60% x 70%
  close(computeGrade(weightedClass, { e1: 70 }), 78, "grade");
});

test("weighted class: a 0% category doesn't affect the grade", () => {
  const withExtra = {
    ...weightedClass,
    groups: [...weightedClass.groups, { id: "practice", weight: 0, assignments: [graded("p1", 0, 100)] }],
  };
  close(computeGrade(withExtra), 90, "grade");
});

// ---------- "What do I need on this one assignment?" ----------

test("score needed on one assignment", () => {
  // At 0 on the exam: 40 x 0.9 = 36%. At 100: 36 + 60 = 96%. For 80%: 44/60 of the exam.
  const r = scoreNeeded(weightedClass, {}, weightedClass.groups[1].assignments[0], 80);
  assert.equal(r.kind, "needed");
  close(r.score, 73.333, "points needed");
  close(r.percent, 73.333, "percent needed");
  close(computeGrade(weightedClass, { e1: r.score }), 80, "grade after scoring that");
});

test("already safe: even a zero keeps you above the target", () => {
  const cls = { weighted: false, groups: [{ weight: 0, assignments: [graded("a", 90, 100), ungraded("b", 1)] }] };
  const r = scoreNeeded(cls, {}, cls.groups[0].assignments[1], 80);
  assert.equal(r.kind, "locked");
  close(r.atZero, 89.109, "grade with a zero"); // 90 / 101
});

test("out of reach: even full points falls short", () => {
  const cls = { weighted: false, groups: [{ weight: 0, assignments: [graded("a", 10, 100), ungraded("b", 10)] }] };
  const r = scoreNeeded(cls, {}, cls.groups[0].assignments[1], 90);
  assert.equal(r.kind, "impossible");
  close(r.atFull, 18.182, "best possible"); // 20 / 110
});

// ---------- "What average do I need on everything left?" ----------

const twoLeft = {
  weighted: false,
  groups: [{ weight: 0, assignments: [graded("a1", 80, 100), ungraded("a2", 100), ungraded("a3", 100)] }],
};

test("average needed on everything left", () => {
  // At 0%: 80/300 = 26.67%. At 100%: 280/300 = 93.33%. For 90%: 95% on each.
  const r = averageNeeded(twoLeft, {}, 90);
  assert.equal(r.kind, "needed");
  assert.equal(r.count, 2);
  close(r.percent, 95, "average needed");
  assert.deepEqual(r.fill, { a2: 95, a3: 95 });
  close(computeGrade(twoLeft, r.fill), 90, "grade after filling in");
});

test("scores you typed yourself stay as typed", () => {
  const r = averageNeeded(twoLeft, { a2: 50 }, 90);
  assert.deepEqual(
    remainingAssignments(twoLeft, { a2: 50 }).map((a) => a.id),
    ["a3"]
  );
  assert.equal(r.kind, "impossible"); // (80 + 50 + 100) / 300 = 76.7% at best
  assert.equal(r.fill, undefined);
});

test("nothing left to grade", () => {
  const done = { weighted: false, groups: [{ weight: 0, assignments: [graded("a", 90, 100)] }] };
  assert.equal(averageNeeded(done, {}, 90).kind, "none");
});

test("a weighted class reaches the target after filling in", () => {
  const cls = {
    weighted: true,
    groups: [
      { id: "hw", weight: 30, assignments: [graded("h1", 18, 20), ungraded("h2", 20)] },
      { id: "exams", weight: 70, assignments: [graded("e1", 65, 100), ungraded("e2", 100)] },
    ],
  };
  const r = averageNeeded(cls, {}, 85);
  assert.equal(r.kind, "needed");
  close(computeGrade(cls, r.fill), 85, "grade after filling in");
});
