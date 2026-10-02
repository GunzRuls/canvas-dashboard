import { markChangesSeen } from "@/lib/changes";
import { fromThisApp } from "@/lib/sameOrigin";

// Opening "What's new" clears its count badge.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }
  try {
    const seenAt = await markChangesSeen();
    return Response.json({ ok: true, seenAt });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
