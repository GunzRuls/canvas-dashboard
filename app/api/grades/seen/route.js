import { markGradesSeen } from "@/lib/dismissed";

// Clears new-grade alerts once you've seen them.
export async function POST(request) {
  try {
    const { keys = [] } = await request.json();
    await markGradesSeen(keys);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
