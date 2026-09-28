import { writeSettings } from "@/lib/settings";

export async function POST(request) {
  try {
    const saved = await writeSettings(await request.json());
    return Response.json({ ok: true, settings: saved });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
