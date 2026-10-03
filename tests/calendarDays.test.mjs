import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsOnDays, localDayKey } from "../lib/calendarDays.js";

// Mon Oct 5 2026 .. Sun Oct 11 2026, local midnights (built locally so any time zone works).
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 5 + i).getTime());
const iso = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const titles = (out) => out.map((list) => list.map((x) => `${x.event.title}${x.first ? "" : "+"}`));

test("localDayKey pads month and day", () => {
  assert.equal(localDayKey(new Date(2026, 0, 3, 15).getTime()), "2026-01-03");
});

test("a timed event lands on its own day only", () => {
  const out = eventsOnDays([{ title: "Club", allDay: false, start: iso(6, 18), end: iso(6, 19) }], days);
  assert.deepEqual(titles(out), [[], ["Club"], [], [], [], [], []]);
});

test("one-day all-day event (end is the next day, exclusive)", () => {
  const out = eventsOnDays([{ title: "Holiday", allDay: true, start: "2026-10-07", end: "2026-10-08" }], days);
  assert.deepEqual(titles(out), [[], [], ["Holiday"], [], [], [], []]);
});

test("all-day event with no real end still shows on its start day", () => {
  const out = eventsOnDays([{ title: "Due", allDay: true, start: "2026-10-09", end: "2026-10-09" }], days);
  assert.deepEqual(titles(out), [[], [], [], [], ["Due"], [], []]);
});

test("multi-day all-day event covers each day, marked as continuing after the first", () => {
  const out = eventsOnDays([{ title: "Trip", allDay: true, start: "2026-10-09", end: "2026-10-12" }], days);
  assert.deepEqual(titles(out), [[], [], [], [], ["Trip"], ["Trip+"], ["Trip+"]]);
});

test("all-day range that started before the window", () => {
  const out = eventsOnDays([{ title: "Break", allDay: true, start: "2026-10-01", end: "2026-10-07" }], days);
  assert.deepEqual(titles(out), [["Break+"], ["Break+"], [], [], [], [], []]);
});

test("timed event across midnight covers both days; ending exactly at midnight does not", () => {
  const out = eventsOnDays(
    [
      { title: "Hackathon", allDay: false, start: iso(9, 20), end: iso(10, 14) },
      { title: "Late", allDay: false, start: iso(5, 22), end: iso(6, 0) },
    ],
    days
  );
  assert.deepEqual(titles(out), [["Late"], [], [], [], ["Hackathon"], ["Hackathon+"], []]);
});

test("events outside the days are left out; zero-length timed events still show", () => {
  const out = eventsOnDays(
    [
      { title: "Before", allDay: false, start: iso(2, 9), end: iso(2, 10) },
      { title: "After", allDay: true, start: "2026-10-20", end: "2026-10-21" },
      { title: "Reminder", allDay: false, start: iso(8, 9), end: iso(8, 9) },
    ],
    days
  );
  assert.deepEqual(titles(out), [[], [], [], ["Reminder"], [], [], []]);
});
