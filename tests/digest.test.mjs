// Tests for lib/digestHtml.js (the morning email). Builds HTML only; nothing is sent.
// Times are fixed: Wednesday, September 30, 2026, 7:00 AM in New York.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { buildDigestHtml, escapeHtml } from "../lib/digestHtml.js";

const TZ = "America/New_York";
const NOW = Date.parse("2026-09-30T11:00:00Z"); // 7:00 AM EDT
const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(NOW + hours * HOUR).toISOString();
const CANVAS = "https://school.instructure.com";

const courses = [
  { id: 1, name: "Software Design and Architecture", color: "#FF7A2F" },
  { id: 2, name: "Capstone 1", color: "#6DBE2E" },
];
const item = (title, dueAt, extra = {}) => ({ courseId: 1, title, dueAt, url: `${CANVAS}/x`, submissions: {}, ...extra });

const build = (data, options = {}) =>
  buildDigestHtml(
    { courses, items: [], announcements: [], ...data },
    { now: NOW, timeZone: TZ, canvasUrl: CANVAS, ...options }
  );

test("sections appear only when they have items", () => {
  const { html, subject } = build({
    items: [item("Quiz 2", at(9)), item("Team Contract", at(5 * 24), { courseId: 2 })],
  });
  assert.match(html, /Due today/);
  assert.match(html, /Later this week/);
  assert.doesNotMatch(html, /Overdue</);
  assert.doesNotMatch(html, /Due tomorrow/);
  assert.doesNotMatch(html, /New announcements/);
  assert.doesNotMatch(html, /all caught up/);
  assert.match(html, /1 thing due today and tomorrow/);
  assert.equal(subject, "1 due today/tomorrow");
});

test("overdue, tomorrow and announcements show up; done items don't", () => {
  const { html, subject } = build({
    items: [
      item("Late lab", at(-30)),
      item("Reading", at(26)),
      item("Already submitted", at(5), { submissions: { submitted: true } }),
      item("Marked done", at(6), { override: { done: true } }),
    ],
    announcements: [
      { courseId: 1, title: "Exam moved", postedAt: at(-3), preview: "See you Friday", read: false, url: `${CANVAS}/a` },
      { courseId: 1, title: "Old news", postedAt: at(-72), preview: "", read: false },
      { courseId: 1, title: "Already read", postedAt: at(-2), preview: "", read: true },
    ],
  });
  assert.match(html, /Overdue</);
  assert.match(html, /Due tomorrow/);
  assert.match(html, /New announcements/);
  assert.match(html, /Exam moved/);
  assert.doesNotMatch(html, /Old news|Already read|Already submitted|Marked done/);
  assert.equal(subject, "1 due today/tomorrow, 1 overdue");
});

test("a quiet day shows the caught-up message", () => {
  const { html, subject } = build({});
  assert.match(html, /all caught up/);
  assert.match(html, /Nothing due today or tomorrow/);
  assert.equal(subject, "Your school day: nothing due soon");
});

test("only overdue work gives the overdue subject", () => {
  const { subject } = build({ items: [item("A", at(-5)), item("B", at(-50))] });
  assert.equal(subject, "2 overdue items");
});

test("Canvas and user text is HTML-escaped", () => {
  const evil = `<script>alert("x")</script> & 'more'`;
  const { html } = build({
    courses: [{ id: 1, name: `<b>Class</b>`, color: "#FF7A2F" }],
    items: [item(evil, at(3), { url: `javascript:alert(1)` })],
    announcements: [{ courseId: 1, title: evil, postedAt: at(-1), preview: evil, read: false }],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>Class/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;more&#39;/);
  assert.equal(escapeHtml(`a"b'<>&`), "a&quot;b&#39;&lt;&gt;&amp;");
});

test("one Open Canvas button, pointing at the Canvas address", () => {
  const { html } = build({ items: [item("Quiz 2", at(9))] });
  assert.equal(html.match(/Open Canvas/g).length, 1);
  assert.match(html, /href="https:\/\/school\.instructure\.com\/"[^>]*>Open Canvas</);
});

test("no link back to the app", () => {
  const { html } = build({ items: [item("Quiz 2", at(9))] });
  assert.doesNotMatch(html, /localhost|127\.0\.0\.1|open the app/i);
});

test("no Canvas address means no button", () => {
  const { html } = build({}, { canvasUrl: "" });
  assert.doesNotMatch(html, /Open Canvas/);
});

test("dark mode: color-scheme meta, a real dark palette, and Outlook web overrides", () => {
  const { html } = build({
    items: [item("Late lab", at(-30)), item("Quiz 2", at(9))],
    announcements: [{ courseId: 2, title: "Exam moved", postedAt: at(-3), preview: "", read: false }],
  });
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="supported-color-schemes" content="light dark">/);
  assert.match(html, /:root \{ color-scheme: light dark;/);
  // Apple Mail / iOS: the dark palette under prefers-color-scheme
  assert.match(html, /@media \(prefers-color-scheme: dark\)[\s\S]*\.em-card \{ background-color:#1E1D2E !important; \}/);
  // Outlook.com / Outlook on the web: data-ogsb (backgrounds) and data-ogsc (text)
  assert.match(html, /\[data-ogsb\] \.em-page, \.em-page\[data-ogsb\] \{ background-color:#14131F !important; \}/);
  assert.match(html, /\[data-ogsb\] \.em-row-overdue[^{]*\{ background-color:#3A1718 !important; \}/);
  assert.match(html, /\[data-ogsc\] \.em-ink, \.em-ink\[data-ogsc\] \{ color:#F2F0FA !important; \}/);
  // Class colors: a light tint as text in dark mode, the vivid fill kept for dots
  assert.match(html, /\[data-ogsc\] \.em-t-FF7A2F[^{]*\{ color:#FFB085 !important; \}/);
  assert.match(html, /\[data-ogsb\] \.em-f-FF7A2F[^{]*\{ background-color:#FF7A2F !important; \}/);
  // The banner stays brand blue in both themes
  assert.match(html, /\[data-ogsb\] \.em-brand[^{]*\{ background-color:#3355FF !important; \}/);
});

test("every inline text or background color has a class the dark rules can target", () => {
  const { html } = build({
    items: [item("Late lab", at(-30)), item("Quiz 2", at(9)), item("Reading", at(26)), item("Team", at(5 * 24), { courseId: 2 })],
    announcements: [{ courseId: 1, title: "Exam moved", postedAt: at(-3), preview: "x", read: false }],
  });
  const body = html.slice(html.indexOf("<body"));
  const tags = body.match(/<[a-z]+ [^>]*style="[^"]*(?:^|[;"\s])(?:color|background-color):[^>]*>/g) || [];
  assert.ok(tags.length > 20);
  for (const tag of tags) {
    if (/display:none/.test(tag)) continue; // the hidden preheader
    assert.match(tag, /class="em-/, `missing class: ${tag.slice(0, 120)}`);
  }
});

test("headings stay at weight 700 or lighter with a system-font fallback", () => {
  const { html } = build({ items: [item("Quiz 2", at(9))] });
  assert.doesNotMatch(html, /font-weight:(800|900)/);
  assert.match(html, /font-family:'Bricolage Grotesque','Segoe UI',-apple-system/);
});
