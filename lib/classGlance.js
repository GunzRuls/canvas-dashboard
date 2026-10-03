// "Class at a glance" (CLASS-9), shown when a class row opens on This term: the class's next
// things due and its newest announcement. Pure (no imports), so tests can check it.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Same rule as the board: Canvas's "marked complete" wins, then submission status.
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The next `limit` not-done items of one class that are still ahead (soonest first), how many
// more come after them, and the class's newest announcement (or null).
export function classGlance({ courseId, items = [], status = {}, announcements = [], now, limit = 3 }) {
  const id = String(courseId);
  const ahead = items
    .filter((i) => String(i.courseId) === id && i.dueAt && new Date(i.dueAt).getTime() >= now)
    .filter((i) => (status[i.key] ?? initialStatus(i)) !== "done")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const latest = announcements
    .filter((a) => String(a.courseId) === id)
    .reduce((best, a) => (!best || new Date(a.postedAt || 0) > new Date(best.postedAt || 0) ? a : best), null);
  return { next: ahead.slice(0, limit), more: Math.max(0, ahead.length - limit), announcement: latest };
}

// How soon something is due: "in 45 min", "in 3h" (later today), "tomorrow", "in 5 days",
// with a tone for the pill (red today, amber within 3 days, calm later).
export function dueCountdown(dueMs, now) {
  const left = dueMs - now;
  const days = Math.round((startOfDay(dueMs) - startOfDay(now)) / DAY);
  if (days <= 0) {
    if (left < HOUR) return { text: `in ${Math.max(1, Math.round(left / 60000))} min`, tone: "red" };
    return { text: `in ${Math.round(left / HOUR)}h`, tone: "red" };
  }
  if (days === 1) return { text: "tomorrow", tone: "amber" };
  return { text: `in ${days} days`, tone: days <= 3 ? "amber" : "calm" };
}
