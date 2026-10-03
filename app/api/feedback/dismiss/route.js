import { updateFeedbackDone } from "@/lib/dismissed";
import { fromThisApp } from "@/lib/sameOrigin";

// Marks teacher comments Done (hidden from Incoming's Feedback tab) or brings them back (Undo).
// Saved on this PC only; nothing changes in Canvas.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }
  try {
    const { ids = [], dismiss = true } = await request.json();
    const clean = (Array.isArray(ids) ? ids : []).map(String).filter((id) => /^\d{1,20}$/.test(id)).slice(0, 500);
    await updateFeedbackDone(clean, dismiss !== false);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
