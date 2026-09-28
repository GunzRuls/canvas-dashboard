import { loadDashboard } from "@/lib/loadDashboard";
import { buildDigest, sendDigest, digestEnabled } from "@/lib/digest";

async function run() {
  if (!digestEnabled()) throw new Error("Add RESEND_API_KEY and DIGEST_TO_EMAIL to .env.local first.");
  const { courses, items, announcements } = await loadDashboard({ withCalendar: false, withAttendance: false, withGrades: false });
  await sendDigest(buildDigest({ courses, items, announcements }));
  return Response.json({ ok: true, to: process.env.DIGEST_TO_EMAIL });
}

// Scheduled runs use GET. If CRON_SECRET is set, the request must carry it.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  }
  try {
    return await run();
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// The "Email me today's summary" button uses POST.
export async function POST() {
  try {
    return await run();
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
