import fs from "fs/promises";
import { dataFile } from "./dataDir";

// Your class preferences (hidden classes, renamed classes, custom colors) are saved
// in dashboard-settings.json (see lib/dataDir.js).
const FILE = dataFile("dashboard-settings.json");
const EMPTY = { hidden: [], names: {}, colors: {}, attendance: {}, schedule: {} };

export async function readSettings() {
  try {
    const saved = JSON.parse((await fs.readFile(FILE, "utf8")).replace(/^\uFEFF/, ""));
    return {
      hidden: (saved.hidden || []).map(Number),
      names: saved.names || {},
      colors: saved.colors || {},
      attendance: saved.attendance || {},
      schedule: saved.schedule || {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeSettings(settings) {
  const clean = {
    hidden: (settings.hidden || []).map(Number).filter(Boolean),
    names: Object.fromEntries(
      Object.entries(settings.names || {}).filter(([, v]) => typeof v === "string" && v.trim())
    ),
    colors: Object.fromEntries(
      Object.entries(settings.colors || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v))
    ),
    attendance: Object.fromEntries(
      Object.entries(settings.attendance || {}).filter(([, v]) => /^https?:\/\//i.test(String(v).trim()))
    ),
    // Class meeting times you enter for Smart Check in: { days: [1,3], start: "14:00", end: "15:15" }
    schedule: Object.fromEntries(
      Object.entries(settings.schedule || {}).filter(
        ([, v]) =>
          Array.isArray(v?.days) && v.days.length && /^\d{2}:\d{2}$/.test(v.start) && /^\d{2}:\d{2}$/.test(v.end)
      )
    ),
  };
  await fs.writeFile(FILE, JSON.stringify(clean, null, 2));
  return clean;
}

// attendanceLinks: what was found automatically in Canvas. A link you paste in Manage classes wins.
export function applySettings(courses, settings, attendanceLinks = {}) {
  return courses.map((c) => ({
    ...c,
    canvasName: c.name,
    name: settings.names[c.id]?.trim() || c.name,
    color: settings.colors[c.id] || c.color,
    hidden: settings.hidden.includes(c.id),
    customAttendanceUrl: settings.attendance[c.id] || "",
    attendanceUrl: settings.attendance[c.id] || attendanceLinks[c.id] || null,
    schedule: settings.schedule[c.id] || null,
  }));
}
