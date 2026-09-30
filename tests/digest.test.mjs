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

test("dark mode: color-scheme meta, text/line tweaks, and Outlook web hooks", () => {
  const { html } = build({
    items: [item("Late lab", at(-30)), item("Quiz 2", at(9))],
    announcements: [{ courseId: 2, title: "Exam moved", postedAt: at(-3), preview: "", read: false }],
  });
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="supported-color-schemes" content="light dark">/);
  assert.match(html, /:root \{ color-scheme: light dark;/);
  // Apple Mail / iOS: light text and dark lines under prefers-color-scheme
  assert.match(html, /@media \(prefers-color-scheme: dark\)[\s\S]*\.em-ink, \.em-ink a \{ color:#F2F0FA !important; \}/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)[\s\S]*\.em-line \{ border-color:#34324A !important; \}/);
  // Outlook.com / Outlook on the web: data-ogsc (text) and data-ogsb hooks
  assert.match(html, /\[data-ogsc\] \.em-ink, \.em-ink\[data-ogsc\] \{ color:#F2F0FA !important; \}/);
  assert.match(html, /\[data-ogsc\] \.em-t-FF7A2F[^{]*\{ color:#FFB085 !important; \}/);
  assert.match(html, /\[data-ogsb\] \.em-brand[^{]*\{ background-color:#3355FF !important; \}/);
  // No dark background rules for page/card/rows any more: nothing is filled there
  assert.doesNotMatch(html, /em-page|em-card|em-tile|em-row-/);
});

test("no page or card background: the email blends into the reading pane", () => {
  const { html } = build({ items: [item("Late lab", at(-30)), item("Quiz 2", at(9))] });
  const bodyTag = html.match(/<body[^>]*>/)[0];
  assert.doesNotMatch(bodyTag, /bgcolor|background/);
  const body = html.slice(html.indexOf("<body"));
  const wrapper = body.match(/<table[^>]*>/)[0];
  assert.doesNotMatch(wrapper, /bgcolor|background/);
  assert.match(body, /max-width:720px/);
  assert.match(body, /<!--\[if mso\]><table role="presentation" width="720"/);
  assert.doesNotMatch(body, /max-width:600px/);
  // Only the brand blue (banner, button) and the small class/section dots are filled.
  const fills = new Set([...body.matchAll(/background-color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()));
  const allowed = new Set(["#3355FF", "#FF7A2F", "#6DBE2E", "#7C5CFA", "#13A3B5", "#EF4F8C", "#2F6BFF", "#FFB020", "#E5484D", "#8A879C"]);
  for (const f of fills) assert.ok(allowed.has(f), `unexpected fill ${f}`);
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

test("banner and brochure styles show the same sections, items and one Open Canvas button", () => {
  const data = {
    items: [item("Late lab", at(-30)), item("Quiz 2", at(9)), item("Reading", at(26)), item("Team", at(5 * 24), { courseId: 2 })],
    announcements: [
      { courseId: 1, title: "Exam moved", postedAt: at(-3), preview: "See you Friday", read: false, url: `${CANVAS}/a` },
      { courseId: 2, title: "Room change", postedAt: at(-4), preview: "", read: false },
      { courseId: 2, title: "Lab open", postedAt: at(-5), preview: "", read: false },
    ],
  };
  const labels = ["Overdue", "Due today", "Due tomorrow", "Later this week", "New announcements"];
  const titles = ["Late lab", "Quiz 2", "Reading", "Team", "Exam moved", "Room change", "Lab open"];
  const banner = build(data);
  const brochure = build(data, { style: "brochure" });
  assert.notEqual(banner.html, brochure.html);
  assert.equal(banner.subject, brochure.subject);
  assert.equal(banner.preheader, brochure.preheader);
  for (const { html } of [banner, brochure]) {
    for (const l of labels) assert.match(html, new RegExp(`>${l}<`));
    for (const t of titles) assert.match(html, new RegExp(`>${t}<`));
    assert.equal(html.match(/Open Canvas/g).length, 1);
    assert.match(html, /href="https:\/\/school\.instructure\.com\/"[^>]*>Open Canvas</);
    assert.match(html, /max-width:720px/);
    assert.doesNotMatch(html.match(/<body[^>]*>/)[0], /bgcolor|background/);
    assert.doesNotMatch(html, /font-weight:(800|900)/);
    // every inline color or background has a class the dark rules can target
    const body = html.slice(html.indexOf("<body"));
    for (const tag of body.match(/<[a-z]+ [^>]*style="[^"]*(?:^|[;"\s])(?:color|background-color):[^>]*>/g)) {
      if (!/display:none/.test(tag)) assert.match(tag, /class="[^"]*em-/, tag.slice(0, 120));
    }
  }
});

test("brochure: quiet day, escaping, and no button without a Canvas address", () => {
  const quiet = build({}, { style: "brochure" });
  assert.match(quiet.html, /all caught up/);
  assert.match(quiet.html, /Nothing due today or tomorrow/);
  const evil = `<script>alert("x")</script>`;
  const { html } = build(
    {
      courses: [{ id: 1, name: `<b>Class</b>`, color: "#FF7A2F" }],
      items: [item(evil, at(3), { url: "javascript:alert(1)" })],
      announcements: [{ courseId: 1, title: evil, postedAt: at(-1), preview: evil, read: false }],
    },
    { style: "brochure", canvasUrl: "" }
  );
  assert.doesNotMatch(html, /<script>|<b>Class|javascript:|Open Canvas/);
});
