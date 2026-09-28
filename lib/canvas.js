import { PALETTE } from "./palette";
import { getConfig } from "./config";

// All communication with Canvas lives here. This file only ever runs on the server,
// so your token never reaches the browser.

const base = () => getConfig().canvasBaseUrl;
const DAY = 24 * 60 * 60 * 1000;


export function absoluteUrl(url) {
  if (!url) return base();
  return url.startsWith("http") ? url : `${base()}${url}`;
}

// Errors carry a `kind` so the page can show the right help:
//   "token"   Canvas rejected the token (expired, deleted, or typed wrong)
//   "offline" Canvas couldn't be reached (no internet, or the address is wrong)
//   "down"    Canvas had a problem on its end
export class CanvasError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export async function canvasFetch(path, options = {}) {
  const { canvasBaseUrl, canvasToken } = getConfig();
  const url = path.startsWith("http") ? path : `${canvasBaseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${canvasToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new CanvasError("offline", "Couldn't reach Canvas. Check your internet connection.");
  }
  if (!res.ok) {
    const text = await res.text();
    // Canvas also answers 401 for "you're not allowed to do that". A dead token is the one
    // that comes with a WWW-Authenticate header or says the token is invalid or expired.
    if (res.status === 401 && (res.headers.get("www-authenticate") || /invalid access token|expired/i.test(text))) {
      throw new CanvasError("token", "Your Canvas token stopped working. Paste a new one in Settings.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Canvas says you don't have permission to do that.");
    }
    if (res.status >= 500) {
      throw new CanvasError("down", "Canvas is having trouble right now. Try again in a few minutes.");
    }
    throw new Error(`Canvas returned ${res.status} for ${path.split("?")[0]}: ${text.slice(0, 200)}`);
  }
  return res;
}

// Canvas splits long lists into pages. It puts the next page's URL in the "Link" header.
function nextPage(res) {
  const link = res.headers.get("link");
  if (!link) return null;
  const next = link.split(",").find((part) => part.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1] ?? null;
}

async function canvasGetAll(path) {
  const results = [];
  let url = path;
  let pages = 0;
  while (url && pages < 20) {
    const res = await canvasFetch(url);
    results.push(...(await res.json()));
    url = nextPage(res);
    pages++;
  }
  return results;
}

function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Reading ----------

export async function getCourses() {
  const courses = await canvasGetAll(
    "/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=total_scores&per_page=100"
  );
  return courses
    .filter((c) => c.name && !c.access_restricted_by_date)
    .sort((a, b) => a.id - b.id)
    .map((c, i) => {
      const enrollment =
        (c.enrollments || []).find((e) => e.type === "student") || c.enrollments?.[0] || {};
      return {
        id: c.id,
        name: c.name,
        code: c.course_code || c.name,
        color: PALETTE[i % PALETTE.length],
        score: enrollment.computed_current_score ?? null,
        grade: enrollment.computed_current_grade ?? null,
        gradesUrl: `${base()}/courses/${c.id}/grades`,
        homeUrl: `${base()}/courses/${c.id}`,
      };
    });
}

// The Planner API is what powers Canvas's own To Do list. It includes submission
// status and your "marked complete" state, which is why we use it for the board.
export async function getPlannerItems() {
  const start = new Date(Date.now() - 21 * DAY).toISOString();
  const end = new Date(Date.now() + 90 * DAY).toISOString();
  const items = await canvasGetAll(
    `/api/v1/planner/items?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&per_page=100`
  );
  return items
    .filter((i) => !["announcement", "calendar_event"].includes(i.plannable_type))
    .map((i) => ({
      key: `${i.plannable_type}-${i.plannable_id}`,
      type: i.plannable_type,
      plannableId: i.plannable_id,
      courseId: i.course_id ?? null,
      courseName: i.context_name || "Personal",
      title: i.plannable?.title || i.plannable?.name || "Untitled",
      dueAt: i.plannable_date || i.plannable?.due_at || null,
      points: i.plannable?.points_possible ?? null,
      // Notes live only in the planner, so there's no Canvas page to link to.
      url: i.plannable_type === "planner_note" ? null : absoluteUrl(i.html_url),
      submissions: i.submissions || {},
      override: i.planner_override
        ? { id: i.planner_override.id, done: !!i.planner_override.marked_complete }
        : null,
      newActivity: !!i.new_activity,
    }));
}

export async function getAnnouncements(courses) {
  if (!courses.length) return [];
  const codes = courses.map((c) => `context_codes[]=course_${c.id}`).join("&");
  const start = new Date(Date.now() - 45 * DAY).toISOString().slice(0, 10);
  const end = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const items = await canvasGetAll(
    `/api/v1/announcements?${codes}&start_date=${start}&end_date=${end}&per_page=50`
  );
  return items
    .map((a) => ({
      id: a.id,
      courseId: Number(String(a.context_code || "").replace("course_", "")),
      title: a.title || "Untitled announcement",
      postedAt: a.posted_at || a.delayed_post_at || null,
      author: a.author?.display_name || a.user_name || "",
      preview: stripHtml(a.message).slice(0, 220),
      url: absoluteUrl(a.html_url),
      read: a.read_state === "read",
    }))
    .sort((x, y) => new Date(y.postedAt) - new Date(x.postedAt));
}

// ---------- Writing back to Canvas ----------

// Marks an item complete (or not) in your Canvas planner / To Do list.
export async function setPlannerComplete({ plannableType, plannableId, overrideId, done }) {
  if (overrideId) {
    const res = await canvasFetch(`/api/v1/planner/overrides/${overrideId}`, {
      method: "PUT",
      body: JSON.stringify({ marked_complete: done }),
    });
    return res.json();
  }
  const res = await canvasFetch("/api/v1/planner/overrides", {
    method: "POST",
    body: JSON.stringify({
      plannable_type: plannableType,
      plannable_id: plannableId,
      marked_complete: done,
    }),
  });
  return res.json();
}

export async function markAnnouncementRead({ courseId, topicId }) {
  await canvasFetch(`/api/v1/courses/${courseId}/discussion_topics/${topicId}/read`, {
    method: "PUT",
  });
  return true;
}

// ---------- Planner notes (your own to-dos, saved into Canvas) ----------

export async function createPlannerNote({ title, date, courseId }) {
  const body = { title, todo_date: date };
  if (courseId) body.course_id = courseId;
  const res = await canvasFetch("/api/v1/planner_notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deletePlannerNote(id) {
  await canvasFetch(`/api/v1/planner_notes/${id}`, { method: "DELETE" });
  return true;
}

// ---------- Grade breakdown for the what-if calculator ----------

export async function getGradeBreakdown(courseId) {
  const [courseRes, groups] = await Promise.all([
    canvasFetch(`/api/v1/courses/${courseId}`),
    canvasGetAll(
      `/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`
    ),
  ]);
  const course = await courseRes.json();

  return {
    weighted: Boolean(course.apply_assignment_group_weights),
    groups: groups
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((g) => ({
        id: g.id,
        name: g.name,
        weight: g.group_weight ?? 0,
        hasDropRules: Boolean(
          g.rules && (g.rules.drop_lowest || g.rules.drop_highest || g.rules.never_drop?.length)
        ),
        assignments: (g.assignments || [])
          .filter((a) => a.published !== false && !a.omit_from_final_grade)
          .map((a) => {
            const sub = a.submission || {};
            const graded = sub.score !== null && sub.score !== undefined && !sub.excused;
            return {
              id: a.id,
              name: a.name,
              points: a.points_possible ?? 0,
              score: graded ? sub.score : null,
              graded,
              excused: Boolean(sub.excused),
              dueAt: a.due_at,
            };
          }),
      })),
  };
}

// ---------- A+ Attendance links ----------

// Each class's Canvas menu is available as "tabs". A+ Attendance shows up there as an
// external tool, so we look for it by name and grab its link.
export async function getAttendanceLinks(courses) {
  const results = await Promise.all(
    courses.map(async (c) => {
      try {
        const res = await canvasFetch(`/api/v1/courses/${c.id}/tabs`);
        const tabs = await res.json();
        const tab = tabs.find(
          (t) => t.type === "external" && /(a\+|aplus).*attendance|attendance/i.test(t.label || "")
        );
        return [c.id, tab ? absoluteUrl(tab.html_url) : null];
      } catch {
        return [c.id, null];
      }
    })
  );
  return Object.fromEntries(results);
}

// ---------- Recently posted grades ----------

// Grades your professors posted in the last `days` days. Hidden (unposted) grades
// come back without a score, so they're skipped.
export async function getRecentGrades(courses, days = 10) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const perCourse = await Promise.all(
    courses.map(async (c) => {
      try {
        const subs = await canvasGetAll(
          `/api/v1/courses/${c.id}/students/submissions?student_ids[]=self&graded_since=${encodeURIComponent(
            since
          )}&include[]=assignment&per_page=100`
        );
        return subs
          .filter((s) => s.graded_at && s.score !== null && s.score !== undefined && !s.excused)
          .map((s) => ({
            key: `${s.assignment_id}:${s.graded_at}`,
            courseId: c.id,
            assignmentId: s.assignment_id,
            quizId: s.assignment?.quiz_id ?? null,
            name: s.assignment?.name || "Assignment",
            score: s.score,
            grade: s.grade,
            points: s.assignment?.points_possible ?? null,
            gradedAt: s.graded_at,
            url: absoluteUrl(s.assignment?.html_url || `/courses/${c.id}/grades`),
          }));
      } catch {
        return [];
      }
    })
  );
  return perCourse.flat().sort((a, b) => new Date(b.gradedAt) - new Date(a.gradedAt));
}

// ---------- Class sessions (for Smart Check in) ----------

// A+ Attendance builds its sessions from class meetings on the Canvas calendar,
// so those events tell us when each class meets.
export async function getClassSessions(courses) {
  if (!courses.length) return [];
  const start = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const sessions = [];
  for (let i = 0; i < courses.length; i += 10) {
    const codes = courses
      .slice(i, i + 10)
      .map((c) => `context_codes[]=course_${c.id}`)
      .join("&");
    try {
      const events = await canvasGetAll(
        `/api/v1/calendar_events?type=event&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(
          end
        )}&per_page=100&${codes}`
      );
      for (const e of events) {
        if (e.all_day || !e.start_at || !e.end_at) continue;
        sessions.push({
          courseId: Number(String(e.context_code || "").replace("course_", "")),
          start: e.start_at,
          end: e.end_at,
        });
      }
    } catch {}
  }
  return sessions;
}
