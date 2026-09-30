import { loadDashboard } from "@/lib/loadDashboard";
import { buildDigest, sendDigest, digestEnabled } from "@/lib/digest";
import { getConfig } from "@/lib/config";
import { fromThisApp } from "@/lib/sameOrigin";

async function run() {
  if (!digestEnabled()) throw new Error("Turn on the morning email in Settings first.");
  const { courses, items, announcements, account } = await loadDashboard({ withCalendar: false, withAttendance: false, withGrades: false });
  await sendDigest(buildDigest({ courses, items, announcements, account }));
  return Response.json({ ok: true, to: getConfig().digestToEmail });
}

// For an outside scheduler only, and only when CRON_SECRET is set. The daily email normally
// comes from the Windows task, which uses POST (launcher/start-dashboard.ps1 -SendDigest).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  }
  try {
    return await run();
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// The "Email summary" and "Send a test email" buttons, and the daily Windows task.
// Same-origin only, so a website open in another tab can't make it send you mail.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  try {
    return await run();
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
