// Tests for lib/crunch.js (Heads up: heavy week warning). Times are local;
// new Date(2026, 9, 2) = Friday, October 2, 2026. Weeks run Monday to Sunday.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { findCrunch, weekStart, dayRange } from "../lib/crunch.js";

const at = (month, day, h = 12) => new Date(2026, month - 1, day, h, 0).getTime();
const iso = (month, day, h = 12) => new Date(at(month, day, h)).toISOString();
const NOW = at(10, 2, 9);
let n = 0;
const item = (month, day, points, extra = {}) => ({ key: `i${n++}`, type: "assignment", title: `Work ${n}`, dueAt: iso(month, day), points, submissions: {}, ...extra });

// A steady term: 100 points a week from Aug 31 through Nov 23.
function steadyTerm() {
  const out = [];
  for (let w = 0; w < 13; w++) {
    const d = new Date(2026, 7, 31 + w * 7 + 2); // Wednesdays
    out.push(item(d.getMonth() + 1, d.getDate(), 50), item(d.getMonth() + 1, d.getDate() + 1, 50));
  }
  return out;
}

test("weeks start on Monday", () => {
  assert.equal(weekStart(at(10, 2)), new Date(2026, 8, 28).getTime()); // Fri Oct 2 -> Mon Sep 28
  assert.equal(weekStart(at(10, 4, 23)), new Date(2026, 8, 28).getTime()); // Sunday night, same week
  assert.equal(weekStart(at(10, 5, 0)), new Date(2026, 9, 5).getTime());
});

test("a normal term never flags a week", () => {
  const { heavy, normal, weeks } = findCrunch({ items: steadyTerm(), now: NOW });
  assert.equal(normal, 100);
  assert.equal(heavy, null);
  assert.ok(weeks.length >= 2);
  assert.ok(weeks.every((w) => !w.heavy));
});

test("a week with 3+ things worth 1.5x a normal week is heavy", () => {
  const items = [...steadyTerm(), item(10, 12, 30), item(10, 14, 20), item(10, 15, 10)]; // week of Oct 12 (through Oct 16 9 AM): 100 + 60 = 160
  const { heavy, normal } = findCrunch({ items, now: NOW });
  assert.equal(normal, 100); // a few extra items don't move the median
  assert.ok(heavy);
  assert.equal(heavy.start, new Date(2026, 9, 12).getTime());
  assert.equal(heavy.count, 5);
  assert.equal(heavy.points, 160);
  assert.equal(heavy.items[0].dueAt, iso(10, 12));
});

test("just under 1.5x, or only 2 things, is normal", () => {
  const under = [...steadyTerm(), item(10, 13, 49)]; // 149 < 150
  assert.equal(findCrunch({ items: under, now: NOW }).heavy, null);
  const twoBig = [item(9, 2, 100), item(9, 9, 100), item(9, 16, 100), item(9, 23, 100), item(10, 7, 200), item(10, 8, 200)];
  assert.equal(findCrunch({ items: twoBig, now: NOW }).heavy, null); // 400 pts but only 2 things
});

test("done work and work past 14 days don't count toward the warning", () => {
  const items = [...steadyTerm(), item(10, 12, 30, { submissions: { submitted: true } }), item(10, 13, 30), item(10, 14, 30, { key: "mine" })];
  assert.equal(findCrunch({ items, status: { mine: "done" }, now: NOW }).heavy, null);
  const far = [...steadyTerm(), item(10, 20, 100), item(10, 21, 100), item(10, 22, 100)];
  assert.equal(findCrunch({ items: far, now: NOW }).heavy, null); // Oct 19 week is beyond Oct 16
});

test("too little history: nothing is flagged", () => {
  const items = [item(10, 6, 100), item(10, 7, 100), item(10, 8, 100), item(9, 30, 10)];
  const { heavy, normal } = findCrunch({ items, now: NOW });
  assert.equal(normal, null);
  assert.equal(heavy, null);
});

test("notes and peer reviews aren't counted", () => {
  const items = [...steadyTerm(), item(10, 12, 100), item(10, 13, 0, { type: "planner_note" }), item(10, 14, 0, { type: "assessment_request" })];
  const week = findCrunch({ items, now: NOW }).weeks.find((w) => w.start === new Date(2026, 9, 12).getTime());
  assert.equal(week.count, 3); // two steady items + the 100
});

test("the owner's real board (Oct 2, 2026) reads as normal", () => {
  // Points by due date from the real Planner data; median week is 200, Oct 5-11 has 135 left.
  const real = [
    [9, 11, 25], [9, 11, 40], [9, 17, 100], [9, 18, 100], [9, 21, 10], [9, 23, 110], [9, 23, 30], [9, 25, 40], [9, 25, 15],
    [9, 28, 20], [9, 29, 100], [9, 29, 100], [9, 30, 10], [10, 5, 50], [10, 7, 10], [10, 9, 25], [10, 9, 0], [10, 9, 100],
    [10, 14, 50], [10, 16, 50], [10, 19, 100], [10, 21, 5], [10, 23, 100], [10, 23, 100], [10, 30, 100], [11, 6, 100],
  ].map(([m, d, p]) => item(m, d, p, m === 9 || (m === 10 && d === 5) ? { submissions: { submitted: true } } : {}));
  const { heavy, normal } = findCrunch({ items: real, now: NOW });
  assert.equal(heavy, null);
  assert.ok(normal >= 100);
});

test("day ranges", () => {
  assert.equal(dayRange(at(10, 12), at(10, 16), "en-US"), "Oct 12–16");
  assert.equal(dayRange(at(10, 30), at(11, 3), "en-US"), "Oct 30 – Nov 3");
  assert.equal(dayRange(at(10, 12, 9), at(10, 12, 20), "en-US"), "Oct 12");
});
