// Tests for lib/exams.js (Heads up: exam countdown). Times are local, built with
// new Date(2026, 9, 2, ...) = Friday, October 2, 2026.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { examKind, isExamTitle, isExamItem, isPrepTitle, examLabel, parseDateInText, readAnnouncement, findExams, countdown } from "../lib/exams.js";

const at = (month, day, h = 12, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const iso = (month, day, h = 12, m = 0) => new Date(at(month, day, h, m)).toISOString();
const NOW = at(10, 2, 9, 0);
const dayOf = (ms) => new Date(ms).toDateString();

const sad = { id: 1, name: "Systems Analysis and Design", code: "CEN3820" };
const algo = { id: 2, name: "Algorithm Design & Analysis", code: "COP4531" };
const arch = { id: 3, name: "Software Design and Architecture", code: "CEN4065" };
const courses = [sad, algo, arch];

const item = (key, courseId, title, dueAt, extra = {}) => ({ key, courseId, title, type: "assignment", dueAt, points: 10, submissions: {}, announcements: [], ...extra });

test("exam titles: the usual names count", () => {
  for (const t of ["Midterm Exam", "Midterm", "Mid-Term 2", "Final Exam", "Final", "Exam 2", "Exam #1", "Test 1", "Test II", "In-Class Test", "Final examination", "Midterm Exam - Requires Respondus LockDown Browser"]) {
    assert.ok(isExamTitle(t), t);
  }
  assert.equal(examKind("Midterm Exam"), "midterm");
  assert.equal(examKind("Final Exam"), "final");
  assert.equal(examKind("Exam 2"), "exam");
  assert.equal(examKind("Test 1"), "test");
});

test("exam titles: look-alikes don't count", () => {
  for (const t of [
    " Testing Plan for Prototype",
    "Contest entry",
    "Unit Test Report",
    "Test cases for the parser",
    "Machine Shop Safety Training Test",
    "Final Report",
    "Final Project",
    "Presentation - Indiv - Midterm Panel",
    "Midterm Project Proposal",
    "Quiz 3- Requires Respondus LockDown Browser",
    "Midterm Exam Review",
    "Practice Exam 1",
    "Exam 1 Study Guide",
    "Midterm grades posted",
    "Examples of design patterns",
    "Latest updates",
  ]) {
    assert.equal(isExamTitle(t), false, t);
  }
});

test("prep titles go under the exam, not in place of it", () => {
  assert.ok(isPrepTitle("Midterm Exam Review"));
  assert.ok(isPrepTitle("Practice Exam 1"));
  assert.equal(isPrepTitle("Reading Chapter 4"), false);
  assert.equal(isPrepTitle("Final Project review"), false);
});

test("quizzes count only with exam words or twice the class's usual quiz points", () => {
  const weekly = [1, 2, 3].map((n) => item(`q${n}`, 2, `Quiz ${n}`, iso(9, n * 7), { type: "quiz", points: 10 }));
  const big = item("q9", 2, "Quiz 4", iso(10, 8), { type: "quiz", points: 50 });
  const normal = item("q5", 2, "Quiz 5", iso(10, 9), { type: "quiz", points: 10 });
  const all = [...weekly, big, normal];
  assert.ok(isExamItem(big, all));
  assert.equal(isExamItem(normal, all), false);
  // Every quiz worth 100 (like the real Algorithms class): none stands out.
  const hundreds = [1, 2, 3].map((n) => item(`h${n}`, 2, `Quiz ${n}`, iso(9, n * 7), { type: "quiz", points: 100 }));
  assert.equal(isExamItem(hundreds[2], hundreds), false);
  // Only one other quiz: not enough to know what's usual.
  const two = [item("a", 4, "Quiz 1", iso(9, 1), { type: "quiz", points: 10 }), item("b", 4, "Quiz 2", iso(9, 8), { type: "quiz", points: 100 })];
  assert.equal(isExamItem(two[1], two), false);
  assert.ok(isExamItem(item("m", 4, "Midterm Quiz", iso(10, 8), { type: "quiz", points: 10 }), two));
});

test("exam labels", () => {
  assert.equal(examLabel("Midterm Exam Wednesday 10/7"), "Midterm exam");
  assert.equal(examLabel("Exam 1 will be held on Canvas on Oct 6th at 8 AM."), "Exam 1");
  assert.equal(examLabel("The final exam is cumulative"), "Final exam");
  assert.equal(examLabel("Test #3 moved"), "Test 3");
  assert.equal(examLabel("No exams here? Actually yes"), "Exam");
  assert.equal(examLabel("Nothing to see"), null);
});

test("dates are read relative to when the announcement was posted", () => {
  const posted = at(9, 30, 8, 51); // Wednesday Sep 30
  assert.equal(dayOf(parseDateInText("Midterm Exam Wednesday 10/7", posted).day), dayOf(at(10, 7)));
  assert.equal(dayOf(parseDateInText("on 10/07/2026", posted).day), dayOf(at(10, 7)));
  const oct6 = parseDateInText("Exam 1 will be held on Canvas on Oct 6th at 8 AM.", posted);
  assert.equal(dayOf(oct6.day), dayOf(at(10, 6)));
  assert.deepEqual(oct6.time, { h: 8, m: 0 });
  assert.deepEqual(parseDateInText("October 12 at 2:30pm", posted).time, { h: 14, m: 30 });
  assert.deepEqual(parseDateInText("Oct 12 at noon", posted).time, { h: 12, m: 0 });
  assert.equal(parseDateInText("Oct 12", posted).time, null);
  // A bare weekday is the next one after the post (posted on a Wednesday -> next Wednesday).
  assert.equal(dayOf(parseDateInText("The exam is on Friday", posted).day), dayOf(at(10, 2)));
  assert.equal(dayOf(parseDateInText("The exam is Wednesday", posted).day), dayOf(at(10, 7)));
  assert.equal(dayOf(parseDateInText("exam tomorrow", posted).day), dayOf(at(10, 1)));
  // "last Monday" is in the past: no date.
  assert.equal(parseDateInText("the exam last Monday went well", posted), null);
  // A December post about January is next year.
  assert.equal(dayOf(parseDateInText("Final exam 1/12", at(12, 15)).day), dayOf(new Date(2027, 0, 12).getTime()));
  assert.equal(parseDateInText("Feb 31", posted), null);
  assert.equal(parseDateInText("no date at all", posted), null);
});

test("announcements: the real Systems Analysis one (exam day + review session)", () => {
  const info = readAnnouncement({
    title: "Midterm Exam Wednesday 10/7",
    postedAt: iso(9, 30, 8, 51),
    preview: "Hello all, The midterm exam will be on Wednesday 10/7 in class. The exam will cover Chapters 1, 2, 3, and 4. On Monday 10/5, we will have a review session in class. Good luck, Dr. Elish",
  });
  assert.equal(info.label, "Midterm exam");
  assert.equal(dayOf(info.day), dayOf(at(10, 7)));
  assert.equal(dayOf(info.review.day), dayOf(at(10, 5)));
});

test("announcements: the real Algorithms one (day and time in the message)", () => {
  const info = readAnnouncement({
    title: "Midterm Exam - Algorithm Design and Analysis ",
    postedAt: iso(9, 29, 13, 36),
    preview: "Exam 1 will be held on Canvas on Oct 6th at 8 AM. Here is what to expect so you can prepare. Format The exam is online through Canvas and requires LockDown browser.",
  });
  assert.equal(info.label, "Midterm exam");
  assert.equal(dayOf(info.day), dayOf(at(10, 6)));
  assert.deepEqual(info.time, { h: 8, m: 0 });
});

test("announcements: grades and plain 'review' don't invent an exam day", () => {
  assert.equal(readAnnouncement({ title: "Midterm grades are posted", postedAt: iso(10, 1), preview: "Exam scores were posted today." }), null);
  const info = readAnnouncement({ title: "Reminder", postedAt: iso(10, 1), preview: "Please review chapter 3 before the exam on 10/9." });
  assert.equal(dayOf(info.day), dayOf(at(10, 9)));
  assert.equal(info.review, null);
  assert.equal(readAnnouncement({ title: "Welcome to the class", postedAt: iso(10, 1), preview: "Office hours are Monday 10/5." }), null);
});

test("findExams: real data shape, merged, sorted, with related links", () => {
  const items = [
    item("assignment-220101", 3, "Midterm Exam", new Date(Date.UTC(2026, 9, 9, 20)).toISOString(), { points: 25 }),
    item("assignment-223348", 3, " Testing Plan for Prototype", iso(10, 5), { points: 40 }),
    item("quiz-54045", 2, "Quiz 3- Requires Respondus LockDown Browser", iso(10, 4), { type: "quiz", points: 100 }),
  ];
  const announcements = [
    { id: 138164, courseId: 1, title: "Midterm Exam Wednesday 10/7", postedAt: iso(9, 30, 8, 51), preview: "The midterm exam will be on Wednesday 10/7 in class. On Monday 10/5, we will have a review session in class." },
    { id: 138125, courseId: 2, title: "Midterm Exam - Algorithm Design and Analysis ", postedAt: iso(9, 29, 13, 36), preview: "Exam 1 will be held on Canvas on Oct 6th at 8 AM." },
  ];
  const exams = findExams({ items, announcements, courses, now: NOW });
  assert.deepEqual(exams.map((e) => e.courseId), [2, 1, 3]);

  const [a, s, m] = exams;
  assert.equal(a.title, "Midterm exam");
  assert.equal(a.hasTime, true);
  assert.equal(a.at, at(10, 6, 8, 0));
  assert.equal(a.daysAway, 4);
  assert.equal(a.announcement.id, 138125);

  assert.equal(s.daysAway, 5);
  assert.equal(s.hasTime, false);
  assert.equal(s.related.length, 1);
  assert.equal(s.related[0].kind, "review");
  assert.equal(dayOf(s.related[0].day), dayOf(at(10, 5)));

  assert.equal(m.item.key, "assignment-220101");
  assert.equal(m.hasTime, true); // 4 PM, not end of day
});

test("findExams: same class and day merge into one, the board card opens it", () => {
  const items = [item("e2", 2, "Exam 2", iso(10, 14, 23, 59))];
  const announcements = [{ id: 9, courseId: 2, title: "Exam 2 on 10/14", postedAt: iso(10, 1), preview: "Exam 2 is 10/14 at 9:30 am in the usual room." }];
  const exams = findExams({ items, announcements, courses, now: NOW });
  assert.equal(exams.length, 1);
  assert.equal(exams[0].title, "Exam 2");
  assert.equal(exams[0].item.key, "e2");
  assert.equal(exams[0].at, at(10, 14, 9, 30)); // the announcement's time beats 11:59 PM
  assert.deepEqual(exams[0].related.map((r) => r.announcement.id), [9]);
});

test("findExams: an announcement with no day links to the exam instead of guessing", () => {
  const items = [item("f", 3, "Final Exam", iso(10, 20, 10, 0))];
  const announcements = [{ id: 5, courseId: 3, title: "About the final exam", postedAt: iso(10, 1), preview: "Bring a calculator." }];
  const exams = findExams({ items, announcements, courses, now: NOW });
  assert.equal(exams.length, 1);
  assert.equal(exams[0].related[0].announcement.id, 5);
  // With no exam to attach to, it shows nothing.
  assert.equal(findExams({ items: [], announcements, courses, now: NOW }).length, 0);
});

test("findExams: calendar events naming an exam and a class, plus review events", () => {
  const events = [
    { title: "COP4531 Exam 2", allDay: false, start: iso(10, 15, 9, 0), end: iso(10, 15, 10, 15) },
    { title: "COP 4531 review", allDay: false, start: iso(10, 13, 17, 0), end: iso(10, 13, 18, 0) },
    { title: "Dentist exam", allDay: false, start: iso(10, 8, 9, 0), end: iso(10, 8, 10, 0) }, // no class
    { title: "CEN3820 Midterm", allDay: true, start: "2026-10-16", end: "2026-10-17" },
  ];
  const exams = findExams({ events, courses, now: NOW });
  assert.equal(exams.length, 2);
  assert.equal(exams[0].at, at(10, 15, 9, 0));
  assert.equal(exams[0].related[0].kind, "review");
  assert.equal(exams[1].hasTime, false);
  assert.equal(dayOf(exams[1].day), dayOf(at(10, 16)));
});

test("findExams: outside 3 weeks, done, hidden classes and past exams are left out", () => {
  const items = [
    item("far", 2, "Final Exam", iso(10, 30)),
    item("done", 2, "Exam 1", iso(10, 6), { submissions: { submitted: true } }),
    item("past", 2, "Exam 0", iso(9, 30)),
    item("hidden", 99, "Midterm", iso(10, 6)),
    item("moved", 2, "Test 2", iso(10, 7)),
  ];
  const exams = findExams({ items, courses, status: { moved: "done" }, now: NOW });
  assert.equal(exams.length, 0);
  const soon = findExams({ items: [item("t", 2, "Test 1", iso(10, 23))], courses, now: NOW });
  assert.equal(soon.length, 1); // day 21 is still in
});

test("countdown pill", () => {
  assert.deepEqual(countdown(0), { text: "today", tone: "red" });
  assert.deepEqual(countdown(1), { text: "tomorrow", tone: "amber" });
  assert.deepEqual(countdown(3), { text: "in 3 days", tone: "amber" });
  assert.deepEqual(countdown(5), { text: "in 5 days", tone: "calm" });
});
