// Tests for lib/classGlance.js (This term: "Class at a glance" in an open class row).
// Times are local; new Date(2026, 9, 2) = Friday, October 2, 2026.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { classGlance, dueCountdown } from "../lib/classGlance.js";

const at = (month, day, h = 12, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const iso = (month, day, h = 12) => new Date(at(month, day, h)).toISOString();
const NOW = at(10, 2, 9);
let n = 0;
const item = (courseId, month, day, extra = {}) => ({ key: `i${n++}`, courseId, title: `Work ${n}`, dueAt: iso(month, day), submissions: {}, ...extra });

test("next three not-done items of the class, soonest first, with the rest counted", () => {
  const items = [
    item(1, 10, 9),
    item(1, 10, 3),
    item(1, 10, 1), // already past
    item(2, 10, 3), // another class
    item(1, 10, 4, { submissions: { submitted: true } }), // turned in
    item(1, 10, 5, { override: { done: true } }), // marked done in Canvas
    item(1, 10, 6),
    item(1, 10, 20),
    item(1, 10, 7, { dueAt: null }), // no date
  ];
  const g = classGlance({ courseId: "1", items, now: NOW });
  assert.deepEqual(g.next.map((i) => i.dueAt), [iso(10, 3), iso(10, 6), iso(10, 9)]);
  assert.equal(g.more, 1);
});

test("the board's local status wins over Canvas", () => {
  const a = item(1, 10, 3, { submissions: { submitted: true } });
  const b = item(1, 10, 4);
  const g = classGlance({ courseId: 1, items: [a, b], status: { [a.key]: "todo", [b.key]: "done" }, now: NOW });
  assert.deepEqual(g.next.map((i) => i.key), [a.key]);
  assert.equal(g.more, 0);
});

test("newest announcement of the class, or null", () => {
  const announcements = [
    { id: 1, courseId: 1, postedAt: iso(9, 28) },
    { id: 2, courseId: 1, postedAt: iso(10, 1) },
    { id: 3, courseId: 2, postedAt: iso(10, 2) },
  ];
  assert.equal(classGlance({ courseId: 1, announcements, now: NOW }).announcement.id, 2);
  assert.equal(classGlance({ courseId: 9, announcements, now: NOW }).announcement, null);
});

test("countdown text and tone", () => {
  assert.deepEqual(dueCountdown(at(10, 2, 9, 40), NOW), { text: "in 40 min", tone: "red" });
  assert.deepEqual(dueCountdown(at(10, 2, 23, 59), NOW), { text: "in 15h", tone: "red" });
  assert.deepEqual(dueCountdown(at(10, 3, 8), NOW), { text: "tomorrow", tone: "amber" });
  assert.deepEqual(dueCountdown(at(10, 5, 23), NOW), { text: "in 3 days", tone: "amber" });
  assert.deepEqual(dueCountdown(at(10, 9, 23), NOW), { text: "in 7 days", tone: "calm" });
});
