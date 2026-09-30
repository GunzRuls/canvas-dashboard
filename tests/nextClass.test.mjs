// Tests for lib/nextClass.js (the "Next class" card). All times are local, built with
// new Date(2026, 8, 30, ...) = Wednesday, September 30, 2026.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { nextClassCard } from "../lib/nextClass.js";

const at = (h, m, day = 30) => new Date(2026, 8, day, h, m).getTime();
const iso = (h, m, day = 30) => new Date(at(h, m, day)).toISOString();
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const WED = new Date(at(12, 0)).getDay(); // 3

const physics = { id: 1, name: "Physics", attendanceUrl: "https://example.test/attend/1" };
const calc = { id: 2, name: "Calculus" };

const session = (courseId, sh, sm, eh, em, day = 30) => ({
  courseId,
  start: iso(sh, sm, day),
  end: iso(eh, em, day),
});
const item = (key, courseId, dueAt, extra = {}) => ({ key, courseId, title: key, type: "assignment", dueAt, ...extra });

const card = (overrides) =>
  nextClassCard({
    courses: [physics, calc],
    sessions: [],
    items: [],
    status: {},
    announcements: [],
    readIds: new Set(),
    now: at(13, 45),
    ...overrides,
  });

// ---------- picking the class ----------

test("later today: next class more than 15 minutes away", () => {
  const c = card({ sessions: [session(2, 16, 0, 17, 15), session(1, 15, 0, 16, 0)] });
  assert.equal(c.state, "later");
  assert.equal(c.course, physics);
  assert.equal(c.start, at(15, 0));
  assert.equal(c.end, at(16, 0));
  assert.equal(c.checkInUrl, physics.attendanceUrl);
  assert.equal(c.checkInOpensAt, at(15, 0)); // check-in only once class starts
});

test("soon: 12 minutes before start", () => {
  const c = card({ sessions: [session(2, 13, 57, 15, 0)] });
  assert.equal(c.state, "soon");
  assert.equal(c.course, calc);
  assert.equal(c.checkInUrl, null);
  assert.equal(c.checkInOpensAt, at(13, 57));
});

test("now: a class in progress beats one starting soon", () => {
  const c = card({ sessions: [session(1, 13, 30, 14, 20), session(2, 13, 55, 15, 0)] });
  assert.equal(c.state, "now");
  assert.equal(c.course, physics);
});

test("classes that already ended today are skipped", () => {
  const c = card({ sessions: [session(1, 9, 0, 10, 0), session(2, 15, 0, 16, 0)] });
  assert.equal(c.course, calc);
  assert.equal(c.state, "later");
});

test("tomorrow: nothing left today, earliest class on a later day", () => {
  const c = card({
    // Day 33 = Oct 3, day 31 = Oct 1 (Thursday; Date rolls the extra days into October).
    sessions: [session(1, 9, 0, 10, 0), session(2, 11, 0, 12, 0, 33), session(1, 10, 0, 11, 0, 31)],
  });
  assert.equal(c.state, "tomorrow");
  assert.equal(c.course, physics);
  assert.equal(c.start, at(10, 0, 31));
  assert.equal(c.dayLabel, (WED + 1) % 7);
  assert.equal(c.daysAway, 1);
});

test("tomorrow: nothing more than 7 days ahead counts", () => {
  assert.equal(card({ sessions: [session(1, 9, 0, 10, 0, 38)] }), null);
  const c = card({ sessions: [session(1, 9, 0, 10, 0, 36)] });
  assert.equal(c.state, "tomorrow");
  assert.equal(c.daysAway, 6);
});

test("no classes at all gives null", () => {
  assert.equal(card({}), null);
  assert.equal(card({ courses: [] }), null);
});

// ---------- manual class times ----------

test("manual schedule overrides calendar sessions for that class", () => {
  const scheduled = { ...physics, schedule: { days: [WED], start: "15:30", end: "16:45" } };
  const c = card({
    courses: [scheduled],
    // This calendar session would be "now", but Manage classes times win.
    sessions: [session(1, 13, 30, 14, 30)],
  });
  assert.equal(c.state, "later");
  assert.equal(c.start, at(15, 30));
  assert.equal(c.end, at(16, 45));
});

