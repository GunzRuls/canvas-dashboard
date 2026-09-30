import fs from "fs";
import { dataFile } from "./dataDir";

// Your Canvas connection and optional integrations, entered on the setup screen and saved in
// dashboard-config.json (see lib/dataDir.js). Anything not saved there falls back to .env.local.
// This file only runs on the server, so tokens and keys never reach the browser.
const FILE = dataFile("dashboard-config.json");

const FIELDS = {
  canvasBaseUrl: "CANVAS_BASE_URL",
  canvasToken: "CANVAS_TOKEN",
  calendarUrls: "GOOGLE_CALENDAR_ICS_URL",
  // Morning email: sent through your own Gmail (an app password) or Resend.
  emailProvider: "DIGEST_PROVIDER", // "gmail" | "resend" | "" (off)
  gmailAddress: "GMAIL_ADDRESS",
  gmailAppPassword: "GMAIL_APP_PASSWORD",
  resendApiKey: "RESEND_API_KEY",
  digestToEmail: "DIGEST_TO_EMAIL",
  digestFromEmail: "DIGEST_FROM_EMAIL",
  sendTime: "DIGEST_TIME", // "HH:MM", the daily Windows task
  sendDays: "DIGEST_DAYS", // "daily" | "weekdays"
  timezone: "DASHBOARD_TIMEZONE",
};

// Never sent to the browser. The setup screen only learns whether they're saved.
export const SECRET_FIELDS = ["canvasToken", "calendarUrls", "resendApiKey", "gmailAppPassword"];

function readFile() {
  try {
    // Notepad and PowerShell can add an invisible byte-order mark; JSON.parse rejects it.
    return JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
}

// Read fresh each time (it's a tiny file) so saved changes apply without restarting.
export function getConfig() {
  const saved = readFile();
  const config = {};
  for (const [key, envName] of Object.entries(FIELDS)) {
    config[key] = String(key in saved ? saved[key] : process.env[envName] || "").trim();
  }
  config.timezone ||= "America/New_York";
  // Settings saved before Gmail was an option only had Resend.
  if (!("emailProvider" in saved) && !process.env.DIGEST_PROVIDER && config.resendApiKey) config.emailProvider = "resend";
  config.sendTime ||= "07:00";
  config.sendDays ||= "weekdays";
  return config;
}

export function isConfigured() {
  const { canvasBaseUrl, canvasToken } = getConfig();
  return Boolean(canvasBaseUrl && canvasToken);
}

export function saveConfig(config) {
  const clean = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, String(config[key] || "").trim()]));
  fs.writeFileSync(FILE, JSON.stringify(clean, null, 2));
}

// What the setup screen is allowed to see.
export function publicConfig() {
  const c = getConfig();
  return {
    canvasBaseUrl: c.canvasBaseUrl,
    tokenEnding: c.canvasToken ? c.canvasToken.slice(-4) : "",
    calendarCount: c.calendarUrls.split(",").filter((u) => u.trim()).length,
    hasResendKey: Boolean(c.resendApiKey),
    emailProvider: c.emailProvider,
    gmailAddress: c.gmailAddress,
    hasGmailPassword: Boolean(c.gmailAppPassword),
    digestToEmail: c.digestToEmail,
    digestFromEmail: c.digestFromEmail,
    sendTime: c.sendTime,
    sendDays: c.sendDays,
    timezone: c.timezone,
  };
}
