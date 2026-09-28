import fs from "fs/promises";
import path from "path";

// Things you've cleared on the dashboard, saved in dashboard-dismissed.json in the project folder:
//   announcements: announcements you marked Done
//   grades: new-grade alerts you've already seen
const FILE = path.join(process.cwd(), "dashboard-dismissed.json");
let queue = Promise.resolve();

async function readRaw() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
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
