import { loadDashboard } from "@/lib/loadDashboard";
import { buildDigest, sendDigest, digestEnabled } from "@/lib/digest";
import { getConfig } from "@/lib/config";
import { fromThisApp } from "@/lib/sameOrigin";
import { sendsFromThisPc } from "@/lib/emailPc";
import { digestLateness } from "@/lib/digestLate";

// The time zone the Windows task runs in (this PC's), for working out whether it's late.
function pcTimeZone(fallback) {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

// `scheduled` is true only for the daily Windows task (start-dashboard.ps1 -SendDigest).
async function run({ scheduled = false } = {}) {
  if (!digestEnabled()) throw new Error("Turn on the morning email in Settings first.");
  const config = getConfig();
  let late = null;
  if (scheduled) {
    // MAIL-6: another PC sends it (a leftover task can't double it up).
    if (!sendsFromThisPc(config)) {
      return Response.json({ ok: true, skipped: true, reason: "This PC doesn't send the morning email (another PC does)." });
    }
    // MAIL-5: the PC was off or asleep at send time (rule in lib/digestLate.js).
    const lateness = digestLateness({ now: Date.now(), sendTime: config.sendTime, sendDays: config.sendDays, timeZone: pcTimeZone(config.timezone) });
    if (lateness.skip) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: `The ${lateness.clock} email was ${Math.round(lateness.minutesLate / 60)} hours late and the next one is due soon, so this one was skipped.`,
      });
    }
    if (lateness.late) late = lateness;
  }
  const { courses, items, announcements, account } = await loadDashboard({ withCalendar: false, withAttendance: false, withGrades: false });
  await sendDigest(buildDigest({ courses, items, announcements, account, late }));
  return Response.json({ ok: true, to: config.digestToEmail, late: Boolean(late) });
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

// The "Email summary" and "Send a test email" buttons (no body: never late), and the daily
// Windows task ({ scheduled: true }).
// Same-origin only, so a website open in another tab can't make it send you mail.
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    return await run({ scheduled: body?.scheduled === true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
