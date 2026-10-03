import fs from "fs/promises";
import { dataFile } from "./dataDir";

// Things you've cleared on the dashboard, saved in dashboard-dismissed.json (see lib/dataDir.js):
//   announcements: announcements you marked Done
//   grades: new-grade alerts you've already seen
//   feedback: teacher comments you've already seen
const FILE = dataFile("dashboard-dismissed.json");
let queue = Promise.resolve();

async function readRaw() {
  try {
    return JSON.parse((await fs.readFile(FILE, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
}

export async function readDismissed() {
  const saved = await readRaw();
  return new Set((saved.announcements || []).map(Number));
}

export async function readSeenGrades() {
  const saved = await readRaw();
  return new Set((saved.grades || []).map(String));
}

// Changes are applied one at a time so quick clicks can't overwrite each other.
function update(kind, ids, add, normalize) {
  queue = queue.then(async () => {
    const saved = await readRaw();
    const set = new Set((saved[kind] || []).map(normalize));
    for (const id of ids) {
      if (add) set.add(normalize(id));
      else set.delete(normalize(id));
    }
    saved[kind] = [...set].slice(-1000); // old entries age out
    await fs.writeFile(FILE, JSON.stringify(saved, null, 2));
  });
  return queue;
}

export function updateDismissed(ids, dismiss) {
  return update("announcements", ids, dismiss, Number);
}

export function markGradesSeen(keys) {
  return update("grades", keys, true, String);
}

// feedback: teacher comment ids you've already seen in Incoming's Feedback tab (CLASS-7)
export async function readSeenFeedback() {
  const saved = await readRaw();
  return new Set((saved.feedback || []).map(String));
}

export function markFeedbackSeen(ids) {
  return update("feedback", ids, true, String);
}
