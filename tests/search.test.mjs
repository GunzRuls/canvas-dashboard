// Tests for lib/search.js (the Ctrl+K search box). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  fold,
  queryWords,
  matchLevel,
  rankEntries,
  byWhen,
  highlight,
  snippet,
  nextDue,
  newestAnnouncements,
  fileSearchTerm,
} from "../lib/search.js";

const NOW = new Date("2026-10-02T12:00:00Z").getTime();
const DAY = 86400000;
const iso = (days) => new Date(NOW + days * DAY).toISOString();
const titles = (list) => list.map((e) => e.title);

test("fold lowercases, drops accents and turns punctuation into spaces", () => {
  assert.equal(fold("Résumé: Lab-Report!"), "resume  lab report ");
  assert.equal(fold("CEN 4065"), "cen 4065");
  assert.equal(fold(null), "");
});

test("queryWords splits and dedupes", () => {
  assert.deepEqual(queryWords("  Lab lab, RÉSUMÉ "), ["lab", "resume"]);
  assert.deepEqual(queryWords("   "), []);
});

test("matchLevel: whole word 3, start of word 2, inside a word 1, missing 0", () => {
  const t = fold("Lab Report 3");
  assert.equal(matchLevel(t, "lab"), 3);
  assert.equal(matchLevel(t, "rep"), 2);
  assert.equal(matchLevel(t, "port"), 1);
  assert.equal(matchLevel(t, "quiz"), 0);
  // A later whole-word match beats an earlier partial one.
  assert.equal(matchLevel(fold("Labs and lab"), "lab"), 3);
});

test("every word must match somewhere", () => {
  const entries = [
    { title: "Lab report", meta: "Physics" },
    { title: "Lab safety quiz", meta: "Chemistry" },
  ];
  assert.deepEqual(titles(rankEntries(entries, "lab physics", NOW)), ["Lab report"]);
  assert.deepEqual(titles(rankEntries(entries, "lab history", NOW)), []);
  assert.deepEqual(rankEntries(entries, "  ", NOW), []);
});

test("title beats class name beats body text", () => {
  const entries = [
    { title: "Weekly notes", body: "Bring your essay" },
    { title: "Reading", meta: "Essay Writing" },
    { title: "Essay 2" },
  ];
  assert.deepEqual(titles(rankEntries(entries, "essay", NOW)), ["Essay 2", "Reading", "Weekly notes"]);
});

test("whole word beats start of word beats inside a word", () => {
  const entries = [{ title: "Homework" }, { title: "Workshop" }, { title: "Work log" }];
  assert.deepEqual(titles(rankEntries(entries, "work", NOW)), ["Work log", "Workshop", "Homework"]);
});

test("case and accents don't matter", () => {
  const entries = [{ title: "Résumé draft" }];
  assert.equal(rankEntries(entries, "RESUME", NOW).length, 1);
  assert.equal(rankEntries(entries, "résumé", NOW).length, 1);
});

test("the words in order in the title get a bonus", () => {
  const entries = [{ title: "Report on the lab" }, { title: "Lab report" }];
  assert.deepEqual(titles(rankEntries(entries, "lab report", NOW)), ["Lab report", "Report on the lab"]);
});

test("ties: upcoming first (soonest first), then past (newest first), then no date", () => {
  const entries = [
    { title: "Quiz A", date: iso(-3) },
    { title: "Quiz B" },
    { title: "Quiz C", date: iso(5) },
    { title: "Quiz D", date: iso(1) },
    { title: "Quiz E", date: iso(-1) },
  ];
  assert.deepEqual(titles(rankEntries(entries, "quiz", NOW)), ["Quiz D", "Quiz C", "Quiz E", "Quiz A", "Quiz B"]);
  assert.ok(byWhen({ date: iso(1) }, { date: iso(-1) }, NOW) < 0);
});

test("boost nudges an entry (Done work goes lower)", () => {
  const entries = [
    { title: "Essay", date: iso(1), boost: -3 },
    { title: "Essay", date: iso(2) },
  ];
  const ranked = rankEntries(entries, "essay", NOW);
  assert.equal(ranked[0].date, iso(2));
  assert.equal(ranked[0].score, 30 + 10);
  assert.equal(ranked[1].score, 30 + 10 - 3);
});

test("highlight marks matching parts and keeps the original text", () => {
  assert.deepEqual(highlight("Lab Report", "rep"), [
    { text: "Lab ", match: false },
    { text: "Rep", match: true },
    { text: "ort", match: false },
  ]);
  // Accented letters are matched and kept as written.
  assert.deepEqual(highlight("Résumé tips", "resume"), [
    { text: "Résumé", match: true },
    { text: " tips", match: false },
  ]);
  // Decomposed accents (e + combining mark) stay with their letter.
  assert.deepEqual(highlight("Café night", "cafe"), [
    { text: "Café", match: true },
    { text: " night", match: false },
  ]);
  assert.deepEqual(highlight("Quiz", ""), [{ text: "Quiz", match: false }]);
  assert.deepEqual(highlight("", "quiz"), []);
  // Overlapping words merge into one mark.
  assert.deepEqual(highlight("labs", "lab abs"), [{ text: "labs", match: true }]);
});

test("snippet shows text around the first match", () => {
  const text = "Hello class. Reminder that the final lab report is due Friday at noon in the dropbox.";
  const s = snippet(text, "report", 40);
  assert.ok(s.includes("report"));
  assert.ok(s.startsWith("…"));
  assert.ok(s.endsWith("…"));
  assert.equal(snippet(text, "exam"), "");
  assert.equal(snippet("Short note", "note"), "Short note");
});

test("nextDue: upcoming, not done, soonest first, at most 5", () => {
  const items = [
    { key: "a", dueAt: iso(-1) },
    { key: "b", dueAt: iso(3) },
    { key: "c", dueAt: iso(1) },
    { key: "d", dueAt: null },
    { key: "e", dueAt: iso(2) },
    ...[4, 5, 6, 7].map((d) => ({ key: `x${d}`, dueAt: iso(d) })),
  ];
  const done = new Set(["e"]);
  assert.deepEqual(
    nextDue(items, NOW, (i) => done.has(i.key)).map((i) => i.key),
    ["c", "b", "x4", "x5", "x6"]
  );
});

test("newestAnnouncements: newest first, at most 3", () => {
  const list = [
    { id: 1, postedAt: iso(-5) },
    { id: 2, postedAt: iso(-1) },
    { id: 3, postedAt: null },
    { id: 4, postedAt: iso(-2) },
    { id: 5, postedAt: iso(-9) },
  ];
  assert.deepEqual(newestAnnouncements(list).map((a) => a.id), [2, 4, 1]);
});

test("fileSearchTerm picks the longest word of 2+ letters", () => {
  assert.equal(fileSearchTerm("lab syllabus"), "syllabus");
  assert.equal(fileSearchTerm("a"), "");
  assert.equal(fileSearchTerm("  (hw) "), "hw");
  assert.equal(fileSearchTerm(""), "");
});
