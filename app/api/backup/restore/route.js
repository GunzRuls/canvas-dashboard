import { getConfig, saveConfig, publicConfig } from "@/lib/config";
import { replaceSettings } from "@/lib/settings";
import { replaceDismissed } from "@/lib/dismissed";
import { fromThisApp } from "@/lib/sameOrigin";
import { normalShow } from "@/lib/calendarKind";
import { digestEnabled, gmailTransport, gmailErrorMessage } from "@/lib/digest";
import { scheduleDigest } from "@/lib/schedule";
import { flagAfterRestore, taskChange } from "@/lib/emailPc";
import { decryptBackup, BackupError, MAX_BACKUP_BYTES } from "@/lib/backup";
import {
  canvasAddress,
  calendarLinks,
  checkCanvas,
  countClasses,
  checkCalendars,
  applyEmailSettings,
  checkTimezone,
} from "@/lib/configChecks";

export const dynamic = "force-dynamic";

// "Move to another PC": opens a backup file (lib/backup.js) and replaces this PC's settings with
// it. Everything goes through the same checks as Settings (lib/configChecks.js): Canvas must
// accept the token before anything is saved; a calendar link that doesn't load or email settings
// that don't pass are left out and reported, and the rest is restored. Secrets are saved through
// saveConfig, so they're locked with this PC's Windows protection.
// The password and the file come in the POST body only and are never logged.
// MAIL-6: when the backup has the morning email, the first answer is { askEmail: true } (nothing
// saved yet) and the page asks "Send the morning email from this PC too?". It sends the same
// request again with `emailHere` (true/false); anything but true keeps the email paused here.

function fail(error, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

// Each calendar link on its own, so one that's gone doesn't stop the others.
async function restoreCalendars(backup) {
  const urls = String(backup.calendarUrls || "").split(",").map((u) => u.trim());
  const show = String(backup.calendarShow || "").split(",");
  const results = await Promise.all(
    urls.map(async (raw, i) => {
      if (!raw) return null;
      try {
        const [url] = calendarLinks(raw);
        await checkCalendars([url]);
        return { url, show: normalShow(show[i]) };
      } catch {
        return { failed: true };
      }
    })
  );
  const kept = results.filter((r) => r && !r.failed);
  return { kept, failed: results.filter((r) => r?.failed).length };
}

export async function POST(request) {
  if (!fromThisApp(request)) return fail("Not allowed.", 403);

  // The file arrives as text inside JSON, so allow some room for escaping.
  const raw = await request.text();
  if (raw.length > MAX_BACKUP_BYTES * 2) return fail("That file is too big to be a backup.", 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Pick your backup file and type its password.");
  }
  if (typeof body?.file !== "string" || !body.file.trim()) return fail("Pick your backup file.");

  let payload;
  try {
    ({ payload } = await decryptBackup(body.file, body.password));
  } catch (error) {
    return fail(error instanceof BackupError ? error.message : "That file couldn't be opened.");
  }

  const backup = payload.config;
  if (backup.emailProvider && typeof body.emailHere !== "boolean") {
    return Response.json({ ok: false, askEmail: true, sendTime: backup.sendTime || "07:00", sendDays: backup.sendDays || "weekdays" });
  }

  try {
    const current = getConfig();
    const notes = [];
    // Every config field is set from the backup (or a default): it replaces what is here.
    const next = {
      canvasBaseUrl: canvasAddress(backup.canvasBaseUrl),
      canvasToken: backup.canvasToken,
      gmailAppPassword: backup.gmailAppPassword,
      resendApiKey: backup.resendApiKey,
      emailProvider: "",
      gmailAddress: "",
      digestToEmail: "",
      digestFromEmail: "",
      sendTime: "07:00",
      sendDays: "weekdays",
    };
    if (!next.canvasToken) throw new Error("This backup has no Canvas token. Connect Canvas by hand instead.");

    // Canvas first: if it says no, nothing is saved.
    let name;
    try {
      name = await checkCanvas(next.canvasBaseUrl, next.canvasToken);
    } catch (error) {
      throw new Error(
        /token/i.test(error.message)
          ? "The backup opened, but Canvas didn't accept its token (it may have been deleted). Make a new token and connect by hand."
          : `The backup opened, but ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`
      );
    }

    const calendars = await restoreCalendars(backup);
    next.calendarUrls = calendars.kept.map((c) => c.url).join(",");
    next.calendarShow = calendars.kept.map((c) => c.show).join(",");
    if (calendars.failed) {
      notes.push(
        `${calendars.failed === 1 ? "One calendar link" : `${calendars.failed} calendar links`} didn't load, so ${calendars.failed === 1 ? "it wasn't" : "they weren't"} restored. Add ${calendars.failed === 1 ? "it" : "them"} again in Settings.`
      );
    }

    // Morning email: the same checks as Settings, including a Gmail sign-in check (nothing is sent).
    try {
      applyEmailSettings(
        {
          emailProvider: backup.emailProvider,
          gmailAddress: backup.gmailAddress,
          digestToEmail: backup.digestToEmail,
          digestFromEmail: backup.digestFromEmail,
          sendTime: backup.sendTime || "07:00",
          sendDays: backup.sendDays || "weekdays",
        },
        next
      );
      if (next.emailProvider === "gmail") {
        try {
          await gmailTransport(next).verify();
        } catch (error) {
          throw new Error(gmailErrorMessage(error));
        }
      }
    } catch (error) {
      next.emailProvider = "";
      notes.push(`The morning email wasn't turned on: ${error.message} Set it up again in Settings.`);
    }

    next.timezone = backup.timezone || "America/New_York";
    try {
      checkTimezone(next.timezone);
    } catch {
      next.timezone = "America/New_York";
    }

    // MAIL-6: this PC sends the email only if you said yes; the backup never carries this.
    const emailOn = digestEnabled(next);
    next.digestOnThisPc = flagAfterRestore({ emailOn, sendHere: body.emailHere });

    saveConfig(next);
    await replaceSettings(payload.settings);
    await replaceDismissed(payload.dismissed);

    // Same rule as saving email settings: set up, change, or remove the daily Windows task.
    const task = taskChange({ before: current, after: next, enabledBefore: digestEnabled(current), enabledAfter: emailOn });
    if (task.needed) {
      await scheduleDigest({ sendTime: next.sendTime, sendDays: next.sendDays, enabled: task.enabled }).catch((error) => {
        notes.push(`Restored, but ${error.message}`);
      });
    }

    return Response.json({
      ok: true,
      name,
      classes: await countClasses(next.canvasBaseUrl, next.canvasToken),
      emailOn,
      notes,
      needsClassTimes: Object.keys(payload.settings.schedule).length === 0,
      saved: publicConfig(),
    });
  } catch (error) {
    return fail(error.message);
  }
}
