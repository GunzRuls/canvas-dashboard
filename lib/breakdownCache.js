import { getGradeBreakdown } from "./canvas";
import { canvasId } from "./safeUrl";

// A class's assignment groups (getGradeBreakdown), kept in memory for 10 minutes so the Grades
// goals and the This term page can reopen quickly without asking Canvas again each time.
const TTL = 10 * 60 * 1000;
const cache = new Map(); // courseId -> { at, breakdown }

export async function cachedBreakdown(id) {
  const courseId = canvasId(id);
  const hit = cache.get(courseId);
  if (hit && Date.now() - hit.at < TTL) return hit.breakdown;
  const breakdown = await getGradeBreakdown(courseId);
  cache.set(courseId, { at: Date.now(), breakdown });
  return breakdown;
}
