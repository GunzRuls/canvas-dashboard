import { canvasFetch } from "@/lib/canvas";

// Your personal Canvas calendar feed (all classes' due dates and course events, never
// announcements). Settings uses it for the optional "Add to Google / Outlook" buttons, so your
// own calendar app can subscribe to it. Only fetched when you ask for it there.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await (await canvasFetch("/api/v1/users/self/profile")).json();
    const url = profile?.calendar?.ics;
    if (!url) throw new Error("Canvas didn't give a calendar feed for your account.");
    return Response.json({ ok: true, url });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
}
