import { cachedBreakdown } from "@/lib/breakdownCache";

export const dynamic = "force-dynamic";

// This term page (DASH-16): one class's grade categories and assignments, read-only. The page asks
// for each class after it has loaded, so it never waits on Canvas. Cached 10 minutes.
export async function GET(request) {
  try {
    const breakdown = await cachedBreakdown(new URL(request.url).searchParams.get("courseId"));
    return Response.json({ ok: true, breakdown });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
