// "Move to another PC" (SET-4): a backup file of your settings, locked with a password you pick.
// Pure helpers (Node's crypto only, no Next imports) so tests can import them. The routes are
// app/api/backup (save) and app/api/backup/restore.
//
// The file is JSON: { format, version, createdAt, kdf, salt, iv, tag, data }. The password is
// stretched with scrypt (slow on purpose, so guessing passwords takes ages) into an AES-256-GCM
// key. GCM also checks the file wasn't changed: a wrong password and an edited file both fail
// the same way, and the error never says which.
import crypto from "node:crypto";
import { promisify } from "node:util";
import { cleanSettings } from "./settingsData.js";

const scrypt = promisify(crypto.scrypt);

export const BACKUP_FORMAT = "school-dashboard-backup";
export const BACKUP_VERSION = 1;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 1024;
// Big enough for any real backup; the restore route refuses anything larger.
export const MAX_BACKUP_BYTES = 256 * 1024;

// Version 1 always uses these. A file asking for other numbers is refused, so a crafted file
// can't make the server spend minutes (or gigabytes) deriving a key.
export const KDF = Object.freeze({ name: "scrypt", N: 2 ** 15, r: 8, p: 1, keyLength: 32 });

// The only config fields a backup holds (the same ones Settings saves).
export const BACKUP_CONFIG_KEYS = [
  "canvasBaseUrl",
  "canvasToken",
  "calendarUrls",
  "calendarShow",
  "emailProvider",
  "gmailAddress",
  "gmailAppPassword",
  "resendApiKey",
  "digestToEmail",
  "digestFromEmail",
  "sendTime",
  "sendDays",
  "timezone",
];

// Friendly errors the routes can show as they are. `code` is "password" or "format".
export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const WRONG_PASSWORD = "That password doesn't open this backup.";
const NOT_A_BACKUP = "That file isn't a School Dashboard backup.";

export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    return `Use a password with at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) return "That password is too long.";
  return "";
}

function pickConfig(config = {}) {
  return Object.fromEntries(BACKUP_CONFIG_KEYS.map((k) => [k, String(config?.[k] ?? "").trim()]));
}

function pickDismissed(dismissed = {}) {
  const list = (v, fn) => (Array.isArray(v) ? v.slice(-1000).map(fn) : []);
  return {
    announcements: list(dismissed?.announcements, Number).filter(Number.isFinite),
    grades: list(dismissed?.grades, String),
  };
}

// What goes in the file: the listed config fields, your class settings, and what you cleared.
// Nothing else, even if the inputs carry more.
export function buildBackupPayload({ config, settings, dismissed }) {
  return {
    config: pickConfig(config),
    settings: cleanSettings(settings || {}),
    dismissed: pickDismissed(dismissed),
  };
}

// The same filter on the way back in, so a hand-made file can't add anything else.
export function cleanBackupPayload(payload) {
  if (!payload || typeof payload !== "object") throw new BackupError("format", NOT_A_BACKUP);
  return buildBackupPayload(payload);
}

// The header fields are bound to the ciphertext, so changing them also breaks the check.
function header(format, version, kdf) {
  return Buffer.from(`${format}|${version}|${kdf.name}|${kdf.N}|${kdf.r}|${kdf.p}|${kdf.keyLength}`);
}

function deriveKey(password, salt) {
  // scrypt needs 128 * N * r bytes (32 MB here); Node's default limit is exactly 32 MB.
  return scrypt(password, salt, KDF.keyLength, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
}

// "2026-10-03" in the given time zone (falls back to UTC).
export function backupDate(now = new Date(), timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function backupFileName(now = new Date(), timeZone) {
  return `school-dashboard-backup-${backupDate(now, timeZone)}.sdbackup`;
}

// Returns the file's contents as an object (JSON.stringify it to save).
export async function encryptBackup(payload, password, now = new Date()) {
  const problem = passwordProblem(password);
  if (problem) throw new BackupError("password", problem);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header(BACKUP_FORMAT, BACKUP_VERSION, KDF));
  const data = Buffer.concat([cipher.update(JSON.stringify(cleanBackupPayload(payload)), "utf8"), cipher.final()]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    kdf: { ...KDF },
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function base64(value, bytes) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new BackupError("format", NOT_A_BACKUP);
  const buf = Buffer.from(value, "base64");
  if (bytes != null && buf.length !== bytes) throw new BackupError("format", NOT_A_BACKUP);
  return buf;
}

// Checks the file's shape and returns its parts. Throws BackupError("format") if it isn't ours.
export function parseBackupFile(input) {
  let file = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_BACKUP_BYTES) throw new BackupError("format", "That file is too big to be a backup.");
    try {
      file = JSON.parse(input.replace(/^﻿/, ""));
    } catch {
      throw new BackupError("format", NOT_A_BACKUP);
    }
  }
  if (!file || typeof file !== "object" || file.format !== BACKUP_FORMAT) throw new BackupError("format", NOT_A_BACKUP);
  if (file.version !== BACKUP_VERSION) {
    throw new BackupError("format", "This backup was made by a newer version of the dashboard. Update this copy first, then try again.");
  }
  const k = file.kdf || {};
  if (k.name !== KDF.name || k.N !== KDF.N || k.r !== KDF.r || k.p !== KDF.p || k.keyLength !== KDF.keyLength) {
    throw new BackupError("format", NOT_A_BACKUP);
  }
  return {
    salt: base64(file.salt, 16),
    iv: base64(file.iv, 12),
    tag: base64(file.tag, 16),
    data: base64(file.data),
    createdAt: typeof file.createdAt === "string" ? file.createdAt : "",
  };
}

// Opens a backup (the file's text or its parsed object). Returns { payload, createdAt }.
export async function decryptBackup(input, password) {
  const parts = parseBackupFile(input);
  if (typeof password !== "string" || !password || password.length > MAX_PASSWORD) {
    throw new BackupError("password", WRONG_PASSWORD);
  }
  const key = await deriveKey(password, parts.salt);
  let text;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, parts.iv);
    decipher.setAAD(header(BACKUP_FORMAT, BACKUP_VERSION, KDF));
    decipher.setAuthTag(parts.tag);
    text = Buffer.concat([decipher.update(parts.data), decipher.final()]).toString("utf8");
  } catch {
    // Wrong password or a changed file: GCM can't tell which, and neither do we.
    throw new BackupError("password", WRONG_PASSWORD);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BackupError("format", NOT_A_BACKUP);
  }
  return { payload: cleanBackupPayload(payload), createdAt: parts.createdAt };
}
