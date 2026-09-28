import { setPlannerComplete } from "@/lib/canvas";

// The browser calls this when you drag a card into or out of "Done".
// This route adds your token and forwards the change to Canvas.
export async function POST(request) {
  try {
    const body = await request.json();
    const override = await setPlannerComplete(body);
    return Response.json({ ok: true, overrideId: override.id, done: !!override.marked_complete });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
