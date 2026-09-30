import { getCourses } from "@/lib/canvas";
import { readSettings, updateSettings, applySettings } from "@/lib/settings";
import { fromThisApp } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

// Your classes plus what's saved for them (names, colors, hidden, class times).
// Used by the "When are your classes?" setup step.
export async function GET() {
  try {
    const settings = await readSettings();
    const courses = applySettings(await getCourses(), settings).map((c) => ({
      id: c.id,
      name: c.name,
      canvasName: c.canvasName,
      code: c.code,
      color: c.color,
      hidden: c.hidden,
      schedule: c.schedule,
    }));
    return Response.json({ ok: true, courses, settings });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// Saves only the parts sent (hidden, names, colors, attendance, schedule); the rest is kept.
// Manage classes sends all of them; onboarding sends just class times and hidden classes.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  try {
    const saved = await updateSettings(await request.json());
    return Response.json({ ok: true, settings: saved });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
