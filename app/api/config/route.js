import { getConfig, saveConfig, SECRET_FIELDS } from "@/lib/config";
import { fromThisApp } from "@/lib/sameOrigin";
import { digestEnabled, gmailTransport, gmailErrorMessage } from "@/lib/digest";
import { scheduleDigest } from "@/lib/schedule";

// Saves what you enter on the setup screen. Canvas is checked before anything is saved.
// Blank secret fields mean "keep what's saved"; names listed in `clear` are removed.
// Only the dashboard's own page may call this: a website open in another tab could otherwise
// point Canvas at its own server and receive your token.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function canvasAddress(input) {
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
  return url.origin;
}

function calendarLinks(input) {
  return String(input || "")
    .split(",")
    .map((u) => u.trim().replace(/^webcal:\/\//i, "https://"))
    .filter(Boolean)
    .map((u) => {
      if (!/^https:\/\/\S+$/i.test(u)) throw new Error("Each Google Calendar link must start with https://");
      return u;
    })
    .join(",");
}

async function checkCanvas(base, token) {
  let res;
  try {
    res = await fetch(`${base}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new Error(`Couldn't reach ${base}. Check the Canvas address.`);
  }
  if (res.status === 401) throw new Error("Canvas didn't accept that token. Make a new one and paste it again.");
  // Canvas answers a token that's cut off or has extra characters with a server error.
  if (res.status === 500) throw new Error("Canvas didn't accept that token. Make sure you copied the whole thing, then paste it again.");
  if (!res.ok) throw new Error(`Canvas returned ${res.status}. Check the Canvas address.`);
  const user = await res.json().catch(() => null);
  if (!user?.id) throw new Error("That address didn't answer like Canvas. Check the Canvas address.");
  return user.short_name || user.name || "";
}

// For the "found 6 classes" confirmation during onboarding. Not worth failing the save over.
async function countClasses(base, token) {
  try {
    const res = await fetch(`${base}/api/v1/courses?enrollment_state=active&enrollment_type=student&per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const courses = await res.json();
    return courses.filter((c) => c.name && !c.access_restricted_by_date).length;
  } catch {
    return null;
  }
}

async function checkCalendars(links) {
  for (const url of links.split(",").filter(Boolean)) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error("Couldn't open one of your Google Calendar links.");
    }
    if (!res.ok || !(await res.text()).includes("BEGIN:VCALENDAR")) {
      throw new Error("One of your Google Calendar links didn't return a calendar. Use the secret iCal address.");
    }
  }
}

// The morning email fields. Only fields the form sent are changed, so a save from the Canvas
// or calendar step leaves the email settings alone.
function applyEmailSettings(body, next) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (has("emailProvider")) {
    const provider = String(body.emailProvider || "");
    if (!["", "gmail", "resend"].includes(provider)) throw new Error("Pick Gmail or Resend for the morning email.");
    next.emailProvider = provider;
  }
  if (has("gmailAddress")) next.gmailAddress = String(body.gmailAddress || "").trim().toLowerCase();
  if (has("digestToEmail")) next.digestToEmail = String(body.digestToEmail || "").trim();
  if (has("digestFromEmail")) next.digestFromEmail = String(body.digestFromEmail || "").trim();
  if (has("sendTime")) {
    const time = String(body.sendTime || "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Pick a time for the morning email, like 7:00 AM.");
    next.sendTime = time;
  }
  if (has("sendDays")) {
    if (!["daily", "weekdays"].includes(body.sendDays)) throw new Error("Pick Every day or Weekdays.");
    next.sendDays = body.sendDays;
  }

  if (next.emailProvider === "gmail") {
    if (!EMAIL.test(next.gmailAddress)) throw new Error("Enter the Gmail address that will send the email.");
    next.gmailAppPassword = String(next.gmailAppPassword || "").replace(/\s+/g, "");
    if (!next.gmailAppPassword) throw new Error("Paste the 16-letter app password from Google.");
    if (!/^[a-z]{16}$/i.test(next.gmailAppPassword)) {
      throw new Error("App passwords are 16 letters. Copy the whole thing from Google (the spaces don't matter).");
    }
    next.digestToEmail ||= next.gmailAddress;
  }
  if (next.emailProvider === "resend") {
    if (!next.resendApiKey) throw new Error("Add your Resend API key to turn on the morning email.");
    if (!next.digestToEmail) throw new Error("Add the email address the summary should go to.");
  }
  if (next.digestToEmail && !EMAIL.test(next.digestToEmail)) throw new Error("That email address doesn't look right.");
}

export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const current = getConfig();
    const clear = new Set(Array.isArray(body.clear) ? body.clear : []);
    const next = { ...current };

    next.canvasBaseUrl = canvasAddress(body.canvasBaseUrl);
    for (const key of SECRET_FIELDS) {
      const typed = String(body[key] || "").trim();
      if (typed) next[key] = typed;
      else if (clear.has(key) && key !== "canvasToken") next[key] = "";
    }
    // A saved token is only ever reused with the Canvas it was made for.
    if (next.canvasBaseUrl !== current.canvasBaseUrl && !String(body.canvasToken || "").trim()) {
      throw new Error("You changed the Canvas address, so paste your token again too.");
    }
    if (!next.canvasToken) throw new Error("Paste your Canvas access token.");

    next.calendarUrls = calendarLinks(next.calendarUrls);
    applyEmailSettings(body, next);

    next.timezone = String(body.timezone || "").trim() || "America/New_York";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: next.timezone });
    } catch {
      throw new Error(`"${next.timezone}" isn't a time zone name. Try America/New_York.`);
    }

    const name = await checkCanvas(next.canvasBaseUrl, next.canvasToken);
    if (next.calendarUrls !== current.calendarUrls) await checkCalendars(next.calendarUrls);
    const gmailChanged =
      next.emailProvider === "gmail" &&
      (current.emailProvider !== "gmail" || next.gmailAddress !== current.gmailAddress || next.gmailAppPassword !== current.gmailAppPassword);
    if (gmailChanged) {
      try {
        await gmailTransport(next).verify();
      } catch (error) {
        throw new Error(gmailErrorMessage(error));
      }
    }

    saveConfig(next);

    // Create, change, or remove the daily email task when its settings changed.
    const enabled = digestEnabled(next);
    let scheduleWarning = "";
    if (enabled !== digestEnabled(current) || next.sendTime !== current.sendTime || next.sendDays !== current.sendDays) {
      await scheduleDigest({ sendTime: next.sendTime, sendDays: next.sendDays, enabled }).catch((error) => {
        scheduleWarning = error.message;
      });
    }

    return Response.json({
      ok: true,
      name,
      classes: await countClasses(next.canvasBaseUrl, next.canvasToken),
      emailOn: enabled,
      scheduleWarning,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
