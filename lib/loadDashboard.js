import {
  getCourses,
  getPlannerItems,
  getAnnouncements,
  getAttendanceLinks,
  getRecentGrades,
  getClassSessions,
} from "./canvas";
import { getCalendarEvents } from "./calendar";
import { readSettings, applySettings } from "./settings";
import { linkAnnouncements } from "./linking";
import { readDismissed, readSeenGrades } from "./dismissed";

// Everything the dashboard (and the morning email) needs, with hidden classes removed.
function words(text = "") {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

// Google Calendar events whose title mentions a class (by code like "COP 4610" or by name)
// count as that class's meeting times.
function sessionsFromCalendar(events, courses) {
  const out = [];
  for (const e of events) {
    if (e.allDay) continue;
    const title = words(e.title);
    const compact = title.replace(/ /g, "");
    const course = courses.find((c) => {
      const code = (c.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const name = words(c.name);
      return (code.length >= 5 && compact.includes(code)) || (name.trim().length >= 6 && title.includes(name));
    });
    if (course) out.push({ courseId: course.id, start: e.start, end: e.end });
  }
  return out;
}

export async function loadDashboard({ withCalendar = true, withAttendance = true, withGrades = true } = {}) {
  const [settings, canvasCourses, dismissed, seenGrades] = await Promise.all([
    readSettings(),
    getCourses(),
    readDismissed(),
    readSeenGrades(),
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

  return { allCourses, courses, items, announcements, calendar, newGrades, sessions };
}
