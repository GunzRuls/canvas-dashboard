// Tests for lib/tour.js: the setup walkthrough starts every step filled with sample data, answers
// onboarding's saves locally with the same format checks as /api/config, and never claims anything
// was turned on. A real first launch gets none of the sample data. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tourResponse, onboardingStart, sampleClassRows, isSampleValue, TOUR_SAMPLE } from "../lib/tour.js";
import { tourProps } from "../app/setup/tourProps.js";

const base = { canvasBaseUrl: "floridapoly.instructure.com", timezone: "America/New_York" };
const email = { emailProvider: "gmail", gmailAddress: "me@gmail.com", gmailAppPassword: "abcd efgh ijkl mnop", digestToEmail: "", sendTime: "07:00", sendDays: "weekdays" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

test("connect answers with the sample account and its class count", () => {
  assert.deepEqual(tourResponse("/api/config", { ...base, canvasToken: "anything" }), {
    ok: true, name: "Sample Student", classes: TOUR_SAMPLE.classes.length, emailOn: false, scheduleWarning: "",
  });
});

test("clicking straight through with the sample values succeeds at every step", () => {
  const s = onboardingStart(true);
  const at = { canvasBaseUrl: s.canvasBaseUrl, timezone: "America/New_York" };
  const connect = tourResponse("/api/config", { ...at, canvasToken: s.canvasToken });
  assert.equal(connect.ok, true);
  assert.equal(connect.name, TOUR_SAMPLE.name);
  assert.equal(connect.classes, 6);
  const schedule = {};
  for (const r of sampleClassRows()) if (!r.hidden && r.times.days.length) schedule[r.id] = r.times;
  assert.deepEqual(tourResponse("/api/settings", { schedule, hidden: ["sample-6"] }), { ok: true });
  assert.equal(tourResponse("/api/config", { ...at, calendarUrls: s.calendarUrls }).ok, true);
  assert.equal(tourResponse("/api/config", { ...at, calendarUrls: TOUR_SAMPLE.calendar.outlook }).ok, true);
  const mail = { sendTime: s.sendTime, sendDays: s.sendDays, gmailAddress: s.gmailAddress, gmailAppPassword: s.gmailAppPassword, resendApiKey: s.resendApiKey, digestToEmail: s.digestToEmail };
  assert.equal(tourResponse("/api/config", { ...at, ...mail, emailProvider: "gmail" }).ok, true);
  assert.equal(tourResponse("/api/config", { ...at, ...mail, emailProvider: "resend" }).ok, true);
});

test("sample classes show a filled row, an empty row after a filled one, and a switched-off one", () => {
  const rows = sampleClassRows();
  assert.ok(rows.length >= 5 && rows.length <= 6);
  const shown = rows.filter((r) => !r.hidden);
  const filled = shown.filter((r) => r.times.days.length);
  const empty = shown.filter((r) => !r.times.days.length && !r.times.start && !r.times.end);
  assert.ok(filled.length >= 3);
  assert.equal(empty.length, 1);
  assert.deepEqual(rows.filter((r) => r.hidden).map((r) => r.name), ["Career Services"]);
  // "Same as above" needs a filled class right above the empty one.
  const i = rows.indexOf(empty[0]);
  assert.ok(i > 0 && rows[i - 1].times.days.length);
  for (const r of filled) {
    assert.match(r.times.start, HHMM);
    assert.match(r.times.end, HHMM);
    assert.ok(r.times.start < r.times.end, `${r.name} ends after it starts`);
    assert.ok(r.times.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  }
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("editing sample rows never changes the sample", () => {
  const rows = sampleClassRows();
  rows[0].times.days.push(6);
  rows[0].name = "Changed";
  assert.deepEqual(TOUR_SAMPLE.classes[0].times.days, [1, 3, 5]);
  assert.equal(sampleClassRows()[0].name, "Intro to Programming");
});

test("the sample values are obviously fake and pass the same format checks", () => {
  assert.match(TOUR_SAMPLE.canvasBaseUrl, /example\./);
  assert.match(TOUR_SAMPLE.canvasToken, /sample/);
  assert.match(TOUR_SAMPLE.calendar.google, /^https:\/\/calendar\.google\.com\/.*sample/);
  assert.match(TOUR_SAMPLE.calendar.outlook, /^https:\/\/outlook\..*sample/);
  assert.equal(TOUR_SAMPLE.email.gmailAppPassword.replace(/\s+/g, "").length, 16);
});

test("a real first launch starts empty: no sample data outside the walkthrough", () => {
  for (const tour of [null, undefined, false]) {
    const s = onboardingStart(tour);
    assert.deepEqual(s, {
      canvasBaseUrl: "", canvasToken: "", calendarUrls: "", gmailAddress: "", gmailAppPassword: "",
      resendApiKey: "", digestToEmail: "", sendTime: "07:00", sendDays: "weekdays",
    });
    assert.ok(!Object.values(s).some(isSampleValue));
  }
});

test("walkthrough props read nothing real, and Settings props never use the sample", async () => {
  assert.deepEqual(await tourProps(), { sample: true });
  const settingsProps = readFileSync(new URL("../app/setup/settingsProps.js", import.meta.url), "utf8");
  assert.doesNotMatch(settingsProps, /tour/i);
  const tourPropsSource = readFileSync(new URL("../app/setup/tourProps.js", import.meta.url), "utf8");
  assert.doesNotMatch(tourPropsSource, /import/); // no Canvas or config reads
});

test("sample secrets are recognized so the real sender can refuse them", () => {
  assert.equal(isSampleValue(TOUR_SAMPLE.canvasToken), true);
  assert.equal(isSampleValue(` ${TOUR_SAMPLE.calendar.outlook} `), true);
  assert.equal(isSampleValue(TOUR_SAMPLE.email.gmailAppPassword), true);
  assert.equal(isSampleValue("a real token"), false);
  assert.equal(isSampleValue(""), false);
});

test("connect still checks the address and that a token was pasted", () => {
  assert.equal(tourResponse("/api/config", { canvasBaseUrl: "", canvasToken: "x" }).error, "Enter your school's Canvas address.");
  assert.equal(tourResponse("/api/config", { canvasBaseUrl: "http://a.edu", canvasToken: "x" }).error, "The Canvas address must start with https://");
  assert.equal(tourResponse("/api/config", { ...base, canvasToken: "  " }).error, "Paste your Canvas access token.");
});

test("calendar links must be https or webcal", () => {
  assert.equal(tourResponse("/api/config", { ...base, calendarUrls: "webcal://calendar.google.com/x.ics" }).ok, true);
  assert.equal(tourResponse("/api/config", { ...base, calendarUrls: "calendar.google.com/x.ics" }).error, "A calendar link must start with https:// (or webcal://).");
});

test("email fields get the same checks as the real save", () => {
  assert.equal(tourResponse("/api/config", { ...base, ...email }).ok, true);
  assert.match(tourResponse("/api/config", { ...base, ...email, gmailAppPassword: "short" }).error, /16 letters/);
  assert.equal(tourResponse("/api/config", { ...base, ...email, gmailAddress: "nope" }).error, "Enter the Gmail address that will send the email.");
  assert.equal(tourResponse("/api/config", { ...base, ...email, emailProvider: "resend", resendApiKey: "re_1", digestToEmail: "" }).error, "Add the email address the summary should go to.");
  assert.equal(tourResponse("/api/config", { ...base, ...email, sendTime: "25:00" }).error, "Pick a time for the morning email, like 7:00 AM.");
});

test("class times 'save' succeeds; any other address is refused", () => {
  assert.deepEqual(tourResponse("/api/settings", { schedule: {}, hidden: [] }), { ok: true });
  assert.equal(tourResponse("/api/digest", {}).ok, false);
});

test("restoring a backup in the walkthrough opens and saves nothing, and still checks the file's label", () => {
  const ok = tourResponse("/api/backup/restore", { file: "", password: "", emailHere: false });
  assert.equal(ok.ok, true);
  assert.equal(ok.name, TOUR_SAMPLE.name);
  assert.deepEqual(ok.notes, []);
  assert.equal(ok.needsClassTimes, false);
  const file = JSON.stringify({ format: "school-dashboard-backup", version: 1 });
  assert.equal(tourResponse("/api/backup/restore", { file, password: "anything1", emailHere: true }).ok, true);
  assert.match(tourResponse("/api/backup/restore", { file, password: "" }).error, /password/);
  assert.match(tourResponse("/api/backup/restore", { file: "{\"a\":1}", password: "x" }).error, /isn't a School Dashboard backup/);
});

test("the walkthrough restore asks about the morning email first (MAIL-6)", () => {
  const ask = tourResponse("/api/backup/restore", { file: "", password: "" });
  assert.equal(ask.ok, false);
  assert.equal(ask.askEmail, true);
  assert.equal(ask.error, undefined);
});
