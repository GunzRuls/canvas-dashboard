import { getQuickLook } from "@/lib/canvas";

// Quick look: one assignment, quiz, discussion or announcement, trimmed to what the pop-up shows
// (with its HTML already cleaned). Read-only. Ids are checked in getQuickLook (canvasId).
const TYPES = new Set(["assignment", "quiz", "discussion_topic", "announcement"]);

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    if (!TYPES.has(type)) throw new Error("Quick look doesn't support that kind of item.");
    const look = await getQuickLook(type, params.get("courseId"), params.get("id"));
    return Response.json({ ok: true, look });
  } catch (error) {
    const message = /^Canvas returned 404/.test(error.message)
      ? "Canvas couldn't find it. It may have been moved, hidden or deleted."
      : error.message;
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
