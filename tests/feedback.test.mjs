import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackFromSubmissions, fromStaff, unseenCount, scoreText, plainComment, newestFirst, withoutDone, feedbackView } from "../lib/feedback.js";

// Teacher feedback (CLASS-7): which comments count, the 30-day window, order and the new count.

const NOW = Date.parse("2026-10-03T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

function sub(comments, extra = {}) {
  return {
    user_id: 100,
    assignment_id: 7,
    score: 7,
    grade: "7",
    assignment: { id: 7, name: "Lab 1", points_possible: 10, html_url: "/courses/5/assignments/7" },
    submission_comments: comments,
    ...extra,
  };
}

const teacher = (id, d, text = "Nice work!") => ({ id, author_id: 9, author_name: "Dr. Smith", author: { display_name: "Dr. Smith" }, comment: text, created_at: daysAgo(d) });

test("your own comments and anonymous peer reviews are left out", () => {
  const list = feedbackFromSubmissions(
    [
      sub([
        teacher(1, 2),
        { id: 2, author_id: 100, author_name: "Me", comment: "Thanks!", created_at: daysAgo(1) },
        { id: 3, author_id: null, author_name: "Anonymous User", comment: "Peer review", created_at: daysAgo(1) },
      ]),
    ],
    { courseId: 5, now: NOW }
  );
  assert.deepEqual(list.map((f) => f.id), ["1"]);
  assert.equal(list[0].authorName, "Dr. Smith");
  assert.equal(list[0].assignmentTitle, "Lab 1");
  assert.equal(list[0].courseId, 5);
});

test("with the class's teacher list, named classmates are left out too", () => {
  const classmate = { id: 4, author_id: 55, author_name: "Classmate", comment: "Looks good", created_at: daysAgo(1) };
  const list = feedbackFromSubmissions([sub([teacher(1, 2), classmate])], { courseId: 5, now: NOW, staffIds: new Set(["9"]) });
  assert.deepEqual(list.map((f) => f.id), ["1"]);
  assert.equal(fromStaff(classmate, 100, null), true); // without the list, anyone named but you counts
  assert.equal(fromStaff(classmate, 100, new Set(["9"])), false);
});

test("only the last 30 days count", () => {
  const list = feedbackFromSubmissions([sub([teacher(1, 29), teacher(2, 31), teacher(3, 0.5)])], { courseId: 5, now: NOW });
  assert.deepEqual(list.map((f) => f.id).sort(), ["1", "3"]);
});

test("newest first, across assignments", () => {
  const list = feedbackFromSubmissions(
    [sub([teacher(1, 10)]), sub([teacher(2, 1), teacher(3, 5)], { assignment_id: 8, assignment: { id: 8, name: "Lab 2" } })],
    { courseId: 5, now: NOW }
  );
  assert.deepEqual(list.map((f) => f.id), ["2", "3", "1"]);
  assert.deepEqual(newestFirst([{ createdAt: daysAgo(3) }, { createdAt: daysAgo(1) }]).map((f) => f.createdAt), [daysAgo(1), daysAgo(3)]);
});

test("unseen count skips comments you've opened", () => {
  const list = [{ id: "1" }, { id: "2" }, { id: "3" }];
  assert.equal(unseenCount(list, new Set(["2"])), 2);
  assert.equal(unseenCount(list, new Set()), 3);
  assert.equal(unseenCount([], new Set(["1"])), 0);
});

test("comment text is plain; empty comments are skipped", () => {
  assert.equal(plainComment("<p>Good &amp; clear</p><p>Fix #2</p>"), "Good & clear\n\nFix #2");
  assert.equal(plainComment("Line 1<br>Line 2"), "Line 1\nLine 2");
  const list = feedbackFromSubmissions([sub([teacher(1, 1, "   "), teacher(2, 1, "<b>-1</b> sig figs")])], { courseId: 5, now: NOW });
  assert.deepEqual(list.map((f) => f.text), ["-1 sig figs"]);
});

test("links go through link(); the submission page is preferred", () => {
  const link = (u) => (u && !u.startsWith("javascript:") ? `https://canvas.test${u.startsWith("/") ? u : "/" + u}` : null);
  const c = { ...teacher(1, 1), attachments: [{ display_name: "rubric.pdf", url: "/files/3/download" }, { display_name: "bad", url: "javascript:alert(1)" }] };
  const [f] = feedbackFromSubmissions([sub([c])], { courseId: 5, now: NOW, link });
  assert.equal(f.url, "https://canvas.test/courses/5/assignments/7/submissions/100");
  assert.deepEqual(f.attachments, [
    { name: "rubric.pdf", url: "https://canvas.test/files/3/download" },
    { name: "bad", url: null },
  ]);
});

test("score text", () => {
  assert.equal(scoreText({ score: 7, points: 10, grade: "7" }), "7/10");
  assert.equal(scoreText({ score: 88, points: 100, grade: "B+" }), "B+ · 88/100");
  assert.equal(scoreText({ score: 1, points: 1, grade: "complete" }), "Complete");
  assert.equal(scoreText({ score: 9.5, points: null, grade: "9.5" }), "9.5");
  assert.equal(scoreText({ score: null, points: 10, grade: null }), "");
});

test("Done comments leave the Feedback tab and its count; all Done means caught up", () => {
  const list = [{ id: "1" }, { id: "2" }, { id: "3" }];
  assert.deepEqual(withoutDone(list, new Set(["2"])).map((f) => f.id), ["1", "3"]);
  assert.deepEqual(withoutDone(null, new Set()), []);
  // A Done comment that was new doesn't count as new any more.
  const v = feedbackView(list, { seen: new Set(["1"]), done: new Set(["3"]) });
  assert.deepEqual(v.shown.map((f) => f.id), ["1", "2"]);
  assert.equal(v.unseen, 1);
  assert.equal(v.allDone, false);
  // Number ids are matched as strings.
  assert.equal(feedbackView([{ id: 4 }], { seen: new Set(), done: new Set(["4"]) }).shown.length, 0);
  const all = feedbackView(list, { seen: new Set(), done: new Set(["1", "2", "3"]) });
  assert.deepEqual(all, { shown: [], unseen: 0, allDone: true });
  // No comments at all is the plain empty state, not "caught up".
  assert.equal(feedbackView([], { seen: new Set(), done: new Set() }).allDone, false);
});
