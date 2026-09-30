// Tests for lib/tour.js: the setup walkthrough answers onboarding's saves locally, with the same
// format checks as /api/config, and never claims anything was turned on. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { tourResponse } from "../lib/tour.js";

const account = { name: "Jojo", classes: 6 };
const base = { canvasBaseUrl: "floridapoly.instructure.com", timezone: "America/New_York" };
const email = { emailProvider: "gmail", gmailAddress: "me@gmail.com", gmailAppPassword: "abcd efgh ijkl mnop", digestToEmail: "", sendTime: "07:00", sendDays: "weekdays" };

test("connect answers with the connected account's name and class count", () => {
  assert.deepEqual(tourResponse("/api/config", { ...base, canvasToken: "anything" }, account), {
    ok: true, name: "Jojo", classes: 6, emailOn: false, scheduleWarning: "",
  });
});

test("connect still checks the address and that a token was pasted", () => {
  assert.equal(tourResponse("/api/config", { canvasBaseUrl: "", canvasToken: "x" }, account).error, "Enter your school's Canvas address.");
  assert.equal(tourResponse("/api/config", { canvasBaseUrl: "http://a.edu", canvasToken: "x" }, account).error, "The Canvas address must start with https://");
  assert.equal(tourResponse("/api/config", { ...base, canvasToken: "  " }, account).error, "Paste your Canvas access token.");
});

test("calendar links must be https or webcal", () => {
  assert.equal(tourResponse("/api/config", { ...base, calendarUrls: "webcal://calendar.google.com/x.ics" }, account).ok, true);
  assert.equal(tourResponse("/api/config", { ...base, calendarUrls: "calendar.google.com/x.ics" }, account).error, "A calendar link must start with https:// (or webcal://).");
});

test("email fields get the same checks as the real save", () => {
  assert.equal(tourResponse("/api/config", { ...base, ...email }, account).ok, true);
  assert.match(tourResponse("/api/config", { ...base, ...email, gmailAppPassword: "short" }, account).error, /16 letters/);
  assert.equal(tourResponse("/api/config", { ...base, ...email, gmailAddress: "nope" }, account).error, "Enter the Gmail address that will send the email.");
  assert.equal(tourResponse("/api/config", { ...base, ...email, emailProvider: "resend", resendApiKey: "re_1", digestToEmail: "" }, account).error, "Add the email address the summary should go to.");
  assert.equal(tourResponse("/api/config", { ...base, ...email, sendTime: "25:00" }, account).error, "Pick a time for the morning email, like 7:00 AM.");
});

test("class times 'save' succeeds; any other address is refused", () => {
  assert.deepEqual(tourResponse("/api/settings", { schedule: {}, hidden: [] }, account), { ok: true });
  assert.equal(tourResponse("/api/digest", {}, account).ok, false);
});
