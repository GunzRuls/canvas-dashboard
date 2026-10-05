// Tests for lib/digestLate.js (MAIL-5): when the scheduled morning email counts as late, when a
// late one is skipped, the greeting and the "This was due..." line. Pure; nothing is sent.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { digestLateness, greetingFor, lateLine, wallTime } from "../lib/digestLate.js";

const NY = "America/New_York";
// New York wall time in September/October 2026 (EDT, UTC-4).
const ny = (iso) => Date.parse(`${iso}-04:00`);
const late = (now, extra = {}) => digestLateness({ now, sendTime: "09:30", sendDays: "weekdays", timeZone: NY, ...extra });

test("on time and up to 2 hours after are not late", () => {
  for (const t of ["2026-09-30T09:30", "2026-09-30T09:31", "2026-09-30T11:30"]) {
    const r = late(ny(t));
    assert.equal(r.late, false, t);
    assert.equal(r.skip, false, t);
    assert.equal(r.scheduledAt, ny("2026-09-30T09:30"));
    assert.equal(r.daysAgo, 0);
  }
});

test("a clock a few minutes ahead still counts as today's send, not yesterday's", () => {
  const r = late(ny("2026-09-30T09:25"));
  assert.equal(r.late, false);
  assert.equal(r.scheduledAt, ny("2026-09-30T09:30"));
  assert.equal(r.minutesLate, 0);
});

test("more than 2 hours after the send time is late, same day", () => {
  const r = late(ny("2026-09-30T11:31"));
  assert.equal(r.late, true);
  assert.equal(r.skip, false);
  assert.equal(r.minutesLate, 121);
  assert.equal(r.daysAgo, 0);
  assert.equal(r.clock, "9:30 AM");
  assert.equal(lateLine(r), "This was due at 9:30 AM but your PC was off or asleep, so it's coming now.");
  assert.equal(late(ny("2026-09-30T21:00")).late, true);
  assert.equal(greetingFor(ny("2026-09-30T21:00"), NY), "Good evening");
});

test("next day: late from yesterday; skipped when the next send is under 2 hours away", () => {
  // Thursday 6:00 AM: yesterday's 9:30 was missed, today's is 3.5 hours away -> send, late.
  const early = late(ny("2026-10-01T06:00"));
  assert.equal(early.late, true);
  assert.equal(early.skip, false);
  assert.equal(early.daysAgo, 1);
  assert.equal(
    lateLine(early),
    "This was due yesterday at 9:30 AM but your PC was off or asleep, so it's coming now. Everything below is up to date."
  );
  // Thursday 8:00 AM: today's 9:30 is 1.5 hours away -> skip.
  const close = late(ny("2026-10-01T08:00"));
  assert.equal(close.late, true);
  assert.equal(close.skip, true);
  assert.equal(close.nextAt, ny("2026-10-01T09:30"));
});

test("weekdays: a Friday send missed until Monday names Friday; weekends aren't send days", () => {
  // Monday Oct 5, 2026 at 6:00 AM: the last weekday send was Friday Oct 2.
  const r = late(ny("2026-10-05T06:00"));
  assert.equal(r.scheduledAt, ny("2026-10-02T09:30"));
  assert.equal(r.daysAgo, 3);
  assert.equal(r.weekday, "Friday");
  assert.match(lateLine(r), /^This was due Friday at 9:30 AM/);
  // Every day: Monday 6:00 AM belongs to Sunday's send.
  const daily = late(ny("2026-10-05T06:00"), { sendDays: "daily" });
  assert.equal(daily.scheduledAt, ny("2026-10-04T09:30"));
  assert.equal(daily.daysAgo, 1);
});

test("daylight saving: the send time follows the wall clock", () => {
  // Fall back: Sunday Nov 1, 2026, 2:00 AM EDT -> 1:00 AM EST. 7:00 AM that day is 12:00 UTC.
  const est = (iso) => Date.parse(`${iso}-05:00`);
  const r = digestLateness({ now: est("2026-11-01T09:00"), sendTime: "07:00", sendDays: "daily", timeZone: NY });
  assert.equal(r.scheduledAt, Date.parse("2026-11-01T12:00:00Z"));
  assert.equal(r.late, false); // exactly 2 hours
  assert.equal(digestLateness({ now: est("2026-11-01T09:01"), sendTime: "07:00", sendDays: "daily", timeZone: NY }).late, true);
  // Spring forward: Sunday Mar 8, 2026. 7:00 AM EDT is 11:00 UTC.
  const spring = digestLateness({ now: Date.parse("2026-03-08T13:30:00Z"), sendTime: "07:00", sendDays: "daily", timeZone: NY });
  assert.equal(spring.scheduledAt, Date.parse("2026-03-08T11:00:00Z"));
  assert.equal(spring.late, true);
  assert.equal(spring.minutesLate, 150);
  // The day before (EST), 7:00 AM was 12:00 UTC: the 23-hour day doesn't confuse "yesterday".
  const before = digestLateness({ now: Date.parse("2026-03-08T10:00:00Z"), sendTime: "07:00", sendDays: "daily", timeZone: NY });
  assert.equal(before.scheduledAt, Date.parse("2026-03-07T12:00:00Z"));
  assert.equal(before.daysAgo, 1);
  // A send time the clock skips (2:30 AM) happens at 3:30 AM EDT, like Windows does it.
  assert.equal(wallTime(2026, 3, 8, 2, 30, NY), Date.parse("2026-03-08T07:30:00Z"));
  // The repeated hour (1:30 AM on fall-back day) uses the first one.
  assert.equal(wallTime(2026, 11, 1, 1, 30, NY), Date.parse("2026-11-01T05:30:00Z"));
});

test("other time zones, and a bad zone name falls back to UTC", () => {
  const la = digestLateness({ now: Date.parse("2026-09-30T19:00:00Z"), sendTime: "07:00", sendDays: "daily", timeZone: "America/Los_Angeles" });
  assert.equal(la.scheduledAt, Date.parse("2026-09-30T14:00:00Z"));
  assert.equal(la.late, true);
  assert.equal(greetingFor(Date.parse("2026-09-30T19:00:00Z"), "America/Los_Angeles"), "Good afternoon");
  const bad = digestLateness({ now: Date.parse("2026-09-30T08:00:00Z"), sendTime: "07:00", sendDays: "daily", timeZone: "Not/AZone" });
  assert.equal(bad.scheduledAt, Date.parse("2026-09-30T07:00:00Z"));
  assert.equal(bad.late, false);
});

test("greetings by hour, and no line when not late", () => {
  assert.equal(greetingFor(ny("2026-09-30T05:00"), NY), "Good morning");
  assert.equal(greetingFor(ny("2026-09-30T11:59"), NY), "Good morning");
  assert.equal(greetingFor(ny("2026-09-30T12:00"), NY), "Good afternoon");
  assert.equal(greetingFor(ny("2026-09-30T16:59"), NY), "Good afternoon");
  assert.equal(greetingFor(ny("2026-09-30T17:00"), NY), "Good evening");
  assert.equal(greetingFor(ny("2026-09-30T02:00"), NY), "Good evening");
  assert.equal(lateLine(null), "");
  assert.equal(lateLine({ late: false }), "");
});
