// Checks shared by POST /api/config (Settings, onboarding) and POST /api/backup/restore, so a
// restored backup goes through exactly the same rules as typing the same values in Settings.
// Server only (calls Canvas and calendar links).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canvasAddress(input) {
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

export function calendarLinks(input) {
  return String(input || "")
    .split(",")
    .map((u) => u.trim().replace(/^webcal:\/\//i, "https://"))
    .filter(Boolean)
    .map((u) => {
      if (!/^https:\/\/\S+$/i.test(u)) throw new Error("A calendar link must start with https:// (or webcal://).");
      return u;
    });
}

export async function checkCanvas(base, token) {
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
export async function countClasses(base, token) {
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

export async function checkCalendars(links) {
  for (const url of links) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error("Couldn't open that calendar link. Check that you copied all of it.");
    }
    if (!res.ok || !(await res.text()).includes("BEGIN:VCALENDAR")) {
      throw new Error(
        "That link didn't return a calendar. Use Google's \"Secret address in iCal format\" or Outlook's ICS link (not the HTML one)."
      );
    }
  }
}

// The morning email fields. Only fields the form sent are changed, so a save from the Canvas
// or calendar step leaves the email settings alone.
export function applyEmailSettings(body, next) {
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

// Throws when `zone` isn't a time zone name the server knows.
export function checkTimezone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new Error(`"${zone}" isn't a time zone name. Try America/New_York.`);
  }
}
