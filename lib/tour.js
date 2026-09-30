// Walkthrough mode for the setup screens (/setup?tour=1). Onboarding makes only two writes:
// POST /api/config and POST /api/settings. In a walkthrough both are answered here instead, in
// the browser, so nothing is sent or saved. The answers look like the real ones: the same format
// checks and messages as app/api/config/route.js, and on success the name and class count of the
// account that's already connected. Nothing here touches the network (no Canvas, calendar or
// Gmail checks), so a walkthrough can't change anything.

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

// What the server would answer, without saving. `account` is { name, classes } of the account
// that's already connected. Returns { ok: true, ... } or { ok: false, error }.
export function tourResponse(url, body = {}, account = {}) {
  try {
    if (url === "/api/settings") return { ok: true };
    if (url !== "/api/config") throw new Error("Not available in the walkthrough.");
    checkCanvasAddress(body.canvasBaseUrl);
    if ("canvasToken" in body && !String(body.canvasToken || "").trim()) throw new Error("Paste your Canvas access token.");
    checkCalendarLinks(body.calendarUrls);
    if ("emailProvider" in body) checkEmail(body);
    return { ok: true, name: account.name || "", classes: account.classes ?? null, emailOn: false, scheduleWarning: "" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
