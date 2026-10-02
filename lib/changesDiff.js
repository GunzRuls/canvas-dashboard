// "What's new" (DASH-10): spots what a teacher changed since the dashboard last loaded.
// Pure functions (no imports) so tests/changesDiff.test.mjs can check them; lib/changes.js
// reads and saves the file.
//
// The saved state is { snapshot, changes, seenAt }:
//   snapshot: what the board looked like last load (per Planner item, plus announcement ids)
//   changes:  what changed, kept for 7 days so a refresh doesn't wipe them
//   seenAt:   the last time you opened the feed; the badge counts changes after it

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
export const KEEP_DAYS = 7;
const SLACK = DAY; // clock and Canvas timing wiggle room

// The Planner looks 21 days back and 90 ahead (lib/canvas.js), so items slide in and out at
// the edges on their own. Those aren't teacher changes.
const WINDOW_AHEAD = 90 * DAY;

function time(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

// The score for a board item, from the recent grades list (assignments by id, quizzes by quiz id).
function scoreFor(item, grades) {
  const g = grades.find(
    (x) =>
      x.courseId === item.courseId &&
      ((item.type === "assignment" && x.assignmentId === item.plannableId) ||
        (item.type === "quiz" && x.quizId === item.plannableId))
  );
  return g ? { score: g.score, points: g.points ?? item.points ?? null } : null;
}

// What we remember about each item. Your own planner notes are skipped: you made them.
export function takeSnapshot({ items = [], announcements = [], grades = [] }, now) {
  const out = { takenAt: new Date(now).toISOString(), items: {}, announcements: [], courses: [] };
  const courses = new Set();
  for (const i of items) {
    if (i.type === "planner_note") continue;
    const s = scoreFor(i, grades);
    out.items[i.key] = {
      title: i.title,
      dueAt: i.dueAt || null,
      points: i.points ?? null,
      graded: !!i.submissions?.graded,
      score: s ? s.score : null,
      updatedAt: i.updatedAt || null,
      type: i.type,
      plannableId: i.plannableId,
      courseId: i.courseId,
      courseName: i.courseName,
      url: i.url || null,
    };
    if (i.courseId) courses.add(i.courseId);
  }
  for (const a of announcements) {
    out.announcements.push(a.id);
    if (a.courseId) courses.add(a.courseId);
  }
  out.courses = [...courses];
  return out;
}

function base(kind, key, item, at) {
  return {
    id: `${kind}:${key}:${at}`,
    kind,
    key,
    at,
    type: item.type,
    plannableId: item.plannableId,
    courseId: item.courseId,
    courseName: item.courseName,
    title: item.title,
    url: item.url,
  };
}

// The list of changes between two snapshots. `now` is a timestamp.
export function diffSnapshots(prev, next, announcements = [], now) {
  const at = new Date(now).toISOString();
  const knownCourses = new Set(prev.courses || []);
  const prevTaken = time(prev.takenAt) ?? now;
  const out = [];

  for (const [key, cur] of Object.entries(next.items)) {
    const old = prev.items[key];
    if (!old) {
      // New only if it's in a class we already knew (a new semester's classes aren't "news")
      // and it wasn't just sliding into the 90-day window. (Not by Canvas's created time: a
      // teacher often publishes work made weeks ago, and that's news to you.)
      const due = time(cur.dueAt);
      const fromEdge = due !== null && due > now + WINDOW_AHEAD - 3 * DAY;
      if (cur.courseId && knownCourses.has(cur.courseId) && !fromEdge) {
        out.push({ ...base("new", key, cur, at), to: cur.dueAt, points: cur.points });
      }
      continue;
    }

    const dueOld = time(old.dueAt);
    const dueNew = time(cur.dueAt);
    const moved = dueOld !== dueNew && (dueOld === null || dueNew === null || Math.abs(dueOld - dueNew) >= MIN);
    if (moved) out.push({ ...base("moved", key, cur, at), from: old.dueAt, to: cur.dueAt });

    if (cur.graded && !old.graded) {
      out.push({ ...base("graded", key, cur, at), score: cur.score, points: cur.points });
    } else if (cur.graded && old.graded && cur.score !== null && old.score !== null && cur.score !== old.score) {
      out.push({ ...base("graded", key, cur, at), score: cur.score, was: old.score, points: cur.points });
    }

    // Planner items carry no instructions, only Canvas's "last edited" time. If it moved and
    // nothing we can see changed, the teacher edited something else (usually the instructions).
    const renamed = old.title !== cur.title;
    const repointed = old.points !== cur.points;
    // Only for work still ahead: Canvas also bumps that time around grading, which isn't news.
    const ahead = dueNew === null || dueNew > now;
    const touched = ahead && old.updatedAt && cur.updatedAt && old.updatedAt !== cur.updatedAt;
    if (renamed || repointed || (touched && !moved)) {
      const c = base("edited", key, cur, at);
      if (renamed) c.oldTitle = old.title;
      if (repointed) {
        c.oldPoints = old.points;
        c.points = cur.points;
      }
      out.push(c);
    }
  }

  // Removed: gone while still due in the future. Items that fall off the back of the window
  // (or that you finished) stay in the Planner, so they don't land here.
  for (const [key, old] of Object.entries(prev.items)) {
    if (next.items[key]) continue;
    const due = time(old.dueAt);
    if (due !== null && due > now + DAY && due < now + WINDOW_AHEAD - 3 * DAY && old.courseId) {
      out.push({ ...base("removed", key, old, at), from: old.dueAt });
    }
  }

  // New announcements, only ones actually posted since last time (not a class you just unhid).
  const seen = new Set(prev.announcements || []);
  for (const a of announcements) {
    if (seen.has(a.id)) continue;
    const posted = time(a.postedAt);
    if (posted === null || posted < prevTaken - SLACK || !knownCourses.has(a.courseId)) continue;
    out.push({
      id: `announcement:${a.id}:${at}`,
      kind: "new",
      key: `announcement-${a.id}`,
      at,
      type: "announcement",
      plannableId: a.id,
      courseId: a.courseId,
      title: a.title,
      url: a.url,
    });
  }
  return out;
}

// Adds fresh changes to the kept list. A second change of the same kind to the same item
// replaces the first: a due date moved twice shows once (oldest "from" → newest "to"), and if
// it moved back where it was, it disappears.
export function mergeChanges(kept, fresh) {
  const list = [...kept];
  for (const c of fresh) {
    const i = list.findIndex((x) => x.key === c.key && x.kind === c.kind);
    if (i === -1) {
      list.push(c);
      continue;
    }
    const prev = list[i];
    if (c.kind === "moved") {
      const merged = { ...c, from: prev.from };
      if (time(merged.from) === time(merged.to)) list.splice(i, 1);
      else list[i] = merged;
    } else if (c.kind === "edited") {
      list[i] = {
        ...c,
        ...(prev.oldTitle !== undefined && { oldTitle: prev.oldTitle }),
        ...(prev.oldPoints !== undefined && { oldPoints: prev.oldPoints }),
      };
    } else {
      list[i] = c;
    }
  }
  return list;
}

export function pruneChanges(list, now) {
  return list.filter((c) => (time(c.at) ?? 0) >= now - KEEP_DAYS * DAY);
}

// One dashboard load: compares with the saved state and returns the next one.
// The first run ever just remembers the board (a baseline) and shows nothing.
export function nextChangesState(saved, current, now) {
  const snapshot = takeSnapshot(current, now);
  if (!saved?.snapshot) {
    return { snapshot, changes: [], seenAt: new Date(now).toISOString() };
  }
  const fresh = diffSnapshots(saved.snapshot, snapshot, current.announcements || [], now);
  const changes = pruneChanges(mergeChanges(saved.changes || [], fresh), now);
  // Remember scores we learned later (grades older than 10 days drop off the recent list).
  for (const [key, s] of Object.entries(snapshot.items)) {
    const old = saved.snapshot.items?.[key];
    if (s.score === null && old?.score != null && s.graded) s.score = old.score;
  }
  return { snapshot, changes, seenAt: saved.seenAt || new Date(now).toISOString() };
}

// How many changes came in after you last opened the feed.
export function unseenCount(changes, seenAt) {
  const seen = time(seenAt) ?? 0;
  return changes.filter((c) => (time(c.at) ?? 0) > seen).length;
}

// Board items whose due date moved in the last 3 days → the date it was, for the "Moved" badge.
export function recentlyMoved(changes, now, days = 3) {
  const out = {};
  for (const c of changes) {
    if (c.kind !== "moved" || !c.from || !c.to) continue;
    if ((time(c.at) ?? 0) < now - days * DAY) continue;
    out[c.key] = c.from;
  }
  return out;
}
