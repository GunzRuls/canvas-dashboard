import { markAnnouncementRead } from "@/lib/canvas";

// The browser calls this when you open or dismiss an announcement.
export async function POST(request) {
  try {
    const body = await request.json();
    await markAnnouncementRead(body);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
