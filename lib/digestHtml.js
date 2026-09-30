// The morning email's content and HTML ("Banner" design). Pure: no imports, no settings, no
// sending, so tests and previews can call it with sample data. lib/digest.js passes in the
// real settings and does the sending.
//
// Email clients are picky, so the layout is tables with inline styles (the light look).
// Dark mode is layered on top with classes, because every inbox does it differently:
// - Apple Mail, iOS Mail, Outlook for Mac/iOS honor @media (prefers-color-scheme: dark).
// - Outlook on the web / Outlook.com ignore that and recolor the email themselves, tagging
//   each element they changed with data-ogsc (text) or data-ogsb (background). Rules keyed on
//   those attributes put our own dark palette back instead of its muddy guesses.
// - Gmail and Outlook desktop mostly show the light version, which is fine as is.
// Each of those rule sets lives in its own <style> block: a client that dislikes one block
// (Gmail drops a whole block it can't parse) still keeps the others.
// Fonts: Bricolage/Figtree load only in some clients (Apple Mail); everywhere else the stack
// falls back to Segoe UI / system fonts, so no weight above 700 (heavier looks crude there).

const DAY = 24 * 60 * 60 * 1000;

const STACK = "'Segoe UI',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif";
const SANS = `Figtree,${STACK}`;
const DISPLAY = `'Bricolage Grotesque',${STACK}`;

// Light (inline) and dark (class) palettes. Dark comes from the app's Confetti Grid dark theme.
const LIGHT = {
  page: "#E9E6DF",
  card: "#FFFFFF",
  tile: "#FFFFFF",
  pill: "#FFFFFF",
  line: "#F1EDE5",
  ink: "#1B1A2E",
  body: "#4A4760",
  muted: "#6B677D",
};
const DARK = {
  page: "#14131F",
  card: "#1E1D2E",
  tile: "#292839",
  pill: "#14131F",
  line: "#34324A",
  ink: "#F2F0FA",
  body: "#C9C6DB",
  muted: "#9894B0",
};
const BRAND = "#3355FF"; // the banner and button stay brand blue in both themes
const BRAND_EDGE = "#2139C9";
const ON_BRAND_SOFT = "#E6EBFF";
const NO_CLASS = "#8A879C";

// Course fills (lib/palette.js) and the light text shade used for each in dark mode.
const DARK_TEXT = {
  "7C5CFA": "#C4B5FF", // grape
  FF7A2F: "#FFB085", // tangerine
  "13A3B5": "#6FDBE8", // lagoon
  EF4F8C: "#FF9CC2", // bubblegum
  "2F6BFF": "#9DBBFF", // cobalt
  "6DBE2E": "#A7E07A", // lime
  FFB020: "#FFD37A", // sun
  E5484D: "#FF9C9F", // coral
  "8A879C": "#C9C6DB", // no class color
};
const CONFETTI = ["#7C5CFA", "#FF7A2F", "#13A3B5", "#EF4F8C", "#2F6BFF", "#6DBE2E"];

// One look per section: label/pill text (light, dark), dot fill, row tint (light, dark).
const TONES = {
  overdue: { key: "overdue", text: "#B4232A", darkText: "#FF9C9F", dot: "#E5484D", tint: "#FFF1F1", darkTint: "#3A1718" },
  today: { key: "today", text: "#8A5A00", darkText: "#FFD37A", dot: "#FFB020", tint: "#FFF8EC", darkTint: "#3A2E10" },
  tomorrow: { key: "tomorrow", text: "#0E6F7C", darkText: "#6FDBE8", dot: "#13A3B5", tint: "#EEF8F9", darkTint: "#0F3238" },
  week: { key: "week", text: "#2A45D6", darkText: "#9DBBFF", dot: "#2F6BFF", tint: "#F4F6FF", darkTint: "#232B55" },
  news: { key: "news", text: "#5B3FD6", darkText: "#C4B5FF", dot: "#7C5CFA" },
  clear: { key: "clear", tint: "#F2FAEC", darkTint: "#1D3318" },
};
const ROW_TINTS = Object.values(TONES).filter((t) => t.tint);

