import { getConfig, saveConfig, calendarList, publicConfig, SECRET_FIELDS } from "@/lib/config";
import { normalShow } from "@/lib/calendarKind";
import { fromThisApp } from "@/lib/sameOrigin";
import { digestEnabled, gmailTransport, gmailErrorMessage } from "@/lib/digest";
import { scheduleDigest } from "@/lib/schedule";
import { flagAfterSave, taskChange } from "@/lib/emailPc";
import {
  canvasAddress,
  calendarLinks,
  checkCanvas,
  countClasses,
  checkCalendars,
  applyEmailSettings,
  checkTimezone,
} from "@/lib/configChecks";

// Saves what you enter on the setup screen. Canvas is checked before anything is saved.
// Blank secret fields mean "keep what's saved"; names listed in `clear` are removed.
// Only the dashboard's own page may call this: a website open in another tab could otherwise
// point Canvas at its own server and receive your token.

// Linked calendars. `calendars` (Settings) lists the saved ones to keep, by position, with what
// each shows; leaving it out keeps them all. `calendarUrls` adds new links (shown as
// `newCalendarShow`). `clear: ["calendarUrls"]` removes them all. Returns the links that are new.
function applyCalendarSettings(body, current, clear, next) {
  let list = calendarList(current);
  if (clear.has("calendarUrls")) list = [];
  if (Array.isArray(body.calendars)) {
    list = body.calendars
      .filter((c) => Number.isInteger(c?.index) && list[c.index])
      .map((c) => ({ url: list[c.index].url, show: normalShow(c.show) }));
  }
  const added = calendarLinks(body.calendarUrls).filter((url) => !list.some((c) => c.url === url));
  for (const url of added) list.push({ url, show: normalShow(body.newCalendarShow) });
  next.calendarUrls = list.map((c) => c.url).join(",");
  next.calendarShow = list.map((c) => c.show).join(",");
  return added;
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
      if (key === "calendarUrls") continue; // handled by applyCalendarSettings
      const typed = String(body[key] || "").trim();
      if (typed) next[key] = typed;
      else if (clear.has(key) && key !== "canvasToken") next[key] = "";
    }
    // A saved token is only ever reused with the Canvas it was made for.
    if (next.canvasBaseUrl !== current.canvasBaseUrl && !String(body.canvasToken || "").trim()) {
      throw new Error("You changed the Canvas address, so paste your token again too.");
    }
    if (!next.canvasToken) throw new Error("Paste your Canvas access token.");

    const addedCalendars = applyCalendarSettings(body, current, clear, next);
    applyEmailSettings(body, next);

    next.timezone = String(body.timezone || "").trim() || "America/New_York";
    checkTimezone(next.timezone);

    const name = await checkCanvas(next.canvasBaseUrl, next.canvasToken);
    await checkCalendars(addedCalendars);
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

    // MAIL-6: turning the email on here means this PC sends it; other saves keep this PC's choice.
    const enabled = digestEnabled(next);
    const wasEnabled = digestEnabled(current);
    next.digestOnThisPc = flagAfterSave({ wasOn: wasEnabled, isOn: enabled, flag: current.digestOnThisPc });

    saveConfig(next);

    // Create, change, or remove the daily email task when its settings changed (only on the PC
    // that sends the email).
    let scheduleWarning = "";
    const task = taskChange({ before: current, after: next, enabledBefore: wasEnabled, enabledAfter: enabled });
    if (task.needed) {
      await scheduleDigest({ sendTime: next.sendTime, sendDays: next.sendDays, enabled: task.enabled }).catch((error) => {
        scheduleWarning = error.message;
      });
    }

    return Response.json({
      ok: true,
      name,
      classes: await countClasses(next.canvasBaseUrl, next.canvasToken),
      emailOn: enabled,
      scheduleWarning,
      calendars: publicConfig().calendars,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
