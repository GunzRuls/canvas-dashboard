// Tests for lib/changesDiff.js ("What's new", DASH-10).
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  takeSnapshot,
  diffSnapshots,
  mergeChanges,
  pruneChanges,
  nextChangesState,
  unseenCount,
  recentlyMoved,
} from "../lib/changesDiff.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 15, 0); // Fri Oct 2 2026, 15:00 UTC
const iso = (ms) => new Date(ms).toISOString();

const item = (id, extra = {}) => ({
  key: `assignment-${id}`,
  type: "assignment",
  plannableId: id,
  courseId: 10,
  courseName: "Physics",
  title: `Lab ${id}`,
  dueAt: iso(NOW + 5 * DAY),
  points: 50,
  url: `https://canvas.test/courses/10/assignments/${id}`,
  submissions: {},
  updatedAt: "2026-09-20T12:00:00Z",
  ...extra,
});

// Loads the dashboard twice: `before` an hour ago, `after` now. Returns the fresh changes.
function diff(before, after, { grades = [], announcementsBefore = [], announcementsAfter = [] } = {}) {
  const prev = takeSnapshot({ items: before, announcements: announcementsBefore }, NOW - 60 * 60 * 1000);
  const next = takeSnapshot({ items: after, announcements: announcementsAfter, grades }, NOW);
  return diffSnapshots(prev, next, announcementsAfter, NOW);
}

test("first run takes a baseline and shows nothing", () => {
  const state = nextChangesState(null, { items: [item(1), item(2)] }, NOW);
  assert.deepEqual(state.changes, []);
  assert.equal(Object.keys(state.snapshot.items).length, 2);
  assert.equal(state.seenAt, iso(NOW));
});

test("nothing changed means no changes", () => {
  assert.deepEqual(diff([item(1), item(2)], [item(1), item(2)]), []);
});

test("due date moved later", () => {
  const [c] = diff([item(1)], [item(1, { dueAt: iso(NOW + 9 * DAY), updatedAt: "2026-10-02T14:00:00Z" })]);
  assert.equal(c.kind, "moved");
  assert.equal(c.from, iso(NOW + 5 * DAY));
  assert.equal(c.to, iso(NOW + 9 * DAY));
  assert.equal(c.title, "Lab 1");
});

test("due date moved earlier, and the edit time alone doesn't add an 'edited' entry", () => {
  const changes = diff([item(1)], [item(1, { dueAt: iso(NOW + 2 * DAY), updatedAt: "2026-10-02T14:00:00Z" })]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "moved");
  assert.ok(new Date(changes[0].to) < new Date(changes[0].from));
});

test("a few seconds of difference is not a move", () => {
  assert.deepEqual(diff([item(1)], [item(1, { dueAt: iso(NOW + 5 * DAY + 5000) })]), []);
});

test("new assignment in a class we know", () => {
  const [c] = diff([item(1)], [item(1), item(2)]);
  assert.equal(c.kind, "new");
  assert.equal(c.key, "assignment-2");
});

test("a whole new class (new semester) is not a flood of 'new'", () => {
  assert.deepEqual(diff([item(1)], [item(1), item(2, { courseId: 99 }), item(3, { courseId: 99 })]), []);
});

test("items sliding into the 90-day window aren't new", () => {
  assert.deepEqual(diff([item(1)], [item(1), item(2, { dueAt: iso(NOW + 89 * DAY) })]), []);
});

test("newly graded, with the score from recent grades", () => {
  const grades = [{ courseId: 10, assignmentId: 1, score: 47, points: 50 }];
  const [c] = diff([item(1, { submissions: { submitted: true } })], [item(1, { submissions: { submitted: true, graded: true } })], { grades });
  assert.equal(c.kind, "graded");
  assert.equal(c.score, 47);
  assert.equal(c.points, 50);
});

test("teacher edit (only Canvas's edit time changed) is 'edited'", () => {
  const [c] = diff([item(1)], [item(1, { updatedAt: "2026-10-02T14:00:00Z" })]);
  assert.equal(c.kind, "edited");
});

test("an edit time change on past-due work (grading noise) is ignored", () => {
  const past = item(1, { dueAt: iso(NOW - 3 * DAY) });
  assert.deepEqual(diff([past], [{ ...past, updatedAt: "2026-10-02T14:00:00Z" }]), []);
});

