import ical from "node-ical";

// Reads your Google Calendar through its private iCal link (set in .env.local).
// Several calendars can be listed, separated by commas.
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
  return Boolean(process.env.GOOGLE_CALENDAR_ICS_URL);
}

export async function getCalendarEvents({ daysBack = 1, daysAhead = 9 } = {}) {
  const urls = (process.env.GOOGLE_CALENDAR_ICS_URL || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return [];

  const from = new Date(Date.now() - daysBack * DAY);
  const to = new Date(Date.now() + daysAhead * DAY);
  const events = [];

  for (const url of urls) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Google Calendar returned ${res.status}. Check GOOGLE_CALENDAR_ICS_URL.`);
    const parsed = ical.sync.parseICS(await res.text());

    for (const ev of Object.values(parsed)) {
      if (ev.type !== "VEVENT" || ev.status === "CANCELLED") continue;
      const instances = ical.expandRecurringEvent(ev, { from, to });
      for (const inst of instances) {
        const allDay = Boolean(inst.isFullDay);
        events.push({
          id: `${ev.uid}-${new Date(inst.start).toISOString()}`,
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
