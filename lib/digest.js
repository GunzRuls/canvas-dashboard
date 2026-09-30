import nodemailer from "nodemailer";
import { getConfig } from "./config";

// Builds and sends the morning summary email, through your own Gmail (with an app password)
// or through Resend.
const DAY = 24 * 60 * 60 * 1000;

export function digestEnabled(config = getConfig()) {
  const { emailProvider, gmailAddress, gmailAppPassword, resendApiKey, digestToEmail } = config;
  if (!digestToEmail) return false;
  if (emailProvider === "gmail") return Boolean(gmailAddress && gmailAppPassword);
  if (emailProvider === "resend") return Boolean(resendApiKey);
  return false;
}

// Gmail's mail server. Signing in with an app password (not your normal password) is what
// Google allows for apps like this.
export function gmailTransport({ gmailAddress, gmailAppPassword }) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailAddress, pass: gmailAppPassword.replace(/\s+/g, "") },
  });
}

const tz = () => getConfig().timezone;

function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz() }).format(new Date(date));
}

function time(date) {
  return new Date(date).toLocaleTimeString("en-US", { timeZone: tz(), hour: "numeric", minute: "2-digit" });
}

function weekday(date) {
  return new Date(date).toLocaleDateString("en-US", { timeZone: tz(), weekday: "short", month: "short", day: "numeric" });
}

function escape(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isDone(item) {
  if (item.override) return item.override.done;
  return Boolean(item.submissions?.submitted);
}

function row({ color, label, title, url, detail }) {
  const name = url
    ? `<a href="${url}" style="color:#1C1A2E;font-weight:700;text-decoration:none">${escape(title)}</a>`
    : `<span style="font-weight:700">${escape(title)}</span>`;
  return `<tr><td style="border-left:5px solid ${color};padding:8px 12px;background:#ffffff">
    <div style="font-size:12px;font-weight:700;color:${color}">${escape(label)}</div>
    <div style="font-size:15px;margin-top:2px">${name}</div>
    ${detail ? `<div style="font-size:13px;color:#6B6880;margin-top:2px">${escape(detail)}</div>` : ""}
  </td></tr><tr><td style="height:6px"></td></tr>`;
}

function section(title, rows) {
  if (!rows.length) return "";
  return `<h2 style="font-size:17px;margin:24px 0 8px;color:#1C1A2E">${title}</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join("")}</table>`;
}

export function buildDigest({ courses, items, announcements }) {
  const now = Date.now();
  const today = dayKey(now);
  const tomorrow = dayKey(now + DAY);
  const weekEnd = now + 7 * DAY;
  const course = Object.fromEntries(courses.map((c) => [c.id, c]));
  const colorOf = (id) => course[id]?.color || "#8A879C";
  const nameOf = (id, fallback) => course[id]?.name || fallback;

  const open = items.filter((i) => !isDone(i));
  const itemRow = (i, detail) =>
    row({ color: colorOf(i.courseId), label: nameOf(i.courseId, i.courseName), title: i.title, url: i.url, detail });

  const overdue = open.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < now);
  const dueToday = open.filter((i) => i.dueAt && new Date(i.dueAt).getTime() >= now && dayKey(i.dueAt) === today);
  const dueTomorrow = open.filter((i) => i.dueAt && dayKey(i.dueAt) === tomorrow);
  const laterThisWeek = open.filter(
    (i) => i.dueAt && dayKey(i.dueAt) > tomorrow && new Date(i.dueAt).getTime() <= weekEnd
  );
  const freshNews = announcements.filter(
    (a) => !a.read && a.postedAt && now - new Date(a.postedAt).getTime() < 36 * 60 * 60 * 1000
  );

  const dateLine = new Date(now).toLocaleDateString("en-US", { timeZone: tz(), weekday: "long", month: "long", day: "numeric" });
  const count = dueToday.length + dueTomorrow.length;


  const html = `<div style="background:#F1F0F7;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1C1A2E">
    <div style="max-width:600px;margin:0 auto">
      <p style="margin:0;color:#6B6880;font-size:14px">${dateLine}</p>
      <h1 style="margin:4px 0 0;font-size:26px">${
        count ? `${count} thing${count === 1 ? "" : "s"} due today and tomorrow` : "Nothing due today or tomorrow"
      }</h1>
      ${section("Overdue", overdue.map((i) => itemRow(i, `Was due ${weekday(i.dueAt)}, ${time(i.dueAt)}`)))}
      ${section("Due today", dueToday.map((i) => itemRow(i, `Due ${time(i.dueAt)}`)))}
      ${section("Due tomorrow", dueTomorrow.map((i) => itemRow(i, `Due ${time(i.dueAt)}`)))}
      ${section("Later this week", laterThisWeek.map((i) => itemRow(i, `Due ${weekday(i.dueAt)}, ${time(i.dueAt)}`)))}
      ${section(
        "New announcements",
        freshNews.map((a) =>
          row({ color: colorOf(a.courseId), label: nameOf(a.courseId, ""), title: a.title, url: a.url, detail: a.preview.slice(0, 140) })
        )
      )}
    </div></div>`;

  const subject = count
    ? `${count} due today/tomorrow${overdue.length ? `, ${overdue.length} overdue` : ""}`
    : overdue.length
    ? `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`
    : "Your school day: nothing due soon";

  return { subject, html };
}

export async function sendDigest(digest) {
  const config = getConfig();
  const { emailProvider, resendApiKey, digestFromEmail, digestToEmail } = config;

  if (emailProvider === "gmail") {
    try {
      const info = await gmailTransport(config).sendMail({
        from: `School Dashboard <${config.gmailAddress}>`,
        to: digestToEmail,
        subject: digest.subject,
        html: digest.html,
      });
      return { id: info.messageId };
    } catch (error) {
      throw new Error(gmailErrorMessage(error));
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: digestFromEmail || "School Dashboard <onboarding@resend.dev>",
      to: [digestToEmail],
      subject: digest.subject,
      html: digest.html,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Resend returned ${res.status}`);
  return data;
}

// Gmail's errors are technical; say what to do instead.
export function gmailErrorMessage(error) {
  const text = String(error?.response || error?.message || "");
  if (error?.code === "EAUTH" || /535|Username and Password not accepted|BadCredentials/i.test(text)) {
    return "Gmail didn't accept that address and app password. Make a new app password and paste all 16 letters.";
  }
  if (/Application-specific password required|534/i.test(text)) {
    return "Gmail needs an app password here, not your normal password. Follow the steps to create one.";
  }
  if (error?.code === "ECONNECTION" || error?.code === "ETIMEDOUT" || error?.code === "ESOCKET") {
    return "Couldn't reach Gmail. Check your internet connection.";
  }
  return `Gmail didn't send it: ${text.slice(0, 160)}`;
}
