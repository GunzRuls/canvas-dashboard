import fs from "fs/promises";
import { dataFile } from "./dataDir";
import { EMPTY_SETTINGS, mergeSettings } from "./settingsData";

// Your class preferences (hidden classes, renamed classes, custom colors, class times) are saved
// in dashboard-settings.json (see lib/dataDir.js). The checks live in lib/settingsData.js.
const FILE = dataFile("dashboard-settings.json");

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
    return structuredClone(EMPTY_SETTINGS);
  }
}

// One save at a time, so two quick saves can't read the same file and undo each other.
let queue = Promise.resolve();

// Saves only the parts in `patch` and keeps the rest of the file as it was.
export function updateSettings(patch) {
  const run = queue.then(async () => {
    const clean = mergeSettings(await readSettings(), patch);
    await fs.writeFile(FILE, JSON.stringify(clean, null, 2));
    return clean;
  });
  queue = run.catch(() => {});
  return run;
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
