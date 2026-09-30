import ical from "node-ical";
import { getConfig, calendarList } from "./config";

// Reads your calendars (Google, Outlook, or any iCal link) through their private links, set in
// Settings. Each event carries its calendar's `show` setting; lib/loadDashboard.js decides
// which ones reach the week strip.
const DAY = 24 * 60 * 60 * 1000;

function textOf(value) {
  if (!value) return "";
  return typeof value === "string" ? value : value.val || "";
}

// All-day events are a date, not a moment in time, so we pass them as "YYYY-MM-DD".
function dateOnly(d) {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function calendarEnabled() {
  return Boolean(getConfig().calendarUrls);
}

export async function getCalendarEvents({ daysBack = 1, daysAhead = 9 } = {}) {
  const calendars = calendarList();
  if (!calendars.length) return [];

  const from = new Date(Date.now() - daysBack * DAY);
  const to = new Date(Date.now() + daysAhead * DAY);
  const events = [];

  for (const { url, show } of calendars) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error("Couldn't reach one of your calendars. Check your internet connection.");
    }
    if (!res.ok) throw new Error(`One of your calendars returned ${res.status}. Check its link in Settings.`);
    const parsed = ical.sync.parseICS(await res.text());

    for (const ev of Object.values(parsed)) {
      if (ev.type !== "VEVENT" || ev.status === "CANCELLED") continue;
      // Canvas's own calendar feed (if you subscribed a calendar to it) repeats your assignments,
      // which the strip already shows from Canvas directly.
      if (String(ev.uid || "").startsWith("event-assignment-")) continue;
      const instances = ical.expandRecurringEvent(ev, { from, to });
      for (const inst of instances) {
        const allDay = Boolean(inst.isFullDay);
        events.push({
          id: `${ev.uid}-${new Date(inst.start).toISOString()}`,
          show,
          title: textOf(inst.summary) || textOf(ev.summary) || "Busy",
          allDay,
          start: allDay ? dateOnly(inst.start) : new Date(inst.start).toISOString(),
          end: allDay ? dateOnly(inst.end || inst.start) : new Date(inst.end || inst.start).toISOString(),
        });
      }
    }
  }

  return events.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
