import { markFeedbackSeen } from "@/lib/dismissed";
import { fromThisApp } from "@/lib/sameOrigin";

// Opening Incoming's Feedback tab marks the comments in it as seen (saved on this PC only;
// nothing changes in Canvas).
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }
  try {
    const { ids = [] } = await request.json();
    const clean = (Array.isArray(ids) ? ids : []).map(String).filter((id) => /^\d{1,20}$/.test(id)).slice(0, 500);
    await markFeedbackSeen(clean);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
