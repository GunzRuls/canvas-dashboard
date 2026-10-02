// Heads up (DASH-14): warns about a week that's clearly heavier than normal. Pure function:
// `now` is passed in, nothing is fetched. Weeks run Monday to Sunday on the local clock.
//
// The rule, in plain words: look at the work still to do in the next 14 days, split by week.
// A week is "heavy" when it has at least 3 things left AND they're worth at least 1.5 times the
// points of a normal week, where "normal" is the median week of everything on the board this term
// (done or not, every week that has graded work). With fewer than 4 such weeks there isn't
// enough to say what normal is, so nothing is flagged.

const DAY = 24 * 60 * 60 * 1000;
export const CRUNCH_DAYS = 14;
export const HEAVY_RATIO = 1.5;
export const MIN_ITEMS = 3;
export const MIN_WEEKS = 4;

// Monday 00:00 of the week `ms` falls in.
export function weekStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Same rule as the board: Canvas's "marked complete" wins, then submission status.
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

const points = (i) => (Number(i.points) > 0 ? Number(i.points) : 0);
// Personal notes and peer reviews aren't graded work of their own.
const counts = (i) => i.dueAt && i.type !== "planner_note" && i.type !== "assessment_request";

/**
 * { heavy, weeks, normal } where `normal` is the median weekly points (or null), `weeks` the
 * upcoming weeks [{ start, items, points, count, heavy }], and `heavy` the first heavy week or null.
 */
export function findCrunch({ items = [], status = {}, now }) {
  const work = items.filter(counts);

  // A normal week: median points over every week of the term that has graded work.
  const termWeeks = new Map();
  for (const i of work) {
    const w = weekStart(new Date(i.dueAt).getTime());
    termWeeks.set(w, (termWeeks.get(w) || 0) + points(i));
  }
  const filled = [...termWeeks.values()].filter((p) => p > 0);
  const normal = filled.length >= MIN_WEEKS ? median(filled) : null;

  // What's left in the next 14 days, by week.
  const end = now + CRUNCH_DAYS * DAY;
  const upcoming = new Map();
  for (const i of work) {
    const due = new Date(i.dueAt).getTime();
    if (due < now || due > end) continue;
    if ((status[i.key] ?? initialStatus(i)) === "done") continue;
    const w = weekStart(due);
    if (!upcoming.has(w)) upcoming.set(w, []);
    upcoming.get(w).push(i);
  }

  const weeks = [...upcoming.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, list]) => {
      const sorted = [...list].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
      const total = sorted.reduce((sum, i) => sum + points(i), 0);
      const heavy = normal !== null && sorted.length >= MIN_ITEMS && total > 0 && total >= HEAVY_RATIO * normal;
      return {
        start,
        items: sorted,
        points: total,
        count: sorted.length,
        firstDue: new Date(sorted[0].dueAt).getTime(),
        lastDue: new Date(sorted[sorted.length - 1].dueAt).getTime(),
        heavy,
      };
    });

  return { heavy: weeks.find((w) => w.heavy) || null, weeks, normal };
}

// "Oct 12–16", "Oct 30 – Nov 3", or "Oct 12" for one day.
export function dayRange(fromMs, toMs, locale) {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const month = (d) => d.toLocaleDateString(locale, { month: "short" });
  if (a.toDateString() === b.toDateString()) return `${month(a)} ${a.getDate()}`;
  if (a.getMonth() === b.getMonth()) return `${month(a)} ${a.getDate()}–${b.getDate()}`;
  return `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}
