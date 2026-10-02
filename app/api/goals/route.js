import { cachedBreakdown } from "@/lib/breakdownCache";
import { goalOutlook } from "@/lib/gradeGoals";

export const dynamic = "force-dynamic";

// Grade goals (CLASS-6): what a class's final grade would be with 0% or 100% on what's left.
// The Grades list asks only for classes that have a goal (or while the goal picker is open), after
// the page has loaded, so the dashboard never waits on it. Cached 10 minutes (lib/breakdownCache.js).
export async function GET(request) {
  try {
    const outlook = goalOutlook(await cachedBreakdown(new URL(request.url).searchParams.get("courseId")));
    return Response.json({ ok: true, outlook });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
