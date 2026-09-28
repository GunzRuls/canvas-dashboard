import { checkForUpdate, installUpdate } from "@/lib/updates";
import { fromThisApp } from "@/lib/sameOrigin";

// Always ask at request time, never at build time.
export const dynamic = "force-dynamic";

// GET: is a newer version available? POST: download and install it (the Update button).
export async function GET() {
  try {
    return Response.json({ ok: true, ...(await checkForUpdate()) });
  } catch (error) {
    // Offline or GitHub is busy: just don't show the banner.
    return Response.json({ ok: false, available: false, error: error.message });
  }
}

export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  try {
    return Response.json({ ok: true, ...(await installUpdate()) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