const TYPE_LABELS = { quiz: "Quiz", discussion_topic: "Discussion", planner_note: "Note", wiki_page: "Page" };

export function escapeHtml(s = "") {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only real web links go into href; anything else (javascript:, blank) becomes no link.
function safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// ---- color math (for class colors the user picked, which may be outside the palette) ----

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || "");
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (parts) => `#${parts.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (hex, target, amount) => toHex(rgb(hex).map((v, i) => v + (target[i] - v) * amount));
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const worst = (color, backgrounds) => Math.min(...backgrounds.map((bg) => contrast(color, bg)));

// Class color as small text in light mode: darkened until it reads on every row tint.
function lightText(fill) {
  const bgs = [LIGHT.card, ...ROW_TINTS.map((t) => t.tint)];
  let amount = 0.3;
  let c = mix(fill, [0, 0, 0], amount);
  while (worst(c, bgs) < 4.6 && amount < 0.9) c = mix(fill, [0, 0, 0], (amount += 0.04));
  return c;
}

// Class color as small text in dark mode: the palette's light tint, or lightened to match.
function darkText(fill) {
  const known = DARK_TEXT[fill.slice(1).toUpperCase()];
  if (known) return known;
  const bgs = [DARK.card, ...ROW_TINTS.map((t) => t.darkTint)];
  let amount = 0.35;
  let c = mix(fill, [255, 255, 255], amount);
  while (worst(c, bgs) < 4.6 && amount < 0.95) c = mix(fill, [255, 255, 255], (amount += 0.05));
  return c;
}

const hexKey = (c) => c.slice(1).toUpperCase();

// ---- dates ----

function isDone(item) {
  if (item.override) return item.override.done;
  return Boolean(item.submissions?.submitted);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatters(timeZone) {
  const opt = (o) => (timeZone ? { timeZone, ...o } : o);
  return {
    dayKey: (d) => new Intl.DateTimeFormat("en-CA", opt({})).format(new Date(d)),
    time: (d) => new Date(d).toLocaleTimeString("en-US", opt({ hour: "numeric", minute: "2-digit" })),
    weekdayTime: (d) =>
      `${new Date(d).toLocaleDateString("en-US", opt({ weekday: "short" }))} ${new Date(d).toLocaleTimeString(
        "en-US",
        opt({ hour: "numeric", minute: "2-digit" })
      )}`,
    shortDate: (d) => new Date(d).toLocaleDateString("en-US", opt({ month: "short", day: "numeric" })),
    longDate: (d) => new Date(d).toLocaleDateString("en-US", opt({ weekday: "long", month: "long", day: "numeric" })),
  };
}

// "07:00" -> "7:00 AM"
function clockLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

// Splits the board into the email's sections. Same rules the email has always used.
export function digestSections({ courses = [], items = [], announcements = [] }, { now = Date.now(), timeZone } = {}) {
  const f = formatters(timeZone);
  const today = f.dayKey(now);
  const tomorrow = f.dayKey(now + DAY);
  const weekEnd = now + 7 * DAY;
  const t = (i) => new Date(i.dueAt).getTime();
  const byDue = (a, b) => t(a) - t(b);

  const open = items.filter((i) => !isDone(i) && i.dueAt);
  return {
    overdue: open.filter((i) => t(i) < now).sort(byDue),
    dueToday: open.filter((i) => t(i) >= now && f.dayKey(i.dueAt) === today).sort(byDue),
    dueTomorrow: open.filter((i) => f.dayKey(i.dueAt) === tomorrow).sort(byDue),
    laterThisWeek: open.filter((i) => f.dayKey(i.dueAt) > tomorrow && t(i) <= weekEnd).sort(byDue),
    freshNews: announcements.filter(
      (a) => !a.read && a.postedAt && now - new Date(a.postedAt).getTime() < 36 * 60 * 60 * 1000
    ),
    courses,
  };
}

export function digestSubject({ overdue, dueToday, dueTomorrow }) {
  const count = dueToday.length + dueTomorrow.length;
  return count
    ? `${count} due today/tomorrow${overdue.length ? `, ${overdue.length} overdue` : ""}`
    : overdue.length
    ? `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`
    : "Your school day: nothing due soon";
}

// ---- dark-mode stylesheet ----

// Collects every color the email used, so the dark rules cover exactly those.
function darkRegistry() {
  const text = new Map(); // class suffix -> dark text color
  const fills = new Set(); // vivid fills that must stay vivid (dots, confetti)
  return {
    // Text in a class/section color: light shade inline, class for the dark shade.
    text(key, light, dark) {
      text.set(key, dark);
      return { cls: `em-t-${key}`, color: light };
    },
    fill(color) {
      fills.add(hexKey(color));
      return `em-f-${hexKey(color)}`;
    },
    css() {
      // [text rules, background rules, border rules] as {selector: declarations}
      const t = {
        "em-ink": DARK.ink,
        "em-body": DARK.body,
        "em-muted": DARK.muted,
        "em-on-brand": "#FFFFFF",
        "em-on-brand-soft": ON_BRAND_SOFT,
      };
      for (const [k, v] of text) t[`em-t-${k}`] = v;
      const b = {
        "em-page": DARK.page,
        "em-card": DARK.card,
        "em-tile": DARK.tile,
        "em-pill": DARK.pill,
        "em-brand": BRAND,
      };
      for (const tone of ROW_TINTS) b[`em-row-${tone.key}`] = tone.darkTint;
      for (const f of fills) b[`em-f-${f}`] = `#${f}`;
      return { t, b, borders: { "em-line": DARK.line } };
    },
  };
}

