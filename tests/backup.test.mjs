// Tests for lib/backup.js ("Move to another PC"): the file opens with the right password only,
// any change to it is caught, files that aren't ours are refused, and only the listed settings
// ever go in. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBackupPayload,
  encryptBackup,
  decryptBackup,
  parseBackupFile,
  backupFileName,
  passwordProblem,
  BackupError,
  BACKUP_CONFIG_KEYS,
  BACKUP_FORMAT,
  KDF,
} from "../lib/backup.js";

const config = {
  canvasBaseUrl: "https://example.instructure.com",
  canvasToken: "1234~abcdefghijklmnop",
  calendarUrls: "https://calendar.google.com/a.ics,https://outlook.office365.com/b.ics",
  calendarShow: "classes,all",
  emailProvider: "gmail",
  gmailAddress: "me@gmail.com",
  gmailAppPassword: "abcdefghijklmnop",
  resendApiKey: "",
  digestToEmail: "me@school.edu",
  digestFromEmail: "",
  sendTime: "07:30",
  sendDays: "weekdays",
  timezone: "America/New_York",
};
const settings = {
  hidden: [5],
  names: { 1: "Calc" },
  colors: { 1: "#3366ff" },
  attendance: { 1: "https://example.com/checkin" },
  schedule: { 1: { days: [1, 3], start: "09:00", end: "09:50" } },
  goals: { 1: 90 },
};
const dismissed = { announcements: [11, 12], grades: ["7:2026-10-01T00:00:00Z"] };
const PASSWORD = "correct horse battery";

const payload = buildBackupPayload({ config, settings, dismissed });

test("round trip: the right password gives back exactly what went in", async () => {
  const file = await encryptBackup(payload, PASSWORD, new Date("2026-10-03T12:00:00Z"));
  assert.equal(file.format, BACKUP_FORMAT);
  assert.equal(file.version, 1);
  assert.equal(file.createdAt, "2026-10-03T12:00:00.000Z");
  assert.deepEqual(file.kdf, { name: "scrypt", N: 32768, r: 8, p: 1, keyLength: 32 });
  assert.equal(Buffer.from(file.salt, "base64").length, 16);
  assert.equal(Buffer.from(file.iv, "base64").length, 12);
  assert.equal(Buffer.from(file.tag, "base64").length, 16);
  // Nothing readable in the file itself.
  const text = JSON.stringify(file);
  for (const secret of [config.canvasToken, config.gmailAppPassword, "calendar.google.com", "me@gmail.com"]) {
    assert.ok(!text.includes(secret), `file leaks ${secret}`);
  }
  const opened = await decryptBackup(text, PASSWORD);
  assert.deepEqual(opened.payload, payload);
  assert.equal(opened.createdAt, file.createdAt);
});

test("two backups of the same settings use a new salt and IV each time", async () => {
  const a = await encryptBackup(payload, PASSWORD);
  const b = await encryptBackup(payload, PASSWORD);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test("a wrong password fails with the friendly message", async () => {
  const file = await encryptBackup(payload, PASSWORD);
  await assert.rejects(decryptBackup(file, "wrong password!"), (e) => e instanceof BackupError && e.code === "password" && e.message === "That password doesn't open this backup.");
  await assert.rejects(decryptBackup(file, ""), (e) => e.code === "password");
  await assert.rejects(decryptBackup(file, undefined), (e) => e.code === "password");
});

function flip(b64, at = 0) {
  const buf = Buffer.from(b64, "base64");
  buf[at] ^= 1;
  return buf.toString("base64");
}

test("any change to the data, tag, IV or salt is caught (same message as a wrong password)", async () => {
  const file = await encryptBackup(payload, PASSWORD);
  const variants = [
    { ...file, data: flip(file.data) },
    { ...file, data: flip(file.data, 20) },
    { ...file, tag: flip(file.tag) },
    { ...file, iv: flip(file.iv) },
    { ...file, salt: flip(file.salt) },
  ];
  for (const changed of variants) {
    await assert.rejects(decryptBackup(changed, PASSWORD), (e) => e.code === "password" && e.message === "That password doesn't open this backup.");
  }
});

test("files that aren't a version 1 backup are refused before any key is made", async () => {
  const file = await encryptBackup(payload, PASSWORD);
  const bad = [
    "not json",
    "{}",
    JSON.stringify({ ...file, format: "something-else" }),
    JSON.stringify({ ...file, kdf: { ...file.kdf, N: 2 ** 24 } }), // would take ages
    JSON.stringify({ ...file, kdf: { ...file.kdf, name: "pbkdf2" } }),
    JSON.stringify({ ...file, iv: "AAAA" }), // wrong length
    JSON.stringify({ ...file, data: 42 }),
    "x".repeat(300 * 1024),
  ];
  for (const text of bad) {
    assert.throws(() => parseBackupFile(text), (e) => e instanceof BackupError && e.code === "format");
    await assert.rejects(decryptBackup(text, PASSWORD), (e) => e.code === "format");
  }
  assert.throws(() => parseBackupFile(JSON.stringify({ ...file, version: 2 })), /newer version/);
  // A byte-order mark (Notepad) is fine.
  assert.ok(parseBackupFile("﻿" + JSON.stringify(file)));
});

test("the payload holds only the listed fields, whatever else the inputs carry", () => {
  const built = buildBackupPayload({
    config: { ...config, CRON_SECRET: "x", extra: "y", __proto__: { polluted: true } },
    settings: { ...settings, sneaky: "z", attendance: { 2: "javascript:alert(1)" } },
    dismissed: { ...dismissed, other: [1] },
  });
  assert.deepEqual(Object.keys(built).sort(), ["config", "dismissed", "settings"]);
  assert.deepEqual(Object.keys(built.config).sort(), [...BACKUP_CONFIG_KEYS].sort());
  assert.deepEqual(Object.keys(built.settings).sort(), ["attendance", "colors", "goals", "hidden", "names", "schedule"]);
  assert.deepEqual(built.settings.attendance, {}); // the settings rules still apply
  assert.deepEqual(Object.keys(built.dismissed).sort(), ["announcements", "grades"]);
  assert.equal(built.config.canvasToken, config.canvasToken);
  // Missing pieces become empty, not undefined.
  const empty = buildBackupPayload({});
  assert.equal(empty.config.canvasToken, "");
  assert.deepEqual(empty.dismissed, { announcements: [], grades: [] });
});

test("an opened file goes through the same filter (a hand-made payload can't add fields)", async () => {
  const sneaky = { config: { ...config, evil: 1 }, settings, dismissed, more: true };
  const file = await encryptBackup(sneaky, PASSWORD);
  const { payload: opened } = await decryptBackup(file, PASSWORD);
  assert.deepEqual(Object.keys(opened).sort(), ["config", "dismissed", "settings"]);
  assert.ok(!("evil" in opened.config));
});

test("passwords need at least 8 characters, and the file name has the date", async () => {
  assert.match(passwordProblem("short"), /at least 8/);
  assert.match(passwordProblem(undefined), /at least 8/);
  assert.equal(passwordProblem("12345678"), "");
  await assert.rejects(encryptBackup(payload, "short"), (e) => e.code === "password");
  assert.equal(backupFileName(new Date("2026-10-03T02:00:00Z"), "America/New_York"), "school-dashboard-backup-2026-10-02.sdbackup");
  assert.equal(backupFileName(new Date("2026-10-03T12:00:00Z"), "Not/AZone"), "school-dashboard-backup-2026-10-03.sdbackup");
  assert.equal(KDF.N, 2 ** 15);
});
