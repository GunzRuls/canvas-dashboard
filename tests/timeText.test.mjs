import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeText, formatTimeText } from "../lib/timeText.js";

test("AM/PM typed out", () => {
  assert.equal(parseTimeText("4:30 pm"), "16:30");
  assert.equal(parseTimeText("4p"), "16:00");
  assert.equal(parseTimeText("9:15a"), "09:15");
  assert.equal(parseTimeText("12pm"), "12:00");
  assert.equal(parseTimeText("12:30 a.m."), "00:30");
});

test("no AM/PM: class-hours guess", () => {
  assert.equal(parseTimeText("4"), "16:00");
  assert.equal(parseTimeText("4:40"), "16:40");
  assert.equal(parseTimeText("9:30"), "09:30");
  assert.equal(parseTimeText("12:15"), "12:15");
  assert.equal(parseTimeText("7"), "07:00");
});

test("24-hour and digits only", () => {
  assert.equal(parseTimeText("16:00"), "16:00");
  assert.equal(parseTimeText("1630"), "16:30");
  assert.equal(parseTimeText("430"), "16:30");
  assert.equal(parseTimeText("0930"), "09:30");
});

test("empty and nonsense", () => {
  assert.equal(parseTimeText(""), "");
  assert.equal(parseTimeText("   "), "");
  assert.equal(parseTimeText("abc"), null);
  assert.equal(parseTimeText("4:75"), null);
  assert.equal(parseTimeText("25:00"), null);
  assert.equal(parseTimeText("13pm"), null);
});

test("shows as 12-hour", () => {
  assert.equal(formatTimeText("16:30"), "4:30 PM");
  assert.equal(formatTimeText("09:05"), "9:05 AM");
  assert.equal(formatTimeText("00:00"), "12:00 AM");
  assert.equal(formatTimeText("12:00"), "12:00 PM");
  assert.equal(formatTimeText(""), "");
});
