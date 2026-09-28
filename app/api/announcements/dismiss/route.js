import { updateDismissed } from "@/lib/dismissed";
import { markAnnouncementRead } from "@/lib/canvas";

// Marks announcements Done (hidden from the dashboard) or brings them back (Undo).
// Done also marks them read in Canvas.
export async function POST(request) {
  try {
    const { announcements = [], dismiss = true } = await request.json();
    await updateDismissed(announcements.map((a) => a.id), dismiss);
    if (dismiss) {
      await Promise.allSettled(
        announcements
          .filter((a) => !a.read)
          .map((a) => markAnnouncementRead({ courseId: a.courseId, topicId: a.id }))
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