test("renamed and re-pointed show what they were", () => {
  const [c] = diff([item(1)], [item(1, { title: "Lab 1 (updated)", points: 60 })]);
  assert.equal(c.kind, "edited");
  assert.equal(c.oldTitle, "Lab 1");
  assert.equal(c.oldPoints, 50);
  assert.equal(c.points, 60);
});

test("items that drop off (past the window) or your own notes don't flood the feed", () => {
  const old = item(1, { dueAt: iso(NOW - 21 * DAY) });
  const note = { ...item(2), type: "planner_note", key: "planner_note-2" };
  assert.deepEqual(diff([old, note, item(3)], [item(3)]), []);
});

test("an upcoming item that disappears counts as removed", () => {
  const [c] = diff([item(1), item(2)], [item(1)]);
  assert.equal(c.kind, "removed");
  assert.equal(c.key, "assignment-2");
});

test("finished work doesn't show up as a change", () => {
  const done = item(1, { submissions: { submitted: true } });
  assert.deepEqual(diff([item(1)], [done]), []);
});

test("new announcements only if posted since last time", () => {
  const a1 = { id: 5, courseId: 10, title: "Quiz moved", postedAt: iso(NOW - 10 * 60 * 1000) };
  const old = { id: 6, courseId: 10, title: "Welcome", postedAt: iso(NOW - 20 * DAY) };
  const changes = diff([item(1)], [item(1)], { announcementsAfter: [a1, old] });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "announcement");
  assert.equal(changes[0].plannableId, 5);
});

test("a date moved twice keeps the original 'from'; moved back cancels out", () => {
  const first = { kind: "moved", key: "k", from: "2026-10-08T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z", at: iso(NOW - DAY) };
  const second = { kind: "moved", key: "k", from: "2026-10-10T00:00:00.000Z", to: "2026-10-12T00:00:00.000Z", at: iso(NOW) };
  const merged = mergeChanges([first], [second]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].from, first.from);
  assert.equal(merged[0].to, second.to);
  const back = { ...second, from: second.to, to: first.from };
  assert.deepEqual(mergeChanges(merged, [back]), []);
});

test("changes older than 7 days are dropped", () => {
  const list = [
    { kind: "new", key: "a", at: iso(NOW - 8 * DAY) },
    { kind: "new", key: "b", at: iso(NOW - 6 * DAY) },
  ];
  assert.deepEqual(pruneChanges(list, NOW).map((c) => c.key), ["b"]);
});

test("changes survive a refresh, and the badge counts only ones after seenAt", () => {
  const first = nextChangesState(null, { items: [item(1)] }, NOW - 2 * 60 * 60 * 1000);
  const second = nextChangesState(first, { items: [item(1, { dueAt: iso(NOW + 8 * DAY) })] }, NOW - 60 * 60 * 1000);
  assert.equal(second.changes.length, 1);
  const third = nextChangesState(second, { items: [item(1, { dueAt: iso(NOW + 8 * DAY) })] }, NOW);
  assert.equal(third.changes.length, 1, "a plain refresh keeps the change");
  assert.equal(unseenCount(third.changes, third.seenAt), 1);
  assert.equal(unseenCount(third.changes, iso(NOW)), 0);
});

test("score learned earlier is kept when the grade leaves the recent list", () => {
  const grades = [{ courseId: 10, assignmentId: 1, score: 47, points: 50 }];
  const graded = item(1, { submissions: { graded: true } });
  const a = nextChangesState(null, { items: [graded], grades }, NOW - DAY);
  const b = nextChangesState(a, { items: [graded], grades: [] }, NOW);
  assert.equal(b.snapshot.items["assignment-1"].score, 47);
  assert.deepEqual(b.changes, []);
});

test("Moved badge: only moves from the last 3 days", () => {
  const changes = [
    { kind: "moved", key: "a", from: "2026-10-08T00:00:00Z", to: "2026-10-09T00:00:00Z", at: iso(NOW - DAY) },
    { kind: "moved", key: "b", from: "2026-10-08T00:00:00Z", to: "2026-10-09T00:00:00Z", at: iso(NOW - 4 * DAY) },
    { kind: "new", key: "c", at: iso(NOW) },
  ];
  assert.deepEqual(recentlyMoved(changes, NOW), { a: "2026-10-08T00:00:00Z" });
});
