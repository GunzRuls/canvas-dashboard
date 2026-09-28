import { getConfig, saveConfig, SECRET_FIELDS } from "@/lib/config";
import { fromThisApp } from "@/lib/sameOrigin";

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
    next.digestToEmail = String(body.digestToEmail || "").trim();
    next.digestFromEmail = String(body.digestFromEmail || "").trim();
    if (next.resendApiKey && !next.digestToEmail) throw new Error("Add the email address the summary should go to.");
    if (next.digestToEmail && !EMAIL.test(next.digestToEmail)) throw new Error("That email address doesn't look right.");
    if (next.digestToEmail && !next.resendApiKey) throw new Error("Add your Resend API key to turn on the morning email.");

    next.timezone = String(body.timezone || "").trim() || "America/New_York";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: next.timezone });
    } catch {
      throw new Error(`"${next.timezone}" isn't a time zone name. Try America/New_York.`);
    }

    const name = await checkCanvas(next.canvasBaseUrl, next.canvasToken);
    if (next.calendarUrls !== current.calendarUrls) await checkCalendars(next.calendarUrls);

    saveConfig(next);
    return Response.json({ ok: true, name });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
