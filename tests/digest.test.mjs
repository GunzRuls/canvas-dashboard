// Tests for lib/digestHtml.js (the morning email). Builds HTML only; nothing is sent.
// Times are fixed: Wednesday, September 30, 2026, 7:00 AM in New York.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { buildDigestHtml, escapeHtml, firstNameOf } from "../lib/digestHtml.js";

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

// ---- Note style ("Good morning, Joel.") ----

const note = (data, options = {}) => build(data, { style: "note", ...options });
// The summary paragraph as plain text (tags stripped, entities kept).
const lede = (html) => html.match(/<p class="em-body em-lede"[^>]*>([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "");
const sentences = (text) => text.split(/(?<=\.) (?=[A-Z0-9])/);

test("note: today sentence has 0 / 1 / many variants", () => {
  assert.equal(lede(note({}).html), "Nothing is due today. Nothing is due this week. Nothing is overdue.");
  assert.equal(
    lede(note({ items: [item("Quiz 2", at(9))] }).html),
    "You have 1 thing due today: Quiz 2 at 4:00 PM. Nothing else is due this week. Nothing is overdue."
  );
  const three = lede(note({ items: [item("C", at(12)), item("A", at(3)), item("B", at(9))] }).html);
  assert.match(three, /^You have 3 things due today, starting with A at 10:00 AM\./);
});

test("note: next-up sentence says tomorrow or the weekday", () => {
  const monday = lede(note({ items: [item("Quiz 2", at(9)), item("Team Contract", at(5 * 24 + 10), { courseId: 2 })] }).html);
  assert.match(monday, /Next up is Team Contract on Monday\./);
  const tomorrow = lede(note({ items: [item("Reading", at(26)), item("Team Contract", at(5 * 24))] }).html);
  assert.match(tomorrow, /^Nothing is due today\. Next up is Reading tomorrow\./);
});

test("note: overdue sentence has 0 / 1 / many variants, max three sentences", () => {
  assert.match(lede(note({ items: [item("Quiz 2", at(9))] }).html), / Nothing is overdue\.$/);
  assert.match(lede(note({ items: [item("Late", at(-5))] }).html), / 1 thing is overdue\.$/);
  assert.match(lede(note({ items: [item("A", at(-5)), item("B", at(-50))] }).html), / 2 things are overdue\.$/);
  for (const data of [{}, { items: [item("A", at(-5)), item("B", at(3)), item("C", at(4)), item("D", at(30))] }]) {
    assert.equal(sentences(lede(note(data).html)).length, 3);
  }
});

test("note: long titles are shortened in the summary chip, not in the list", () => {
  const long = "Quiz 2- Requires Respondus LockDown Browser for the whole class";
  const { html } = note({ items: [item(long, at(9))] });
  const chip = lede(html).match(/today: (.*) at /)[1];
  assert.ok(chip.length <= 40, chip);
  assert.ok(chip.endsWith("…"));
  assert.match(html, new RegExp(`>${long}<`));
});

test("note: first name greeting is optional and escaped", () => {
  assert.match(note({}, { firstName: "Joel" }).html, />Good morning, Joel\.</);
  assert.match(note({}).html, />Good morning\.</);
  assert.match(note({}, { firstName: "  " }).html, />Good morning\.</);
  const evil = note({}, { firstName: `<img src=x onerror=alert(1)>` }).html;
  assert.doesNotMatch(evil, /<img/);
  assert.match(evil, /Good morning, &lt;img src=x onerror=alert\(1\)&gt;\./);
  assert.equal(firstNameOf({ shortName: "Joel Figueroa", name: "Joel A. Figueroa" }), "Joel");
  assert.equal(firstNameOf({ name: "Jo Smith" }), "Jo");
  assert.equal(firstNameOf(null), "");
  assert.equal(firstNameOf({ shortName: "" }), "");
});

test("note: plate lists overdue, today, then the week, each once; empty state", () => {
  const { html } = note({
    items: [item("Team", at(5 * 24)), item("Quiz 2", at(9)), item("Reading", at(26)), item("Late lab", at(-30))],
  });
  const plate = html.slice(html.indexOf(">On your plate<"));
  const titles = ["Late lab", "Quiz 2", "Reading", "Team"];
  const order = titles.map((t) => plate.indexOf(`>${t}<`));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  for (const t of titles) assert.equal(plate.split(`>${t}<`).length, 2, t);
  for (const label of ["Overdue", "Today", "Tomorrow", "Mon, Oct 5", "Tue, Sep 29"]) assert.match(plate, new RegExp(`>${label}<`));
  assert.doesNotMatch(html, /Nothing due this week/);
  assert.match(note({}).html, />Nothing due this week\.</);
  // the same item passed twice still shows once
  const twice = item("Twice", at(9), { id: 7 });
  const dup = note({ items: [twice, { ...twice }] }).html;
  assert.equal(dup.slice(dup.indexOf(">On your plate<")).split(">Twice<").length, 2);
});

test("note: newest announcement is the pull quote; the rest are rows", () => {
  const { html } = note({
    courses: [...courses, { id: 3, name: "Algorithm Design & Analysis", code: "COP 4531", color: "#13A3B5" }],
    announcements: [
      { courseId: 1, title: "Older one", postedAt: at(-10), preview: "old", read: false, url: `${CANVAS}/b` },
      { courseId: 3, title: "Midterm Exam", postedAt: at(-2), preview: "x".repeat(400), read: false, url: `${CANVAS}/a` },
      { courseId: 2, title: "Too old", postedAt: at(-40), preview: "", read: false },
    ],
  });
  assert.match(html, /&#8220;/);
  assert.ok(html.indexOf(">Midterm Exam<") < html.indexOf(">Also new<"));
  assert.ok(html.indexOf(">Also new<") < html.indexOf(">Older one<"));
  assert.match(html, />Algorithm Design &amp; Analysis · COP 4531</);
  assert.match(html, new RegExp(`>${"x".repeat(219)}…<`));
  assert.doesNotMatch(html, new RegExp("x".repeat(220)));
  assert.doesNotMatch(html, /Too old/);
  const single = note({ announcements: [{ courseId: 1, title: "Only", postedAt: at(-1), preview: "Hi", read: false }] }).html;
  assert.match(single, />Only</);
  assert.doesNotMatch(single, /Also new/);
  assert.doesNotMatch(note({}).html, /&#8220;/);
});

test("note: one Open Canvas link, Outlook-safe fills, dark hooks, no heavy weights", () => {
  const data = {
    items: [item("Late lab", at(-30)), item("Quiz 2", at(9)), item("Team", at(5 * 24), { courseId: 2 })],
    announcements: [{ courseId: 2, title: "Exam moved", postedAt: at(-3), preview: "See you", read: false }],
  };
  const { html, subject, preheader } = note(data, { firstName: "Joel" });
  assert.equal(html.match(/Open Canvas/g).length, 1);
  assert.match(html, /href="https:\/\/school\.instructure\.com\/"[^>]*>Open Canvas/);
  assert.doesNotMatch(note({}, { canvasUrl: "" }).html, /Open Canvas/);
  assert.doesNotMatch(html, /font-weight:(800|900)/);
  assert.match(html, /font-family:'Bricolage Grotesque','Segoe UI'/);
  assert.match(html, /max-width:720px/);
  const body = html.slice(html.indexOf("<body"));
  assert.doesNotMatch(body.match(/<body[^>]*>/)[0], /bgcolor|background/);
  // Only the dark-ink button and the tiny logo bars are filled; chips and the quote are not.
  const fills = new Set([...body.matchAll(/background-color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()));
  const allowed = new Set(["#1B1A2E", "#EF4F8C", "#2F6BFF", "#7C5CFA", "#6DBE2E", "#13A3B5", "#FF7A2F"]);
  for (const f of fills) assert.ok(allowed.has(f), `unexpected fill ${f}`);
  for (const tag of body.match(/<[a-z0-9]+ [^>]*style="[^"]*(?:^|[;"\s])(?:color|background-color):[^>]*>/g)) {
    if (!/display:none/.test(tag)) assert.match(tag, /class="[^"]*em-/, tag.slice(0, 120));
  }
  // Apple Mail flips the button light; Outlook web keeps it dark with a light outline.
  assert.match(html, /@media \(prefers-color-scheme: dark\)[\s\S]*\.em-cta \{ background-color:#F2F0FA !important; \}/);
  assert.match(html, /\[data-ogsc\] \.em-b-cta \{ border-color:#F2F0FA !important; \}/);
  assert.doesNotMatch(html, /\[data-ogsb\] \.em-cta/);
  // chips keep their class color in dark mode, even though they are links
  assert.match(html, /a\.em-t-FF7A2F \{ color:#FFB085 !important; \}/);
  // same subject and preheader as the other styles
  const banner = build(data);
  assert.equal(subject, banner.subject);
  assert.equal(preheader, banner.preheader);
});

test("note: Canvas text is escaped everywhere", () => {
  const evil = `<script>alert("x")</script>`;
  const { html } = note({
    courses: [{ id: 1, name: `<b>Class</b>`, code: `<i>X</i>`, color: "#FF7A2F" }],
    items: [item(evil, at(3), { url: "javascript:alert(1)" }), item(evil, at(30))],
    announcements: [{ courseId: 1, title: evil, postedAt: at(-1), preview: evil, read: false }],
  });
  assert.doesNotMatch(html, /<script>|<b>Class|<i>X|javascript:/);
});

// ---- MAIL-5: a scheduled send that's late ----
const LATE_SAME_DAY = { late: true, daysAgo: 0, clock: "9:30 AM", weekday: "Wednesday" };

test("late: subject says (sent late), greeting fits the time, and a line says when it was due", () => {
  const evening = Date.parse("2026-09-30T23:00:00Z"); // 7:00 PM EDT
  const { subject, html } = note({ items: [item("Quiz 2", at(30))] }, { now: evening, firstName: "Joel", late: LATE_SAME_DAY });
  assert.match(subject, / \(sent late\)$/);
  assert.match(html, />Good evening, Joel\.</);
  assert.doesNotMatch(html, /Good morning/);
  assert.match(html, /This was due at 9:30 AM but your PC was off or asleep, so it&#39;s coming now\./);
  assert.doesNotMatch(html, /up to date/);
  // the line is muted text with a dark-mode class, like the rest of the email
  assert.match(html, /<p class="em-muted em-late"/);
});

test("late: afternoon greeting; the next day says yesterday; older says the weekday", () => {
  const afternoon = Date.parse("2026-09-30T17:30:00Z"); // 1:30 PM EDT
  assert.match(note({}, { now: afternoon, late: LATE_SAME_DAY }).html, />Good afternoon\.</);
  const morningAfter = Date.parse("2026-10-01T12:00:00Z"); // Thu 8:00 AM EDT
  const yesterday = note({}, { now: morningAfter, late: { late: true, daysAgo: 1, clock: "7:00 AM", weekday: "Wednesday" } }).html;
  assert.match(yesterday, />Good morning\.</);
  assert.match(yesterday, /This was due yesterday at 7:00 AM but your PC was off or asleep, so it&#39;s coming now\. Everything below is up to date\./);
  const monday = note({}, { now: morningAfter, late: { late: true, daysAgo: 3, clock: "7:00 AM", weekday: "Friday" } }).html;
  assert.match(monday, /This was due Friday at 7:00 AM/);
});

test("not late: on-time sends and the Email summary button keep Good morning and the usual subject", () => {
  const evening = Date.parse("2026-09-30T23:00:00Z");
  for (const late of [undefined, null, { late: false, daysAgo: 0, clock: "7:00 AM" }]) {
    const { subject, html } = note({}, { now: evening, late });
    assert.doesNotMatch(subject, /sent late/);
    assert.match(html, />Good morning\.</);
    assert.doesNotMatch(html, /em-late|was due/);
  }
});

test("late: banner and brochure get the subject; banner greets for the time of day", () => {
  const evening = Date.parse("2026-09-30T23:00:00Z");
  const banner = build({}, { now: evening, late: LATE_SAME_DAY });
  const brochure = build({}, { now: evening, late: LATE_SAME_DAY, style: "brochure" });
  assert.match(banner.subject, /\(sent late\)$/);
  assert.equal(banner.subject, brochure.subject);
  assert.match(banner.html, />Good evening · Wednesday, September 30</);
});
