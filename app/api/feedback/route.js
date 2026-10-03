import { cachedFeedback } from "@/lib/feedbackCache";
import { readSeenFeedback } from "@/lib/dismissed";

export const dynamic = "force-dynamic";

// Teacher feedback (CLASS-7): comments teachers left on your work in the last 30 days, plus which
// ones you've already seen. Read-only; the page asks after it has loaded, so it never waits on it.
export async function GET() {
  try {
    const [feedback, seen] = await Promise.all([cachedFeedback(), readSeenFeedback()]);
    return Response.json({ ok: true, feedback, seen: feedback.filter((f) => seen.has(f.id)).map((f) => f.id) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
