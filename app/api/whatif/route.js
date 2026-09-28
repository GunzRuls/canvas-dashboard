import { getGradeBreakdown } from "@/lib/canvas";

export async function GET(request) {
  try {
    const courseId = new URL(request.url).searchParams.get("courseId");
    if (!courseId) throw new Error("Missing courseId.");
    return Response.json({ ok: true, breakdown: await getGradeBreakdown(courseId) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
