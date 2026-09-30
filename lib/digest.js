import nodemailer from "nodemailer";
import { getConfig } from "./config";
import { buildDigestHtml } from "./digestHtml";

// Builds and sends the morning summary email, through your own Gmail (with an app password)
// or through Resend.
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

// The email itself is built in lib/digestHtml.js (no settings or sending there, so tests and
// previews can call it with sample data).
export function buildDigest({ courses, items, announcements }) {
  const { timezone, canvasBaseUrl, sendTime, sendDays } = getConfig();
  const { subject, html } = buildDigestHtml(
    { courses, items, announcements },
    { now: Date.now(), timeZone: timezone, canvasUrl: canvasBaseUrl, sendTime, sendDays }
  );
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
