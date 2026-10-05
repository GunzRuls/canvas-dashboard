import { getConfig, saveConfig } from "@/lib/config";
import { fromThisApp } from "@/lib/sameOrigin";
import { digestEnabled } from "@/lib/digest";
import { scheduleDigest } from "@/lib/schedule";

// MAIL-6: Settings' "Send from this PC" / "Stop sending from this PC". Changes only whether this
// computer sends the morning email (creates or removes its Windows task); the email settings
// stay as they are, so the Email summary button keeps working either way.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body?.here !== "boolean") return Response.json({ ok: false, error: "Pick this PC or another one." }, { status: 400 });
  const config = getConfig();
  if (!digestEnabled(config)) {
    return Response.json({ ok: false, error: "Set up the morning email first." }, { status: 400 });
  }
  try {
    saveConfig({ ...config, digestOnThisPc: body.here ? "yes" : "no" });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  let scheduleWarning = "";
  await scheduleDigest({ sendTime: config.sendTime, sendDays: config.sendDays, enabled: body.here }).catch((error) => {
    scheduleWarning = error.message;
  });
  return Response.json({ ok: true, here: body.here, scheduleWarning });
}
