// Tests for lib/gradeCalc.js (CLASS-10 grade calculator). Every expected number was worked out by
// hand from the made-up classes below. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  bestReachable,
  calcModel,
  countsLine,
  defaultTarget,
  finalAt,
  goalSentence,
  goalText,
  gradedRows,
  groupSummary,
  halfUp,
  leftOutNote,
  letterChoices,
  lockValue,
  scoreText,
  solvePlan,
  up1,
  withArticle,
} from "../lib/gradeCalc.js";

const graded = (id, score, points, name = id) => ({ id, name, score, points, graded: true, excused: false });
const open = (id, points, name = id, dueAt = null) => ({ id, name, score: null, points, graded: false, excused: false, dueAt });
const excused = (id, points) => ({ id, name: id, score: null, points, graded: false, excused: true });

const close = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: expected ${expected}, got ${actual}`);

// Weighted class:
//   Homework 50%: 80/100 graded, "Essay" (100 pts) open, one excused (ignored). Possible = 200.
//   Exam 50%: nothing posted -> one 100-point placeholder.
//   Survey 0%: doesn't count. Extra Credit 5%: bonus, left out.
const weighted = {
  weighted: true,
  groups: [
    { id: "hw", name: "Homework", weight: 50, assignments: [graded("h1", 80, 100), open("essay", 100, "Essay", "2026-10-07T03:59:00Z"), excused("h3", 50)] },
    { id: "ex", name: "Exam", weight: 50, assignments: [] },
    { id: "sv", name: "Survey", weight: 0, assignments: [open("survey", 10, "Survey")] },
    { id: "bo", name: "Extra Credit", weight: 5, assignments: [graded("b1", 5, 5)] },
  ],
};

// Points class: 85/100 graded, 100 points left; an empty category is skipped (no placeholder).
const points = {
  weighted: false,
  groups: [
    { id: "a", name: "Assignments", weight: 0, assignments: [graded("a1", 40, 50), graded("a2", 45, 50), open("a3", 50)] },
    { id: "b", name: "Exams", weight: 0, assignments: [open("b1", 50)] },
    { id: "c", name: "Labs", weight: 0, assignments: [] },
  ],
};

const SCALE = [
  { name: "A", min: 94 },
  { name: "A-", min: 90 },
  { name: "B+", min: 87 },
  { name: "B", min: 84 },
  { name: "B-", min: 80 },
  { name: "C", min: 74 },
  { name: "F", min: 0 },
];

test("model: counted categories, placeholder, 0% and bonus left out", () => {
  const m = calcModel(weighted);
  assert.deepEqual(m.groups.map((g) => g.name), ["Homework", "Exam"]);
  assert.equal(m.weightSum, 100);
  const hw = m.groups[0];
  assert.equal(hw.possible, 200); // the excused 50 doesn't count
  assert.equal(hw.earned, 80);
  assert.deepEqual(hw.open.map((i) => i.id), ["essay"]);
  const exam = m.groups[1];
  assert.equal(exam.open.length, 1);
  assert.equal(exam.open[0].placeholder, true);
  assert.equal(exam.open[0].points, 100);
  // share of final: Essay = 50 x 100/200 / 100 = 25%; the exam placeholder = 50%
  close(hw.open[0].share, 25, "essay share");
  close(exam.open[0].share, 50, "exam share");
  assert.deepEqual(m.zeroWeight, ["Survey"]);
  assert.deepEqual(m.bonus, ["Extra Credit"]);
});

test("weighted: 0% and 100% ends", () => {
  const m = calcModel(weighted);
  close(finalAt(m, 0), 20, "a0"); // 50 x 80/200 = 20, exam 0
  close(finalAt(m, 1), 95, "a1"); // 50 x 180/200 = 45, + 50
});

test("weighted: doable, same percent on every open item", () => {
  const r = solvePlan(calcModel(weighted), 90, {}, 80);
  assert.equal(r.kind, "doable");
  close(r.p, 93.333, "p"); // (90 - 20) / (95 - 20) = 70/75
  assert.equal(r.free, 2);
  // shown: Essay needs 93.333 of 100 -> 93.5 (half points up), 93.4% (one decimal up)
  assert.equal(halfUp((r.p / 100) * 100), 93.5);
  assert.equal(up1(r.p), 93.4);
});

test("weighted: on track when the needed percent is at or below the current grade", () => {
  const r = solvePlan(calcModel(weighted), 60, {}, 80);
  assert.equal(r.kind, "ontrack");
  close(r.p, 53.333, "p"); // 40 / 75
});

test("weighted: out of reach and already locked in", () => {
  const out = solvePlan(calcModel(weighted), 96, {}, 80);
  assert.equal(out.kind, "impossible");
  close(out.a1, 95, "best");
  close(out.p, 101.333, "p over 100"); // 76 / 75
  const locked = solvePlan(calcModel(weighted), 20, {}, 80);
  assert.equal(locked.kind, "locked");
});

test("weighted: a typed score keeps its value and the rest re-solve", () => {
  const m = calcModel(weighted);
  const locks = { essay: "100" };
  close(finalAt(m, 0, locks), 45, "a0 with essay at 100%");
  const r = solvePlan(m, 90, locks, 80);
  assert.equal(r.kind, "doable");
  assert.equal(r.free, 1);
  assert.equal(r.typed, 1);
  close(r.p, 90, "exam needs"); // (90 - 45) / (95 - 45)
});

test("every open item typed: the scores finish at a fixed grade", () => {
  const m = calcModel(weighted);
  const r = solvePlan(m, 90, { essay: "100", "unposted-ex": "80" }, 80);
  assert.equal(r.kind, "set");
  close(r.finish, 85, "finish"); // 45 + 50 x 0.8
  assert.equal(r.reached, false);
  assert.equal(solvePlan(m, 85, { essay: "100", "unposted-ex": "80" }).reached, true);
});

test("typed boxes: blanks and nonsense don't count as a score", () => {
  assert.equal(lockValue(""), null);
  assert.equal(lockValue("abc"), null);
  assert.equal(lockValue("200"), null);
  assert.equal(lockValue("85"), 0.85);
  assert.equal(lockValue("0"), 0);
});

test("points class: plain points, no placeholder for an empty category", () => {
  const m = calcModel(points);
  assert.deepEqual(m.groups.map((g) => g.name), ["Assignments", "Exams"]);
  close(finalAt(m, 0), 42.5, "a0"); // 85 / 200
  close(finalAt(m, 1), 92.5, "a1"); // 185 / 200
  const r = solvePlan(m, 90, {}, 85);
  assert.equal(r.kind, "doable");
  close(r.p, 95, "p"); // 47.5 / 50
  close(m.groups[0].open[0].share, 25, "a3 share"); // 50 / 200
  const typed = solvePlan(m, 90, { b1: "100" }, 85);
  close(typed.p, 90, "a3 after typing 100 on b1"); // (90 - 67.5) / 25
});

test("no data: unknown", () => {
  assert.equal(solvePlan(calcModel({ weighted: true, groups: [] }), 90).kind, "unknown");
  assert.equal(solvePlan(null, 90).kind, "unknown");
});

test("letters, default goal and best reachable letter", () => {
  assert.deepEqual(letterChoices(SCALE, []).map((l) => l.label), ["A", "A-", "B+", "B", "C"]);
  const fallback = [{ label: "A", value: 90 }];
  assert.deepEqual(letterChoices([], fallback), fallback);
  assert.equal(defaultTarget(85, 88.3, SCALE), 85); // a saved goal wins
  assert.equal(defaultTarget(null, 88.3, SCALE), 90); // next letter above B+
  assert.equal(defaultTarget(null, 95, SCALE), 94); // already at the top letter
  assert.equal(defaultTarget(null, null, SCALE), 90);
  assert.equal(defaultTarget(null, 88, [], fallback), 90);
  assert.deepEqual(bestReachable(93.9, SCALE), { label: "A-", value: 90 });
  assert.deepEqual(bestReachable(93.94, []), { label: "93.9%", value: 93.9 });
  assert.equal(withArticle("A-"), "an A-");
  assert.equal(withArticle("B+"), "a B+");
  assert.equal(goalText(90, SCALE), "90% (A-)");
  assert.equal(goalText(89.5, []), "89.5%");
});

test("note under the list: only extra credit is left out now", () => {
  assert.equal(leftOutNote(calcModel(weighted)), "Extra Credit is extra credit, so it isn't counted.");
  assert.equal(leftOutNote(calcModel(points)), "");
});

// CLASS-13: graded work is listed too, with its score, and turned-in work says it's waiting.
test("graded rows: score, percent, excused, 0-point work", () => {
  const rows = gradedRows([graded("q2", 76.67, 100, "Quiz 2"), open("q4", 100), excused("q3", 50), graded("att", 3, 0, "Attendance")]);
  assert.deepEqual(rows.map((r) => r.id), ["q2", "q3", "att"]); // open work isn't a graded row
  close(rows[0].pct, 76.67, "quiz 2 percent");
  assert.equal(scoreText(rows[0]), "76.67 / 100 · 76.7%");
  assert.equal(rows[1].excused, true);
  assert.equal(scoreText(rows[1]), "Excused, doesn't count");
  assert.equal(rows[2].pct, null);
  assert.equal(scoreText(rows[2]), "3 pts");
  assert.equal(scoreText(gradedRows([graded("a1", 100, 100)])[0]), "100 / 100 · 100.0%");
});

test("model keeps graded rows per category and 0% categories for the bottom", () => {
  const m = calcModel(weighted);
  assert.deepEqual(m.groups[0].graded.map((r) => r.id), ["h1", "h3"]); // graded + excused, Canvas order
  assert.deepEqual(m.groups[1].graded, []);
  assert.deepEqual(m.zeroGroups.map((g) => g.name), ["Survey"]);
  assert.equal(m.zeroGroups[0].zero, true);
  // The math is unchanged: 0% categories still don't count.
  close(finalAt(m, 0), 20, "a0");
});

test("category summary: weight, graded average, what's left", () => {
  // Algorithms-style quizzes: 70 + 76.67 + 77 of 300 = 74.56% -> "74.6%"
  const quizzes = {
    weighted: true,
    groups: [{ id: "q", name: "Quizzes", weight: 15, assignments: [graded("q1", 70, 100), graded("q2", 76.67, 100), graded("q3", 77, 100), open("q4", 100)] }],
  };
  const g = calcModel(quizzes).groups[0];
  assert.deepEqual(groupSummary(g, true), { weight: "counts for 15%", graded: "3 graded (74.6%)", left: "1 left" });
  const m = calcModel(weighted);
  assert.deepEqual(groupSummary(m.groups[0], true), { weight: "counts for 50%", graded: "1 graded (80%)", left: "1 left" }); // excused not counted
  assert.deepEqual(groupSummary(m.groups[1], true), { weight: "counts for 50%", graded: "", left: "Not posted yet" });
  assert.deepEqual(groupSummary(m.zeroGroups[0], true), { weight: "doesn't count toward your grade", graded: "", left: "1 left" });
  const allDone = calcModel({ weighted: true, groups: [{ id: "m", name: "Midterm", weight: 25, assignments: [graded("m1", 63, 90)] }] });
  assert.deepEqual(groupSummary(allDone.groups[0], true), { weight: "counts for 25%", graded: "1 graded (70%)", left: "All graded" });
  assert.equal(groupSummary(calcModel(points).groups[0], false).weight, "150 points in all");
});

test("submitted but not graded: still open in the plan, flagged as waiting", () => {
  const sub = (id, points) => ({ ...open(id, points), submitted: true });
  const algo = {
    weighted: true,
    groups: [
      { id: "a", name: "Assignments", weight: 50, assignments: [graded("a1", 100, 100), sub("a2", 100), sub("a3", 100), open("a4", 100)] },
      { id: "q", name: "Quizzes", weight: 50, assignments: [graded("q1", 70, 100)] },
    ],
  };
  const m = calcModel(algo);
  assert.deepEqual(m.groups[0].open.map((it) => [it.id, it.submitted]), [["a2", true], ["a3", true], ["a4", false]]);
  const r = solvePlan(m, 80, {}, 85);
  assert.equal(r.open, 3); // turned-in work still needs a score
  // a0 = 50 x 100/400 + 50 x 70/100 = 12.5 + 35 = 47.5; a1 = 50 + 35 = 85; p = 32.5 / 37.5
  close(r.p, 86.667, "p");
  assert.equal(countsLine(m, r), "Counts your 2 graded scores; the plan is for the 3 things still to come (2 turned in, waiting for a grade).");
});

test("counts line: nothing graded, one graded, everything graded", () => {
  const m = calcModel(weighted);
  assert.equal(countsLine(m, solvePlan(m, 90)), "Counts your 1 graded score; the plan is for the 2 things still to come.");
  const fresh = calcModel({ weighted: false, groups: [{ id: "a", name: "A", weight: 0, assignments: [open("a1", 10)] }] });
  assert.equal(countsLine(fresh, solvePlan(fresh, 90)), "Nothing is graded yet, so the plan is for the one thing still to come.");
  const done = calcModel({ weighted: false, groups: [{ id: "a", name: "A", weight: 0, assignments: [graded("a1", 9, 10), graded("a2", 8, 10)] }] });
  assert.equal(countsLine(done, solvePlan(done, 90)), "Counts your 2 graded scores. Nothing is left to plan.");
  assert.equal(countsLine(calcModel({ weighted: true, groups: [] }), null), "");
});

test("This term goal sentence uses the same plan", () => {
  const s = goalSentence(weighted, 90, 80);
  assert.equal(s.line, "To finish with 90%, you'd need about 94% on the rest."); // 93.3 rounded up
  assert.match(s.sub, /^That's the same score on all 2 things not graded yet/);
  assert.match(goalSentence(weighted, 96, 80).line, /out of reach: even 100% on the rest ends at 95\.0%/);
  assert.match(goalSentence(weighted, 20, 80).line, /^You've already locked in 20%/);
  assert.match(goalSentence(weighted, null).line, /^No goal yet/);
});
