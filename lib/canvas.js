import { PALETTE } from "./palette";
import { getConfig } from "./config";
import { safeUrl, sameOrigin, canvasId } from "./safeUrl";
import { cleanHtml } from "./sanitizeHtml";
import { fileLinksIn, fileKind, dropFileOnlyBlocks, MAX_FILES } from "./canvasFiles";

// All communication with Canvas lives here. This file only ever runs on the server,
// so your token never reaches the browser.

const base = () => getConfig().canvasBaseUrl;
const DAY = 24 * 60 * 60 * 1000;


// Links Canvas sends back become full http(s) addresses on your Canvas; anything else
// (like "javascript:") becomes no link at all (see lib/safeUrl.js).
export function absoluteUrl(url) {
  if (!url) return base();
  return safeUrl(url, base()) || null;
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
  // Full addresses come from Canvas itself (the "next page" links). The token only goes to the
  // Canvas address you saved, so a link pointing anywhere else is refused.
  if (!sameOrigin(url, canvasBaseUrl)) throw new Error("Canvas sent a link to a different website, so it wasn't followed.");
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
      updatedAt: i.plannable?.updated_at || null, // "What's new" uses it to spot teacher edits
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
    const res = await canvasFetch(`/api/v1/planner/overrides/${canvasId(overrideId)}`, {
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
  await canvasFetch(`/api/v1/courses/${canvasId(courseId)}/discussion_topics/${canvasId(topicId)}/read`, {
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
  await canvasFetch(`/api/v1/planner_notes/${canvasId(id)}`, { method: "DELETE" });
  return true;
}

// ---------- Grade breakdown for the what-if calculator ----------

export async function getGradeBreakdown(id) {
  const courseId = canvasId(id);
  const [courseRes, groups] = await Promise.all([
    canvasFetch(`/api/v1/courses/${courseId}?include[]=grading_scheme`),
    canvasGetAll(
      `/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`
    ),
  ]);
  const course = await courseRes.json();

  return {
    weighted: Boolean(course.apply_assignment_group_weights),
    // The class's letter scale ([["A", 0.94], ["A-", 0.9], ...]), for the goal's letter.
    scheme: Array.isArray(course.grading_scheme) ? course.grading_scheme : [],
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

// ---------- Quick look (the in-app preview of one assignment, quiz, discussion or announcement) ----------

async function getJson(path) {
  return (await canvasFetch(path)).json();
}

// Only what the pop-up shows about your submission.
function submissionInfo(sub) {
  if (!sub) return null;
  const graded = sub.workflow_state === "graded" && sub.score !== null && sub.score !== undefined;
  return {
    submitted: Boolean(sub.submitted_at) || ["submitted", "pending_review"].includes(sub.workflow_state),
    submittedAt: sub.submitted_at || null,
    late: Boolean(sub.late),
    missing: Boolean(sub.missing),
    excused: Boolean(sub.excused),
    graded,
    score: graded ? sub.score : null,
    grade: graded ? sub.grade ?? null : null,
  };
}

// One file as the pop-up shows it. `f` is Canvas's file record (attachments come with one; linked
// files are looked up); null when the lookup failed, so the file keeps just its Open link.
// Open = the file's page on your Canvas; Download = Canvas's own download address (it may be on
// Canvas's file host), only when you're allowed to download it.
function fileInfo(ref, f) {
  const fileId = ref.fileId;
  const name = f?.display_name || f?.filename || ref.name || "File";
  const openPath = ref.courseId ? `/courses/${ref.courseId}/files/${fileId}` : `/files/${fileId}`;
  // "Hidden" files are only left out of the class's Files list; teachers link them on purpose.
  // Locked ones (not available yet) get no Download.
  const locked = !f || f.locked_for_user;
  return {
    id: fileId,
    name,
    size: Number.isFinite(f?.size) ? f.size : null,
    kind: fileKind(f?.["content-type"] || f?.content_type, name, f?.mime_class),
    openUrl: absoluteUrl(openPath),
    downloadUrl: locked ? null : safeUrl(f.url, base()) || null,
  };
}

// Files attached to a discussion/announcement plus every Canvas file linked inside the HTML,
// once each (at most MAX_FILES). Linked files are looked up in parallel through canvasFetch (so
// only your saved Canvas site ever sees the token); one that fails just has no Download button.
async function collectFiles(rawHtml, attachments, courseId) {
  const refs = [];
  const records = new Map();
  for (const a of attachments || []) {
    let fileId;
    try {
      fileId = canvasId(a.id);
    } catch {
      continue;
    }
    if (records.has(fileId)) continue;
    records.set(fileId, a);
    refs.push({ fileId, courseId: null, name: a.display_name || "" });
  }
  for (const ref of fileLinksIn(rawHtml, base())) {
    if (records.has(ref.fileId) || refs.some((r) => r.fileId === ref.fileId)) continue;
    refs.push(ref);
  }
  const list = refs.slice(0, MAX_FILES);
  return Promise.all(
    list.map(async (ref) => {
      let f = records.get(ref.fileId) || null;
      if (!f) {
        try {
          f = await getJson(`/api/v1/files/${canvasId(ref.fileId)}`);
        } catch {
          f = null;
        }
      }
      // Attachments belong to the class, so their page is the class's file page.
      return fileInfo(ref.courseId || !records.has(ref.fileId) ? ref : { ...ref, courseId }, f);
    })
  );
}

function assignmentFacts(a) {
  return {
    dueAt: a.due_at || null,
    lockAt: a.lock_at || null,
    points: a.points_possible ?? null,
    submissionTypes: (a.submission_types || []).filter((t) => !["none", "not_graded", "on_paper", "external_tool"].includes(t)),
    submission: submissionInfo(a.submission),
    lockNote: a.locked_for_user ? stripHtml(a.lock_explanation || "") : "",
  };
}

async function assignmentWithSubmission(courseId, assignmentId) {
  try {
    return await getJson(`/api/v1/courses/${courseId}/assignments/${canvasId(assignmentId)}?include[]=submission`);
  } catch {
    return null; // the item still shows, just without due date / status
  }
}

// `type` is the Planner's type (assignment, quiz, discussion_topic) or "announcement".
// Teacher-written HTML is cleaned (lib/sanitizeHtml.js) before it leaves the server.
export async function getQuickLook(type, rawCourseId, rawId) {
  const courseId = canvasId(rawCourseId);
  const id = canvasId(rawId);
  const clean = (html) => cleanHtml(html, base());
  // Files go in Quick look's own list; a paragraph that is only a link to one of them is dropped
  // from the text so the same file doesn't show twice.
  const textAndFiles = async (rawHtml, attachments) => {
    const files = await collectFiles(rawHtml, attachments, courseId);
    return { html: dropFileOnlyBlocks(clean(rawHtml), files.map((f) => f.id), base()), files };
  };

  if (type === "assignment") {
    const a = await getJson(`/api/v1/courses/${courseId}/assignments/${id}?include[]=submission`);
    return {
      type: a.is_quiz_assignment || a.quiz_id ? "quiz" : "assignment",
      title: a.name || "Untitled",
      url: absoluteUrl(a.html_url),
      ...(await textAndFiles(a.description, [])),
      ...assignmentFacts(a),
    };
  }

  if (type === "quiz") {
    const q = await getJson(`/api/v1/courses/${courseId}/quizzes/${id}`);
    const a = q.assignment_id ? await assignmentWithSubmission(courseId, q.assignment_id) : null;
    return {
      type: "quiz",
      title: q.title || "Untitled quiz",
      url: absoluteUrl(q.html_url),
      ...(await textAndFiles(q.description, [])),
      ...(a ? assignmentFacts(a) : { dueAt: q.due_at || null, points: q.points_possible ?? null, submission: null, submissionTypes: [] }),
      lockNote: q.locked_for_user ? stripHtml(q.lock_explanation || "") : "",
      quiz: {
        timeLimit: q.time_limit ?? null,
        attempts: q.allowed_attempts ?? null,
        questions: q.question_count ?? null,
      },
    };
  }

  if (type === "discussion_topic" || type === "announcement") {
    const t = await getJson(`/api/v1/courses/${courseId}/discussion_topics/${id}`);
    const a = type === "discussion_topic" && t.assignment_id ? await assignmentWithSubmission(courseId, t.assignment_id) : null;
    return {
      type: type === "announcement" || t.is_announcement ? "announcement" : "discussion",
      title: t.title || "Untitled",
      url: absoluteUrl(t.html_url),
      ...(await textAndFiles(t.message, t.attachments)),
      author: t.author?.display_name || t.user_name || "",
      postedAt: t.posted_at || t.delayed_post_at || null,
      ...(a ? assignmentFacts(a) : { dueAt: t.todo_date || null, points: null, submission: null, submissionTypes: [] }),
      // A locked topic usually just means replies are closed; only say why when the message is hidden.
      lockNote: t.locked_for_user && !t.message ? stripHtml(t.lock_explanation || "") : "",
    };
  }

  throw new Error("Quick look doesn't support that kind of item.");
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

// Who the saved token belongs to, so the top bar and Settings can say which Canvas account is
// connected. Cached for 30 minutes per token (it rarely changes).
const accountCache = (globalThis.__canvasAccount ??= { key: "", at: 0, value: null });

export async function getAccount() {
  const { canvasBaseUrl, canvasToken } = getConfig();
  const key = `${canvasBaseUrl}|${canvasToken.slice(-8)}`;
  if (accountCache.key === key && Date.now() - accountCache.at < 30 * 60 * 1000) return accountCache.value;
  const p = await (await canvasFetch("/api/v1/users/self/profile")).json();
  // Canvas's gray placeholder picture counts as no picture: initials look better.
  const avatarUrl = p.avatar_url && !/avatar-50\.png|\/images\/messages\//.test(p.avatar_url) ? safeUrl(p.avatar_url) : "";
  const value = {
    name: p.name || p.short_name || "Canvas user",
    shortName: p.short_name || p.name || "",
    login: p.primary_email || p.login_id || "",
    avatarUrl,
    school: new URL(canvasBaseUrl).hostname,
    profileUrl: `${canvasBaseUrl}/profile`,
  };
  Object.assign(accountCache, { key, at: Date.now(), value });
  return value;
}