test("manual schedule repeats weekly on its days", () => {
  const friday = (WED + 2) % 7;
  const scheduled = { ...calc, schedule: { days: [friday], start: "09:00", end: "10:15" } };
  const c = card({ courses: [scheduled] });
  assert.equal(c.state, "tomorrow");
  assert.equal(c.start, new Date(2026, 9, 2, 9, 0).getTime());
  assert.equal(c.dayLabel, friday);
  assert.equal(c.daysAway, 2);
});

test("manual schedule today that already ended rolls to next week", () => {
  const scheduled = { ...calc, schedule: { days: [WED], start: "08:00", end: "09:00" } };
  const c = card({ courses: [scheduled] });
  assert.equal(c.state, "tomorrow");
  assert.equal(c.start, new Date(2026, 9, 7, 8, 0).getTime());
  assert.equal(c.daysAway, 7);
});

// ---------- due work ----------

const physicsNow = [session(1, 15, 0, 16, 0)];

test("done items never count (status map, override, or submission)", () => {
  const c = card({
    sessions: physicsNow,
    items: [
      item("a", 1, iso(20, 0), {}),
      item("b", 1, iso(18, 0), { override: { done: true } }),
      item("c", 1, iso(17, 0), { submissions: { submitted: true } }),
      item("d", 1, iso(16, 0)),
    ],
    status: { d: "done" },
  });
  assert.equal(c.urgent.key, "a");
  assert.equal(c.moreDueThisWeek, 0);
});

test("status map wins over Canvas status", () => {
  const c = card({
    sessions: physicsNow,
    items: [item("sub", 1, iso(17, 0), { submissions: { submitted: true } })],
    status: { sub: "doing" },
  });
  assert.equal(c.urgent.key, "sub");
});

test("overdue beats due soon", () => {
  const c = card({
    sessions: physicsNow,
    items: [item("soon", 1, iso(23, 59)), item("late", 1, iso(23, 59, 28))],
  });
  assert.equal(c.urgent.key, "late");
  assert.equal(c.moreDueThisWeek, 1);
});

test("urgent is null when nothing is due within 7 days", () => {
  const c = card({
    sessions: physicsNow,
    items: [item("far", 1, iso(12, 0, 38)), item("nodate", 1, null), item("other", 2, iso(18, 0))],
  });
  assert.equal(c.urgent, null);
  assert.equal(c.moreDueThisWeek, 0);
});

test("moreDueThisWeek counts other not-done work for this class only", () => {
  const c = card({
    sessions: physicsNow,
    items: [
      item("w1", 1, iso(18, 0)),
      item("w2", 1, iso(9, 0, 32)),
      item("w3", 1, iso(9, 0, 36)),
      item("late", 1, iso(9, 0, 20)),
      item("done", 1, iso(10, 0, 31)),
      item("far", 1, iso(9, 0, 40)),
      item("calc", 2, iso(18, 0)),
    ],
    status: { done: "done" },
  });
  assert.equal(c.urgent.key, "late");
  assert.equal(c.moreDueThisWeek, 3); // w1, w2, w3
});

// ---------- announcements ----------

const ann = (id, courseId, postedAt, read = false) => ({ id, courseId, title: `A${id}`, postedAt, url: "#", read });

test("newest unread announcement from the last 3 days", () => {
  const c = card({
    sessions: physicsNow,
    announcements: [ann(1, 1, iso(9, 0, 29)), ann(2, 1, iso(8, 0)), ann(3, 2, iso(12, 0))],
  });
  assert.equal(c.announcement.id, 2);
});

test("announcements older than 3 days or read are excluded", () => {
  const c = card({
    sessions: physicsNow,
    announcements: [
      ann(1, 1, new Date(at(13, 45) - 3 * DAY - MIN).toISOString()), // just over 3 days old
      ann(2, 1, iso(8, 0), true), // read in Canvas
      ann(3, 1, iso(9, 0)), // marked read in the dashboard
    ],
    readIds: new Set([3]),
  });
  assert.equal(c.announcement, null);
});

test("announcement read flag is used when readIds is missing", () => {
  const c = card({
    sessions: physicsNow,
    readIds: undefined,
    announcements: [ann(1, 1, iso(8, 0), true), ann(2, 1, iso(7, 0))],
  });
  assert.equal(c.announcement.id, 2);
});
