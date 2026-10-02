import { tidyCourseName, tidyCourseCode } from "./courseNames";
import fs from "fs/promises";
import { dataFile } from "./dataDir";
import { EMPTY_SETTINGS, mergeSettings, cleanSettings } from "./settingsData";

// Your class preferences (hidden classes, renamed classes, custom colors, class times) are saved
// in dashboard-settings.json (see lib/dataDir.js). The checks live in lib/settingsData.js.
const FILE = dataFile("dashboard-settings.json");

export async function readSettings() {
  try {
    const saved = JSON.parse((await fs.readFile(FILE, "utf8")).replace(/^\uFEFF/, ""));
    // Checked on the way in too, so a hand-edited file can't add a "javascript:" link or a
    // color that isn't a color.
    return cleanSettings(saved);
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
    // Your own name wins; otherwise Canvas's name without the "(Fall 2026-1 CEN4065-0)" part.
    defaultName: tidyCourseName(c.name),
    customName: settings.names[c.id]?.trim() || "",
    name: settings.names[c.id]?.trim() || tidyCourseName(c.name),
    code: tidyCourseCode(c.code, c.name),
    color: settings.colors[c.id] || c.color,
    hidden: settings.hidden.includes(c.id),
    customAttendanceUrl: settings.attendance[c.id] || "",
    attendanceUrl: settings.attendance[c.id] || attendanceLinks[c.id] || null,
    schedule: settings.schedule[c.id] || null,
    goal: settings.goals[c.id] ?? null,
  }));
}