function darkStyles(reg) {
  const { t, b, borders } = reg.css();
  const list = (obj, fn) => Object.entries(obj).map(([cls, v]) => fn(cls, v));

  // Apple Mail, iOS Mail, Outlook for Mac/iOS
  const media = [
    ...list(b, (c, v) => `    .${c} { background-color:${v} !important; }`),
    ...list(t, (c, v) => `    .${c}, .${c} a { color:${v} !important; }`),
    ...list(borders, (c, v) => `    .${c} { border-color:${v} !important; }`),
  ].join("\n");

  // Outlook on the web / Outlook.com: the attribute may sit on the element or an ancestor.
  const ogsc = list(t, (c, v) => `  [data-ogsc] .${c}, .${c}[data-ogsc] { color:${v} !important; }`);
  const ogsb = list(b, (c, v) => `  [data-ogsb] .${c}, .${c}[data-ogsb] { background-color:${v} !important; }`);
  const ogsbLines = list(borders, (c, v) => `  [data-ogsb] .${c}, [data-ogsc] .${c} { border-color:${v} !important; }`);

  return `<style>
  @media (prefers-color-scheme: dark) {
${media}
  }
</style>
<style>
${[...ogsb, ...ogsbLines, ...ogsc].join("\n")}
</style>`;
}

// ---- pieces ----

function dot(reg, color, size = 10) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"><tr><td width="${size}" height="${size}" bgcolor="${color}" class="${reg.fill(color)}" style="width:${size}px;height:${size}px;border-radius:99px;background-color:${color};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
}

function sectionLabel(reg, text, tone) {
  const t = reg.text(tone.key, tone.text, tone.darkText);
  return `<tr><td style="padding:22px 0 8px">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td valign="middle" style="padding-right:8px">${dot(reg, tone.dot, 8)}</td>
    <td valign="middle" class="${t.cls}" style="font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${t.color}">${escapeHtml(text)}</td>
  </tr></table></td></tr>`;
}

