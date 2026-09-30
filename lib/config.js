import fs from "fs";
import { dataFile } from "./dataDir";
import { canEncrypt, isEncrypted, protectFields, unprotectFields } from "./secrets";
import { calendarKind, normalShow } from "./calendarKind";

// Your Canvas connection and optional integrations, entered on the setup screen and saved in
// dashboard-config.json (see lib/dataDir.js). Anything not saved there falls back to .env.local.
// This file only runs on the server, so tokens and keys never reach the browser.
const FILE = dataFile("dashboard-config.json");

const FIELDS = {
  canvasBaseUrl: "CANVAS_BASE_URL",
  canvasToken: "CANVAS_TOKEN",
  calendarUrls: "GOOGLE_CALENDAR_ICS_URL", // secret iCal links (Google, Outlook, ...), comma-separated
  calendarShow: "CALENDAR_SHOW", // per link, same order: "classes" | "all"
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

// Secrets are encrypted in the file (lib/secrets.js). Decrypting takes a moment, so the
// decrypted settings are kept in memory until the file changes.
const cache = (globalThis.__dashboardConfigCache ??= { stamp: null, saved: {} });

function fileStamp() {
  try {
    const stat = fs.statSync(FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

function writeRaw(obj) {
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

function readFile() {
  const stamp = fileStamp();
  if (!stamp) return {};
  if (cache.stamp === stamp) return cache.saved;
  let raw;
  try {
    // Notepad and PowerShell can add an invisible byte-order mark; JSON.parse rejects it.
    raw = JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
  // Settings saved before encryption existed: encrypt their secrets now.
  if (canEncrypt && SECRET_FIELDS.some((k) => raw[k] && !isEncrypted(raw[k]))) {
    try {
      writeRaw(protectFields(raw, SECRET_FIELDS));
    } catch {
      // Try again next time; the app keeps working meanwhile.
    }
  }
  const saved = unprotectFields(raw, SECRET_FIELDS);
  cache.stamp = fileStamp();
  cache.saved = saved;
  return saved;
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
  let stored;
  try {
    stored = protectFields(clean, SECRET_FIELDS);
  } catch {
    throw new Error("Couldn't encrypt your settings with Windows. Nothing was saved; try again.");
  }
  writeRaw(stored);
  cache.stamp = fileStamp();
  cache.saved = clean;
}

// What the setup screen is allowed to see.
export function publicConfig() {
  const c = getConfig();
  return {
    canvasBaseUrl: c.canvasBaseUrl,
    tokenEnding: c.canvasToken ? c.canvasToken.slice(-4) : "",
    calendarCount: calendarList(c).length,
    // Which service each link is from and what it shows, never the link itself.
    calendars: calendarList(c).map(({ url, show }) => ({ kind: calendarKind(url), show })),
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

// The linked calendars with what each one shows on the week strip (server only: has the links).
export function calendarList(config = getConfig()) {
  const urls = config.calendarUrls.split(",").map((u) => u.trim()).filter(Boolean);
  const show = config.calendarShow.split(",");
  return urls.map((url, i) => ({ url, show: normalShow(show[i]) }));
}
