// Heads up (DASH-13): finds exams coming up in the next 3 weeks from board items, announcements
// and linked calendar events. Pure functions: `now` is passed in, nothing is fetched.
// Dates are local (the computer's clock), like the rest of the dashboard.

const DAY = 24 * 60 * 60 * 1000;
export const EXAM_WINDOW_DAYS = 21;

const sameId = (a, b) => String(a) === String(b);

// Lowercase words only: "Mid-Term Exam #2!" -> "midterm exam #2".
function clean(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/mid-\s?term/g, "midterm")
    .replace(/[^a-z0-9#/: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- which titles are exams ----------

// Studying for an exam, or paperwork after it: related to an exam, never the exam itself.
const PREP = /\b(review|study guide|study session|practice|prep|preparation|sample|mock|wrapper|corrections?|reflection|regrade|solutions?|answer key|sign ?up|survey|seating|accommodations?)\b/;
// Other graded work that borrows exam words ("Midterm Panel" presentation, "Final Report").
const NOT_EXAM = /\b(presentations?|projects?|reports?|papers?|essays?|memos?|proposals?|evaluations?|panels?|demos?|portfolios?|posters?|labs? reports?)\b/;
// "Test" alone is too common in software classes ("Testing Plan", "Test cases"), so it only counts
// with a number ("Test 2") or a word that makes it an exam ("Midterm test", "In class test").
// After the exam: grades, scores, results. Never the exam itself, and never its day.
const AFTER = /\b(grades?|graded|scores?|results|returned|curve|curved|statistics|stats|feedback)\b/;
const TEST =/\btest\s?#?\s?(\d+|i{1,3}|iv|v)\b|\b(midterm|final|in class|class|chapter \d+|unit \d+) test\b/;
const MIDTERM = /\bmidterms?\b/;
const FINAL = /\bfinal (exam|examination|test|assessment)s?\b|\bfinals\b|^final$/;
const EXAM = /\bexam(ination)?s?\b/;

// Which kind of exam a phrase names, ignoring whether it's prep: "midterm" | "final" | "exam" | "test" | null.
function examWord(text) {
  if (MIDTERM.test(text)) return "midterm";
  if (FINAL.test(text)) return "final";
  if (EXAM.test(text)) return "exam";
  if (TEST.test(text)) return "test";
  return null;
}

// The exam kind a board item's or event's title names, or null. Quizzes ("Quiz 3") are not
// exams by title alone; see isExamItem for the points rule.
export function examKind(title) {
  const t = clean(title);
  if (!t || PREP.test(t) || NOT_EXAM.test(t) || AFTER.test(t)) return null;
  return examWord(t);
}

export function isExamTitle(title) {
  return examKind(title) !== null;
}

// Practice exams, review sheets, study guides: shown under the exam they lead up to.
export function isPrepTitle(title) {
  const t = clean(title);
  return Boolean(examWord(t)) && PREP.test(t) && !NOT_EXAM.test(t);
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// A board item is an exam when its title says so. A quiz without exam words counts only when it's
// worth at least twice that class's usual quiz (median of its other quizzes, at least 2 of them),
// so weekly quizzes never show up but a big "Quiz" that's really a test does.
export function isExamItem(item, allItems = []) {
  if (!item || item.type === "planner_note") return false;
  if (isExamTitle(item.title)) return true;
  if (item.type !== "quiz" || !(item.points > 0)) return false;
  const t = clean(item.title);
  if (PREP.test(t) || NOT_EXAM.test(t) || AFTER.test(t)) return false;
  const others = allItems
    .filter((o) => o !== item && o.type === "quiz" && sameId(o.courseId, item.courseId) && o.points > 0)
    .map((o) => o.points);
  const usual = others.length >= 2 ? median(others) : null;
  return usual !== null && item.points >= 2 * usual;
}

// A short name for an exam mentioned in text: "Midterm exam", "Final exam", "Exam 2", "Test 1".
export function examLabel(text) {
  const t = clean(text);
  const kind = examWord(t);
  if (!kind) return null;
  if (kind === "midterm") {
    const n = t.match(/\bmidterm\s?#?\s?(\d+)\b/);
    return n ? `Midterm ${n[1]}` : "Midterm exam";
  }
  if (kind === "final") return "Final exam";
  const word = kind === "exam" ? "exam" : "test";
  const n = t.match(new RegExp(`\\b${word}\\s?#?\\s?(\\d+)\\b`));
  const cap = word[0].toUpperCase() + word.slice(1);
  return n ? `${cap} ${n[1]}` : cap;
}

// ---------- dates written in announcements ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
const SLASH_RE = /(?<![\d/])(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])(?:\/(\d{4}|\d{2}))?(?![\d/])/;
// Full weekday names only: "Sat" or "Wed" alone are too often other words. "last Monday" is in the past.
const WEEKDAY_RE = /(?<!last )\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\bnoon\b/i;

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A month/day without a year belongs to the posted date's year, unless that puts it more than a
// month before the post (a December post about a January exam), then it's next year.
function dayFromParts(month, day, year, postedMs) {
  const posted = new Date(postedMs);
  let y = year ?? posted.getFullYear();
  if (y < 100) y += 2000;
  let d = new Date(y, month, day);
  if (d.getMonth() !== month) return null; // "2/31"
  if (year == null && d.getTime() < startOfDay(postedMs) - 31 * DAY) d = new Date(y + 1, month, day);
  return d.getTime();
}

// The first date written in a piece of text, read relative to when it was posted:
// "10/7", "10/07/2026", "Oct 7", "October 7th", "tomorrow", "Wednesday" (the next Wednesday
// after the post). A written date wins over a bare weekday ("Wednesday 10/7" is 10/7).
// Returns { day (local midnight, ms), time: { h, m } | null } or null.
export function parseDateInText(text, postedMs) {
  if (!text || !Number.isFinite(postedMs)) return null;
  let day = null;
  const slash = text.match(SLASH_RE);
  const month = text.match(MONTH_RE);
  const pick = slash && month ? (slash.index <= month.index ? "slash" : "month") : slash ? "slash" : month ? "month" : null;
  if (pick === "slash") {
    day = dayFromParts(Number(slash[1]) - 1, Number(slash[2]), slash[3] ? Number(slash[3]) : null, postedMs);
  } else if (pick === "month") {
    day = dayFromParts(MONTHS.indexOf(month[1].slice(0, 3).toLowerCase()), Number(month[2]), null, postedMs);
  } else if (/\btomorrow\b/i.test(text)) {
    const d = new Date(startOfDay(postedMs));
    d.setDate(d.getDate() + 1);
    day = d.getTime();
  } else if (/\b(today|tonight)\b/i.test(text)) {
    day = startOfDay(postedMs);
  } else {
    const wd = text.match(WEEKDAY_RE);
    if (wd) {
      const target = WEEKDAYS.indexOf(wd[1].slice(0, 3).toLowerCase());
      const d = new Date(startOfDay(postedMs));
      do d.setDate(d.getDate() + 1);
      while (d.getDay() !== target);
      day = d.getTime();
    }
  }
  if (day == null) return null;
  return { day, time: parseTime(text) };
}

function parseTime(text) {
  const m = text.match(TIME_RE);
  if (!m) return null;
  if (/noon/i.test(m[0])) return { h: 12, m: 0 };
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h < 1 || h > 12 || min > 59) return null;
  const pm = /p/i.test(m[3]);
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return { h, m: min };
}

// Sentences, so a date is only read next to the exam it belongs to. ("Dr. Smith" splitting
// early is harmless.)
function sentences(text = "") {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// A review session in announcement text. Plain "review" isn't enough ("please review chapter 3
// before the exam on 10/7" is about the exam's day).
const REVIEW = /\b(review (session|class|lecture|day)|(exam|midterm|final) review|study session)\b/i;
// Calendar event titles are short, so "COP4531 Review" counts.
const REVIEW_EVENT = /\breview\b|\bstudy session\b/i;

// What an announcement says about exams: the exam it names (with the day, if written next to
// it) and any review session with a day. { label, day, time, review: {day, time} | null } or null.
export function readAnnouncement(a) {
  const posted = new Date(a.postedAt).getTime();
  const titleKind = examKind(a.title);
  const parts = [a.title, ...sentences(a.preview)];
  let label = titleKind ? examLabel(a.title) : null;
  let when = null;
  let review = null;
  for (const [i, s] of parts.entries()) {
    const c = clean(s);
    const isReview = REVIEW.test(s);
    if (isReview) {
      const r = parseDateInText(s, posted);
      if (r && !review) review = r;
      continue;
    }
    if (!examWord(c) || AFTER.test(c)) continue;
    if (i > 0 && !label) label = examLabel(s);
    const d = parseDateInText(s, posted);
    if (d && !when) when = d;
    // The title often has the day and the message the time ("Exam 2 on 10/14" / "10/14 at 9:30").
    else if (d && when && !when.time && d.time && d.day === when.day) when = d;
  }
  if (!label) return null;
  return { label, day: when?.day ?? null, time: when?.time ?? null, review };
}

// ---------- matching calendar events to classes (same rule as lib/loadDashboard.js) ----------

function words(text = "") {
  return ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function courseForTitle(text, courses) {
  const title = words(text);
  const compact = title.replace(/ /g, "");
  return courses.find((c) => {
    const code = (c.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = words(c.name);
    return (code.length >= 5 && compact.includes(code)) || (name.trim().length >= 6 && title.includes(name));
  });
}

// "2026-10-07" (all-day) or an ISO time -> local ms.
function eventStart(e) {
  if (e.allDay && /^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
    const [y, m, d] = e.start.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(e.start).getTime();
}

// 11:59 PM is Canvas's "due by end of day", not when the exam happens.
function hasRealTime(ms) {
  const d = new Date(ms);
  return !(d.getHours() === 23 && d.getMinutes() >= 59) && !(d.getHours() === 0 && d.getMinutes() === 0);
}

function withTime(day, time) {
  if (!time) return day;
  const d = new Date(day);
  d.setHours(time.h, time.m, 0, 0);
  return d.getTime();
}

// ---------- the list ----------

/**
 * Exams in the next 3 weeks, soonest first. Each:
 * { id, courseId, title, day, at, hasTime, daysAway, item?, announcement?, related: [...] }
 * related (max 2): { kind: "announcement", announcement } | { kind: "review", title, day, at,
 * hasTime, announcement?, event? } | { kind: "item", item }.
 * Same class + same day = one exam (an assignment and the announcement about it merge).
 */
export function findExams({ items = [], announcements = [], events = [], courses = [], status = {}, now }) {
  const today = startOfDay(now);
  const last = today + (EXAM_WINDOW_DAYS + 1) * DAY;
  const inWindow = (day) => day >= today && day < last;
  const isDone = (i) => (status[i.key] ?? initialStatus(i)) === "done";
  const known = new Set(courses.map((c) => String(c.id)));
  const ofCourse = (id) => id != null && known.has(String(id));

  const byKey = new Map();
  const reviews = [];
  const undated = []; // announcements about an exam with no day written

  function add(courseId, day, fields) {
    const key = `${courseId}|${day}`;
    const e = byKey.get(key) || { courseId, day, sources: {}, times: {} };
    Object.assign(e.sources, fields.sources);
    Object.assign(e.times, fields.times);
    if (!e.title || fields.rank < e.rank) {
      e.title = fields.title;
      e.rank = fields.rank;
    }
    byKey.set(key, e);
  }

  // Board items (rank 0: they open in Quick look and know their own day).
  for (const i of items) {
    if (!i.dueAt || !ofCourse(i.courseId) || isDone(i) || !isExamItem(i, items)) continue;
    const due = new Date(i.dueAt).getTime();
    const day = startOfDay(due);
    if (!inWindow(day)) continue;
    add(i.courseId, day, { title: i.title.trim(), rank: 0, sources: { item: i }, times: hasRealTime(due) ? { item: due } : {} });
  }

  // Announcements that name an exam. (Ones the board attached to a card are linked below.)
  for (const a of announcements) {
    if (!ofCourse(a.courseId) || !a.postedAt) continue;
    const info = readAnnouncement(a);
    if (!info) continue;
    if (info.review && inWindow(info.review.day)) reviews.push({ courseId: a.courseId, ...info.review, announcement: a });
    if (info.day == null) {
      undated.push(a);
      continue;
    }
    if (!inWindow(info.day)) continue;
    add(a.courseId, info.day, {
      title: info.label,
      rank: 1,
      sources: { announcement: a },
      times: info.time ? { announcement: withTime(info.day, info.time) } : {},
    });
  }

  // Linked calendar events whose title names an exam (or a review) and a class.
  for (const ev of events) {
    const course = courseForTitle(ev.title, courses);
    if (!course) continue;
    const start = eventStart(ev);
    if (!Number.isFinite(start)) continue;
    const day = startOfDay(start);
    if (!inWindow(day)) continue;
    if (isExamTitle(ev.title)) {
      add(course.id, day, { title: ev.title, rank: 2, sources: { event: ev }, times: ev.allDay ? {} : { event: start } });
    } else if (REVIEW_EVENT.test(ev.title) || isPrepTitle(ev.title)) {
      reviews.push({ courseId: course.id, day, time: ev.allDay ? null : { h: new Date(start).getHours(), m: new Date(start).getMinutes() }, event: ev });
    }
  }

  const exams = [...byKey.values()]
    .map((e) => {
      // A calendar event or the teacher's announcement knows the real start time better than a
      // Canvas due time (which is often the end of the exam window).
      const at = e.times.event ?? e.times.announcement ?? e.times.item ?? e.day;
      return {
        id: `${e.courseId}-${e.day}`,
        courseId: e.courseId,
        title: e.title,
        day: e.day,
        at,
        hasTime: at !== e.day,
        daysAway: Math.round((e.day - today) / DAY),
        item: e.sources.item || null,
        announcement: e.sources.announcement || null,
        event: e.sources.event || null,
        related: [],
      };
    })
    .sort((x, y) => x.at - y.at);

  const nextExamFor = (courseId, fromDay) => exams.find((x) => sameId(x.courseId, courseId) && x.day >= fromDay);
  const relate = (exam, r) => exam && exam.related.length < 2 && exam.related.push(r);

  // Review sessions go under the class's next exam on or after that day.
  for (const r of reviews.sort((a, b) => a.day - b.day)) {
    const exam = nextExamFor(r.courseId, r.day);
    if (!exam || r.day > exam.day) continue;
    relate(exam, { kind: "review", title: r.event?.title || "Review session", day: r.day, at: withTime(r.day, r.time), hasTime: Boolean(r.time), announcement: r.announcement || null, event: r.event || null });
  }
  // An exam announcement with no day: link it to the class's next exam rather than guess a day.
  for (const a of undated) {
    const exam = nextExamFor(a.courseId, today);
    if (exam && exam.announcement?.id !== a.id) relate(exam, { kind: "announcement", announcement: a });
  }
  // When the exam opens as a board card, its announcements (merged by day, or attached to the
  // card by the board's title match) are worth a link too.
  for (const exam of exams) {
    if (!exam.item) continue;
    const list = [exam.announcement, ...(exam.item.announcements || [])].filter(Boolean);
    for (const a of list) if (!exam.related.some((r) => r.announcement?.id === a.id)) relate(exam, { kind: "announcement", announcement: a });
  }
  // Practice exams and study guides on the board.
  for (const i of items) {
    if (!i.dueAt || !ofCourse(i.courseId) || isDone(i) || !isPrepTitle(i.title)) continue;
    const exam = nextExamFor(i.courseId, startOfDay(new Date(i.dueAt).getTime()));
    if (exam) relate(exam, { kind: "item", item: i });
  }
  return exams;
}

// Same rule as the board: Canvas's "marked complete" wins, then submission status.
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

// "today", "tomorrow", "in 5 days" and how loud the pill is.
export function countdown(daysAway) {
  if (daysAway <= 0) return { text: "today", tone: "red" };
  if (daysAway === 1) return { text: "tomorrow", tone: "amber" };
  return { text: `in ${daysAway} days`, tone: daysAway <= 3 ? "amber" : "calm" };
}