function classColor(course) {
  return isHex(course?.color) ? course.color.toUpperCase() : NO_CLASS;
}

function taskRow({ reg, item, course, tone, when }) {
  const color = classColor(course);
  const cls = reg.text(hexKey(color), lightText(color), darkText(color));
  const pill = reg.text(tone.key, tone.text, tone.darkText);
  const className = course?.name || item.courseName || "";
  const bits = [className, TYPE_LABELS[item.type], item.points > 0 ? `${item.points} pts` : ""].filter(Boolean);
  const url = safeUrl(item.url);
  const title = escapeHtml(item.title || "Untitled");
  const titleHtml = url
    ? `<a href="${escapeHtml(url)}" class="em-ink" style="color:${LIGHT.ink};text-decoration:none">${title}</a>`
    : title;
  return `<tr><td style="padding:0 0 8px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${tone.tint}" class="em-row-${tone.key}" style="border-collapse:separate;background-color:${tone.tint};border-radius:14px">
    <tr>
      <td width="10" valign="middle" style="padding:12px 0 12px 14px;width:10px">${dot(reg, color)}</td>
      <td valign="middle" style="padding:12px 10px 12px 12px">
        <div class="em-ink" style="font-family:${DISPLAY};font-size:16px;line-height:21px;font-weight:700;color:${LIGHT.ink}">${titleHtml}</div>
        ${bits.length ? `<div class="${cls.cls}" style="font-family:${SANS};font-size:12px;line-height:17px;font-weight:600;color:${cls.color};margin-top:2px">${escapeHtml(bits.join(" · "))}</div>` : ""}
      </td>
      <td valign="middle" align="right" style="padding:12px 14px 12px 0;white-space:nowrap">
        <span class="em-pill ${pill.cls}" style="display:inline-block;padding:5px 10px;border-radius:999px;background-color:${LIGHT.pill};font-family:${SANS};font-size:13px;line-height:17px;font-weight:700;color:${pill.color};white-space:nowrap">${escapeHtml(when)}</span>
      </td>
    </tr>
  </table></td></tr>`;
}

function newsRow({ reg, a, course, last }) {
  const color = classColor(course);
  const url = safeUrl(a.url);
  const title = escapeHtml(a.title || "Announcement");
  const titleHtml = url
    ? `<a href="${escapeHtml(url)}" class="em-ink" style="color:${LIGHT.ink};text-decoration:none">${title}</a>`
    : title;
  const detail = [course?.name, (a.preview || "").slice(0, 140)].filter(Boolean).join(" · ");
  return `<tr><td class="em-line" style="padding:10px 4px;${last ? "" : `border-bottom:1px solid ${LIGHT.line};`}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
    <td width="10" valign="top" style="padding-top:5px;width:10px">${dot(reg, color)}</td>
    <td valign="top" style="padding-left:12px">
      <div class="em-ink" style="font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;color:${LIGHT.ink}">${titleHtml}</div>
      ${detail ? `<div class="em-body" style="font-family:${SANS};font-size:13px;line-height:19px;color:${LIGHT.body};margin-top:2px">${escapeHtml(detail)}</div>` : ""}
    </td>
  </tr></table></td></tr>`;
}

function statTile(reg, value, label, key, light, dark) {
  const t = reg.text(key, light, dark);
  return `<td width="33%" valign="top" style="padding:0 5px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${LIGHT.tile}" class="em-tile" style="border-collapse:separate;background-color:${LIGHT.tile};border-radius:14px">
      <tr><td style="padding:12px 14px">
        <div class="${t.cls}" style="font-family:${DISPLAY};font-size:26px;line-height:30px;font-weight:700;color:${t.color}">${value}</div>
        <div class="em-muted" style="font-family:${SANS};font-size:12px;line-height:16px;font-weight:600;color:${LIGHT.muted}">${label}</div>
      </td></tr>
    </table></td>`;
}

