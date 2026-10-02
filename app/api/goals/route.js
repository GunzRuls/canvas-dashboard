import { getGradeBreakdown } from "@/lib/canvas";
import { canvasId } from "@/lib/safeUrl";
import { goalOutlook } from "@/lib/gradeGoals";

export const dynamic = "force-dynamic";

// Grade goals (CLASS-6): what a class's final grade would be with 0% or 100% on what's left.
// The Grades list asks only for classes that have a goal, after the page has loaded, so the
// dashboard never waits on it. Kept in memory for 10 minutes so reopening stays quick.
const TTL = 10 * 60 * 1000;
const cache = new Map(); // courseId -> { at, outlook }

export async function GET(request) {
  try {
    const courseId = canvasId(new URL(request.url).searchParams.get("courseId"));
    const hit = cache.get(courseId);
    if (hit && Date.now() - hit.at < TTL) return Response.json({ ok: true, outlook: hit.outlook });
    const outlook = goalOutlook(await getGradeBreakdown(courseId));
    cache.set(courseId, { at: Date.now(), outlook });
    return Response.json({ ok: true, outlook });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
