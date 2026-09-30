// Tests for lib/settingsData.js: saving class times must not wipe names, colors, hidden
// classes, or attendance links. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cleanSchedule, cleanSettings, mergeSettings } from "../lib/settingsData.js";

const saved = {
  hidden: [30],
  names: { 10: "Calc" },
  colors: { 10: "#7C5CFA" },
  attendance: { 10: "https://example.com/checkin" },
  schedule: { 20: { days: [2, 4], start: "09:00", end: "10:15" } },
};

test("a schedule-only save keeps everything else", () => {
  const out = mergeSettings(saved, { schedule: { 10: { days: [1, 3], start: "14:00", end: "15:15" } } });
  assert.deepEqual(out.hidden, [30]);
  assert.deepEqual(out.names, { 10: "Calc" });
  assert.deepEqual(out.colors, { 10: "#7C5CFA" });
  assert.deepEqual(out.attendance, { 10: "https://example.com/checkin" });
  assert.deepEqual(out.schedule, { 10: { days: [1, 3], start: "14:00", end: "15:15" } });
});

test("a full save (Manage classes) replaces every part", () => {
  const out = mergeSettings(saved, { hidden: [], names: {}, colors: {}, attendance: {}, schedule: {} });
  assert.deepEqual(out, { hidden: [], names: {}, colors: {}, attendance: {}, schedule: {} });
});

test("an empty save changes nothing", () => {
  assert.deepEqual(mergeSettings(saved, {}), cleanSettings(saved));
});

test("class times need days and a start before the end", () => {
  assert.equal(cleanSchedule({ days: [], start: "09:00", end: "10:00" }), null);
  assert.equal(cleanSchedule({ days: [1], start: "10:00", end: "09:00" }), null);
  assert.equal(cleanSchedule({ days: [1], start: "10:00", end: "10:00" }), null);
  assert.equal(cleanSchedule({ days: [1], start: "9:00", end: "10:00" }), null);
  assert.equal(cleanSchedule({ days: [7], start: "09:00", end: "10:00" }), null);
  assert.deepEqual(cleanSchedule({ days: [5, 1, 1, "3"], start: "09:00", end: "10:00" }), {
    days: [1, 3, 5],
    start: "09:00",
    end: "10:00",
  });
});

test("bad entries are dropped when saving", () => {
  const out = cleanSettings({
    hidden: ["12", 0, "x"],
    names: { 1: "  ", 2: "Bio" },
    colors: { 1: "red", 2: "#13a3b5" },
    attendance: { 1: "javascript:alert(1)", 2: "https://x.test" },
    schedule: { 1: { days: [1], start: "11:00", end: "10:00" }, 2: { days: [2], start: "08:00", end: "09:00" } },
  });
  assert.deepEqual(out, {
    hidden: [12],
    names: { 2: "Bio" },
    colors: { 2: "#13a3b5" },
    attendance: { 2: "https://x.test" },
    schedule: { 2: { days: [2], start: "08:00", end: "09:00" } },
  });
});