function confettiBar(reg, colors, height = 5) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"><tr>${colors
    .map(
      (c, i) =>
        `${i ? `<td width="5" style="width:5px;font-size:0;line-height:0">&nbsp;</td>` : ""}<td height="${height}" bgcolor="${c}" class="${reg.fill(c)}" style="height:${height}px;background-color:${c};border-radius:99px;font-size:0;line-height:0">&nbsp;</td>`
    )
    .join("")}</tr></table>`;
}

function confettiCluster(reg) {
  const pieces = [
    ["#FF7A2F", 26, 14, 5],
    ["#FFB020", 14, 14, 99],
    ["#EF4F8C", 22, 14, 5],
    ["#6DBE2E", 14, 14, 5],
  ];
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="right" style="border-collapse:separate"><tr>${pieces
    .map(
      ([c, w, h, r], i) =>
        `<td valign="${i % 2 ? "bottom" : "top"}" style="padding-left:6px"><div class="${reg.fill(c)}" style="width:${w}px;height:${h}px;border-radius:${r}px;background-color:${c};font-size:0;line-height:0">&nbsp;</div></td>`
    )
    .join("")}</tr></table>`;
}

// ---- the whole email ----

// data: { courses, items, announcements } from lib/loadDashboard.js
// options: { now, timeZone, canvasUrl, sendTime ("HH:MM"), sendDays ("daily" | "weekdays") }
export function buildDigestHtml(data, options = {}) {
  const { now = Date.now(), timeZone, canvasUrl, sendTime, sendDays } = options;
  const f = formatters(timeZone);
  const s = digestSections(data, { now, timeZone });
  const course = Object.fromEntries((data.courses || []).map((c) => [c.id, c]));
  const reg = darkRegistry();

  const count = s.dueToday.length + s.dueTomorrow.length;
  const weekCount = count + s.laterThisWeek.length;
  const headline = count ? `${plural(count, "thing")} due today and tomorrow` : "Nothing due today or tomorrow";
  const subject = digestSubject(s);

  // Shown by the inbox next to the subject, then hidden.
  const first = s.dueToday[0] || s.dueTomorrow[0];
  const preheader = [
    first ? `${first.title} due ${s.dueToday[0] ? "today" : "tomorrow"} ${f.time(first.dueAt)}` : "",
    weekCount ? `${weekCount} this week` : "Nothing due in the next 7 days",
    s.overdue.length ? `${s.overdue.length} overdue` : "",
    s.freshNews.length ? plural(s.freshNews.length, "new announcement") : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const task = (tone, when) => (item) => taskRow({ reg, item, course: course[item.courseId], tone, when: when(item) });
  const block = (label, tone, rows) => (rows.length ? sectionLabel(reg, label, tone) + rows.join("") : "");

  const nothingAtAll = !s.overdue.length && !weekCount;
  const sections = [
    block("Overdue", TONES.overdue, s.overdue.map(task(TONES.overdue, (i) => `${f.shortDate(i.dueAt)}, ${f.time(i.dueAt)}`))),
    block("Due today", TONES.today, s.dueToday.map(task(TONES.today, (i) => f.time(i.dueAt)))),
    block("Due tomorrow", TONES.tomorrow, s.dueTomorrow.map(task(TONES.tomorrow, (i) => f.time(i.dueAt)))),
    block("Later this week", TONES.week, s.laterThisWeek.map(task(TONES.week, (i) => f.weekdayTime(i.dueAt)))),
    nothingAtAll
      ? `<tr><td style="padding:22px 0 4px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${TONES.clear.tint}" class="em-row-clear" style="border-collapse:separate;background-color:${TONES.clear.tint};border-radius:14px"><tr><td style="padding:16px 18px">
        <div class="em-ink" style="font-family:${DISPLAY};font-size:17px;line-height:22px;font-weight:700;color:${LIGHT.ink}">You're all caught up</div>
        <div class="em-body" style="font-family:${SANS};font-size:13px;line-height:19px;color:${LIGHT.body};margin-top:2px">Nothing is due in the next 7 days and nothing is overdue.</div>
      </td></tr></table></td></tr>`
      : "",
    s.freshNews.length
      ? sectionLabel(reg, "New announcements", TONES.news) +
        s.freshNews.map((a, i) => newsRow({ reg, a, course: course[a.courseId], last: i === s.freshNews.length - 1 })).join("")
      : "",
  ].join("");

  const canvas = safeUrl(canvasUrl);
  const button = canvas
    ? `<tr><td style="padding:22px 0 6px">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"><tr>
      <td bgcolor="${BRAND}" class="em-brand" style="background-color:${BRAND};border-radius:12px;border-bottom:3px solid ${BRAND_EDGE}">
        <a href="${escapeHtml(canvas)}" class="em-on-brand" style="display:inline-block;padding:12px 20px;font-family:${SANS};font-size:14px;line-height:18px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px">Open Canvas</a>
      </td></tr></table></td></tr>`
    : "";

  const when = clockLabel(sendTime);
  const footer = `Sent by School Dashboard on your PC${when ? ` at ${when}` : ""}${
    sendDays === "weekdays" ? " on weekdays" : sendDays === "daily" ? " every day" : ""
  }. Change or turn it off in Settings.`;

  const banner = `<tr><td bgcolor="${BRAND}" class="em-brand" style="background-color:${BRAND};border-radius:22px 22px 0 0;padding:26px 18px 20px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td valign="top" style="padding:0 10px">
          <div class="em-on-brand-soft" style="font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${ON_BRAND_SOFT}">Good morning · ${escapeHtml(f.longDate(now))}</div>
        </td>
        <!--[if !mso]><!--><td valign="top" width="110" style="width:110px;padding-right:10px">${confettiCluster(reg)}</td><!--<![endif]-->
      </tr>
      <tr><td colspan="2" style="padding:8px 10px 20px">
        <div class="em-on-brand" style="font-family:${DISPLAY};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.3px;color:#FFFFFF">${escapeHtml(headline)}</div>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      ${statTile(reg, s.dueToday.length, "due today", "stat-today", "#B8490E", "#FFB085")}
      ${statTile(reg, weekCount, "this week", "stat-week", "#2A45D6", "#9DBBFF")}
      ${
        s.overdue.length
          ? statTile(reg, s.overdue.length, "overdue", "stat-late", "#B4232A", "#FF9C9F")
          : statTile(reg, 0, "overdue", "stat-ok", "#13784D", "#8EE3B0")
      }
    </tr></table>
  </td></tr>`;

  const main = `<tr><td class="em-pad" style="padding:6px 24px 8px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      ${sections}
      ${button}
    </table>
  </td></tr>
  <tr><td class="em-pad" style="padding:20px 24px 22px">
    ${confettiBar(reg, CONFETTI)}
    <div class="em-muted" style="font-family:${SANS};font-size:12px;line-height:18px;color:${LIGHT.muted};margin-top:10px">${escapeHtml(footer)}</div>
  </td></tr>`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&amp;family=Figtree:wght@400;600;700&amp;display=swap">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; }
  @media (max-width: 480px) {
    .em-pad { padding-left:16px !important; padding-right:16px !important; }
  }
</style>
${darkStyles(reg)}
<!--[if mso]><style>body, table, td, div, span, a { font-family:'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
</head>
<body class="em-page" style="margin:0;padding:0;background-color:${LIGHT.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${LIGHT.page}">${escapeHtml(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${LIGHT.page}" class="em-page" style="background-color:${LIGHT.page}">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${LIGHT.card}" class="em-card" style="width:100%;max-width:600px;background-color:${LIGHT.card};border-radius:22px;border-collapse:separate;overflow:hidden">
  ${banner}
  ${main}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, preheader };
}
