import {
  getCourses,
  getPlannerItems,
  getAnnouncements,
  getAttendanceLinks,
  getRecentGrades,
  getClassSessions,
  getAccount,
} from "./canvas";
import { getCalendarEvents } from "./calendar";
import { readSettings, applySettings } from "./settings";
import { linkAnnouncements } from "./linking";
import { readDismissed, readSeenGrades } from "./dismissed";
import { recordChanges } from "./changes";

// Everything the dashboard (and the morning email) needs, with hidden classes removed.
function words(text = "") {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

// The class an event title mentions, by code ("COP 4610", "cop4610") or by name, if any.
function courseForTitle(text, courses) {
  const title = words(text);
  const compact = title.replace(/ /g, "");
  return courses.find((c) => {
    const code = (c.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = words(c.name);
    return (code.length >= 5 && compact.includes(code)) || (name.trim().length >= 6 && title.includes(name));
  });
}

// Calendar events whose title mentions a class count as that class's meeting times.
function sessionsFromCalendar(events, courses) {
  const out = [];
  for (const e of events) {
    if (e.allDay) continue;
    const course = courseForTitle(e.title, courses);
    if (course) out.push({ courseId: course.id, start: e.start, end: e.end });
  }
  return out;
}

// The week strip shows a calendar's events only if it's set to "Everything", or the event is
// about one of your classes. Only the dates of hidden ones are kept, so the strip can say
// "2 personal events hidden" without their titles reaching the page.
function stripEvents(calendar, courses) {
  const shown = (e) => e.show === "all" || courseForTitle(e.title, courses);
  return {
    ...calendar,
    events: calendar.events.filter(shown),
    hidden: calendar.events.filter((e) => !shown(e)).map(({ allDay, start, end }) => ({ allDay, start, end })),
  };
}

// withChanges: compare with last time for "What's new" (only the dashboard page; the email skips it).
export async function loadDashboard({ withCalendar = true, withAttendance = true, withGrades = true, withChanges = false } = {}) {
  const [settings, canvasCourses, dismissed, seenGrades, account] = await Promise.all([
    readSettings(),
    getCourses(),
    readDismissed(),
    readSeenGrades(),
    getAccount().catch(() => null), // only for the account chip; never blocks the dashboard
  ]);
  const attendanceLinks = withAttendance ? await getAttendanceLinks(canvasCourses) : {};
  const allCourses = applySettings(canvasCourses, settings, attendanceLinks);
  const courses = allCourses.filter((c) => !c.hidden);
  const hiddenIds = new Set(allCourses.filter((c) => c.hidden).map((c) => c.id));

  const [rawItems, rawAnnouncements, calendar, recentGrades, canvasSessions] = await Promise.all([
    getPlannerItems(),
    getAnnouncements(courses),
    withCalendar
      ? getCalendarEvents()
          .then((events) => ({ events, error: null }))
          .catch((error) => ({ events: [], error: error.message }))
      : { events: [], error: null },
    withGrades ? getRecentGrades(courses) : [],
    withAttendance ? getClassSessions(courses.filter((c) => c.attendanceUrl)) : [],
  ]);

  const newGrades = recentGrades.filter((g) => !seenGrades.has(g.key));
  const sessions = [...canvasSessions, ...sessionsFromCalendar(calendar.events, courses)];

  const visibleItems = rawItems.filter((i) => !i.courseId || !hiddenIds.has(i.courseId));
  const liveAnnouncements = rawAnnouncements.filter((a) => !dismissed.has(a.id));
  const { items, announcements } = linkAnnouncements(visibleItems, liveAnnouncements);

  // Never blocks the dashboard if the file can't be saved.
  const whatsNew = withChanges
    ? await recordChanges({ items: rawItems, announcements: rawAnnouncements, grades: recentGrades }).catch(() => null)
    : null;

  return { allCourses, courses, items, announcements, calendar: stripEvents(calendar, courses), newGrades, sessions, account, whatsNew };
}
