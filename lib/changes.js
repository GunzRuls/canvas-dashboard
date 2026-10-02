import fs from "fs/promises";
import { dataFile } from "./dataDir";
import { nextChangesState } from "./changesDiff";

// "What's new" (DASH-10), saved in dashboard-changes.json (see lib/dataDir.js): the last board
// we saw, the changes from the last 7 days, and when you last opened the feed.
// The comparing itself is in lib/changesDiff.js.
const FILE = dataFile("dashboard-changes.json");
let queue = Promise.resolve();

async function readRaw() {
  try {
    return JSON.parse((await fs.readFile(FILE, "utf8")).replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

// One step at a time, so two loads (or a load and "seen") can't overwrite each other.
function serialized(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

// Called on each dashboard load with everything Canvas returned (hidden classes included, so
// hiding a class doesn't look like its work vanished). Returns what the page shows.
export function recordChanges(current) {
  return serialized(async () => {
    const state = nextChangesState(await readRaw(), current, Date.now());
    await fs.writeFile(FILE, JSON.stringify(state, null, 2));
    return { changes: state.changes, seenAt: state.seenAt };
  });
}

// You opened the feed: everything up to now counts as seen.
export function markChangesSeen() {
  return serialized(async () => {
    const state = await readRaw();
    if (!state) return null;
    state.seenAt = new Date().toISOString();
    await fs.writeFile(FILE, JSON.stringify(state, null, 2));
    return state.seenAt;
  });
}
