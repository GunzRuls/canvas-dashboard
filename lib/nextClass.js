// Builds the "Next class" card: which class is next (or happening now), what's due for it,
// and any fresh announcement. Pure function: `now` is passed in, nothing is fetched.
// Times use the computer's local clock.

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const SOON = 15 * MINUTE; // "Starting soon" heads-up. Check in itself is only offered during class.
const LOOKAHEAD_DAYS = 7;
const ANNOUNCEMENT_DAYS = 3;

const sameId = (a, b) => String(a) === String(b);

// Where a card starts: Canvas's "marked complete" wins, then submission status.
// (Same rule as the board; used only when the status map has no entry.)
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

// "HH:MM" on the same calendar day as `day` (a Date), as a timestamp.
function atTime(day, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(day);
  t.setHours(h, m, 0, 0);
  return t.getTime();
}

// Every session of one class from today through the next 7 days.
// Class times from Manage classes repeat weekly and win over the calendar for that class.
function sessionsForCourse(course, sessions, now) {
  const out = [];
  if (course.schedule) {
    const { days = [], start, end } = course.schedule;
    if (!start || !end) return out;
    for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset); // setDate handles month ends and DST
      if (days.includes(day.getDay())) out.push({ start: atTime(day, start), end: atTime(day, end) });
    }
    return out;
  }
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  for (const s of sessions || []) {
    if (!sameId(s.courseId, course.id)) continue;
    const start = new Date(s.start).getTime();
    const end = new Date(s.end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (start >= todayStart.getTime()) out.push({ start, end });
  }
  return out;
}

// Pick the class to show: one in progress wins (the latest-started if two overlap),
// then the next one later today, then the earliest one on a following day.
function pickSession(courses, sessions, now) {
  const limit = now + LOOKAHEAD_DAYS * DAY;
  const todayKey = new Date(now).toDateString();
  let live = null;
  let nextToday = null;
  let nextLater = null;
  for (const course of courses || []) {
    for (const s of sessionsForCourse(course, sessions, now)) {
      if (now >= s.start && now <= s.end) {
        if (!live || s.start > live.start) live = { course, ...s };
      } else if (s.start > now && s.start <= limit) {
        const bucket = new Date(s.start).toDateString() === todayKey ? "today" : "later";
        if (bucket === "today" && (!nextToday || s.start < nextToday.start)) nextToday = { course, ...s };
        if (bucket === "later" && (!nextLater || s.start < nextLater.start)) nextLater = { course, ...s };
      }
    }
  }
  if (live) return { state: "now", ...live };
  if (nextToday) return { state: nextToday.start - now <= SOON ? "soon" : "later", ...nextToday };
  if (nextLater) return { state: "tomorrow", ...nextLater };
  return null;
}

// Not-done work for this class that's overdue or due within 7 days, most urgent first.
// Sorting by due date puts overdue work ahead of work that's due soon.
function dueWork(course, items, status, now) {
  const limit = now + LOOKAHEAD_DAYS * DAY;
  return (items || [])
    .filter((item) => sameId(item.courseId, course.id) && item.dueAt)
    .filter((item) => (status?.[item.key] ?? initialStatus(item)) !== "done")
    .map((item) => ({ item, due: new Date(item.dueAt).getTime() }))
    .filter(({ due }) => !Number.isNaN(due) && due <= limit)
    .sort((a, b) => a.due - b.due)
    .map(({ item }) => item);
}

// Newest unread announcement for this class from the last 3 days.
function freshAnnouncement(course, announcements, readIds, now) {
  const since = now - ANNOUNCEMENT_DAYS * DAY;
  let best = null;
  let bestAt = -Infinity;
  for (const a of announcements || []) {
    if (!sameId(a.courseId, course.id)) continue;
    const isRead = readIds ? readIds.has(a.id) || !!a.read : !!a.read;
    if (isRead) continue;
    const at = new Date(a.postedAt).getTime();
    if (Number.isNaN(at) || at < since || at > now) continue;
    if (at > bestAt) {
      best = a;
      bestAt = at;
    }
  }
  return best;
}

export function nextClassCard({ courses, sessions, items, status, announcements, readIds, now }) {
  const pick = pickSession(courses, sessions, now);
  if (!pick) return null;
  const { course, start, end, state } = pick;
  const work = dueWork(course, items, status, now);
  const card = {
    state,
    course,
    start,
    end,
    checkInUrl: course.attendanceUrl || null,
    checkInOpensAt: start, // only while class is on (the user's rule)
    urgent: work[0] || null,
    moreDueThisWeek: Math.max(0, work.length - 1),
    announcement: freshAnnouncement(course, announcements, readIds, now),
  };
  // For a class on a later day: weekday (0 = Sunday) and how many days away.
  if (state === "tomorrow") {
    const day = new Date(start);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    card.dayLabel = day.getDay();
    card.daysAway = Math.round((startDay - today) / DAY);
  }
  return card;
}
