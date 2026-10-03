// Walkthrough mode for the setup screens (/setup?tour=1). Onboarding makes only three writes:
// POST /api/config, POST /api/settings and POST /api/backup/restore. In a walkthrough all are answered here instead, in
// the browser, so nothing is sent or saved. The answers look like the real ones: the same format
// checks and messages as app/api/config/route.js, and on success the sample account below.
// Nothing here touches the network (no Canvas, calendar or Gmail checks), so a walkthrough can't
// change anything.
//
// Every field in a walkthrough starts filled with TOUR_SAMPLE, so you can click Next through each
// step and see it work without typing real details. All of it is obviously fake. It is used only
// when `tour` is set (onboardingStart below); a real first launch starts with empty fields.

import { PALETTE } from "./palette.js";

const MWF = [1, 3, 5];
const TR = [2, 4];

export const TOUR_SAMPLE = Object.freeze({
  canvasBaseUrl: "https://example.instructure.com",
  // Never sent anywhere: a walkthrough answers Connect locally, and the real sender refuses it.
  canvasToken: "sample-token-1234-not-a-real-token",
  name: "Sample Student",
  // One of each kind of row: filled, empty (shows "Same as above"), and switched off.
  classes: [
    { id: "sample-1", name: "Intro to Programming", code: "COP 2006", color: PALETTE[0], hidden: false, times: { days: MWF, start: "09:00", end: "09:50" } },
    { id: "sample-2", name: "Calculus I", code: "MAC 2311", color: PALETTE[1], hidden: false, times: { days: [], start: "", end: "" } },
    { id: "sample-3", name: "Physics I", code: "PHY 2048", color: PALETTE[2], hidden: false, times: { days: TR, start: "11:00", end: "12:15" } },
    { id: "sample-4", name: "English Composition I", code: "ENC 1101", color: PALETTE[3], hidden: false, times: { days: TR, start: "14:00", end: "15:15" } },
    { id: "sample-5", name: "Intro to Engineering", code: "EGN 1007", color: PALETTE[4], hidden: false, times: { days: [3], start: "13:00", end: "15:45" } },
    { id: "sample-6", name: "Career Services", code: "", color: PALETTE[5], hidden: true, times: { days: [], start: "", end: "" } },
  ],
  calendar: {
    google: "https://calendar.google.com/calendar/ical/sample.student%40gmail.com/private-0000sample0000/basic.ics",
    outlook: "https://outlook.office365.com/owa/calendar/sample0000@example.edu/sample0000/calendar.ics",
  },
  email: {
    gmailAddress: "yourname@gmail.com",
    gmailAppPassword: "samp leap pass word", // 16 letters, the format Google shows
    resendApiKey: "re_sample_0000_not_a_real_key",
    digestToEmail: "yourname@school.edu",
    sendTime: "07:00",
    sendDays: "weekdays",
  },
});

// The fields onboarding starts with: the sample values in a walkthrough, empty otherwise.
export function onboardingStart(tour) {
  const s = tour ? TOUR_SAMPLE : null;
  return {
    canvasBaseUrl: s?.canvasBaseUrl ?? "",
    canvasToken: s?.canvasToken ?? "",
    calendarUrls: s?.calendar.google ?? "",
    gmailAddress: s?.email.gmailAddress ?? "",
    gmailAppPassword: s?.email.gmailAppPassword ?? "",
    resendApiKey: s?.email.resendApiKey ?? "",
    digestToEmail: s?.email.digestToEmail ?? "",
    sendTime: "07:00",
    sendDays: "weekdays",
  };
}

// The class rows the walkthrough's "When are your classes?" step starts with (copies, so edits
// never change the sample).
export function sampleClassRows() {
  return TOUR_SAMPLE.classes.map((c) => ({ ...c, times: { ...c.times, days: [...c.times.days] } }));
}

// True when a value is one of the walkthrough's samples (so the real sender can refuse it).
export function isSampleValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const { canvasToken, calendar, email } = TOUR_SAMPLE;
  return [canvasToken, calendar.google, calendar.outlook, email.gmailAppPassword, email.resendApiKey].includes(text);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkCanvasAddress(input) {
  let text = String(input || "").trim();
  if (!text) throw new Error("Enter your school's Canvas address.");
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("That Canvas address doesn't look like a web address.");
  }
  if (url.protocol !== "https:") throw new Error("The Canvas address must start with https://");
}

function checkCalendarLinks(input) {
  String(input || "")
    .split(",")
    .map((u) => u.trim().replace(/^webcal:\/\//i, "https://"))
    .filter(Boolean)
    .forEach((u) => {
      if (!/^https:\/\/\S+$/i.test(u)) throw new Error("A calendar link must start with https:// (or webcal://).");
    });
}

function checkEmail(body) {
  const provider = String(body.emailProvider || "");
  if (!["", "gmail", "resend"].includes(provider)) throw new Error("Pick Gmail or Resend for the morning email.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.sendTime || "").trim())) {
    throw new Error("Pick a time for the morning email, like 7:00 AM.");
  }
  if (!["daily", "weekdays"].includes(body.sendDays)) throw new Error("Pick Every day or Weekdays.");
  const to = String(body.digestToEmail || "").trim();
  if (provider === "gmail") {
    if (!EMAIL.test(String(body.gmailAddress || "").trim())) throw new Error("Enter the Gmail address that will send the email.");
    const password = String(body.gmailAppPassword || "").replace(/\s+/g, "");
    if (!password) throw new Error("Paste the 16-letter app password from Google.");
    if (!/^[a-z]{16}$/i.test(password)) {
      throw new Error("App passwords are 16 letters. Copy the whole thing from Google (the spaces don't matter).");
    }
  }
  if (provider === "resend") {
    if (!String(body.resendApiKey || "").trim()) throw new Error("Add your Resend API key to turn on the morning email.");
    if (!to) throw new Error("Add the email address the summary should go to.");
  }
  if (to && !EMAIL.test(to)) throw new Error("That email address doesn't look right.");
}

// Restoring a backup in a walkthrough: nothing is opened or saved. Any School Dashboard backup
// file (or none at all) "works", so you can see what happens next. Only the file's label is read.
function tourRestore(body) {
  const text = String(body.file || "").trim();
  if (text) {
    let file = null;
    try {
      file = JSON.parse(text.replace(/^﻿/, ""));
    } catch {}
    if (file?.format !== "school-dashboard-backup") throw new Error("That file isn't a School Dashboard backup.");
  }
  if (text && !String(body.password || "")) throw new Error("Type the password you picked when you saved the backup.");
  return { ok: true, name: TOUR_SAMPLE.name, classes: TOUR_SAMPLE.classes.length, emailOn: false, notes: [], needsClassTimes: false };
}

// What the server would answer, without saving: on success, the sample account and its class
// count. Returns { ok: true, ... } or { ok: false, error }.
export function tourResponse(url, body = {}) {
  try {
    if (url === "/api/settings") return { ok: true };
    if (url === "/api/backup/restore") return tourRestore(body);
    if (url !== "/api/config") throw new Error("Not available in the walkthrough.");
    checkCanvasAddress(body.canvasBaseUrl);
    if ("canvasToken" in body && !String(body.canvasToken || "").trim()) throw new Error("Paste your Canvas access token.");
    checkCalendarLinks(body.calendarUrls);
    if ("emailProvider" in body) checkEmail(body);
    return { ok: true, name: TOUR_SAMPLE.name, classes: TOUR_SAMPLE.classes.length, emailOn: false, scheduleWarning: "" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
