import { cachedFeedback } from "@/lib/feedbackCache";
import { readSeenFeedback, readFeedbackDone } from "@/lib/dismissed";

export const dynamic = "force-dynamic";

// Teacher feedback (CLASS-7): comments teachers left on your work in the last 30 days, plus which
// ones you've already seen and which you marked Done (the tab hides those). Read-only; the page
// asks after it has loaded, so it never waits on it.
export async function GET() {
  try {
    const [feedback, seen, done] = await Promise.all([cachedFeedback(), readSeenFeedback(), readFeedbackDone()]);
    const ids = (set) => feedback.filter((f) => set.has(f.id)).map((f) => f.id);
    return Response.json({ ok: true, feedback, seen: ids(seen), done: ids(done) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
