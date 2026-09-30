import { publicConfig } from "@/lib/config";
import { currentVersion } from "@/lib/updates";
import { digestEnabled } from "@/lib/digest";
import { nextDigestRun } from "@/lib/schedule";
import { getAccount } from "@/lib/canvas";

// Asking Windows for the email task's next run starts PowerShell, which takes about a second.
// Remember the answer for a minute. The key holds the email settings, so a save that changes
// the schedule (or turns the email on or off) asks again right away.
const NEXT_EMAIL_TTL = 60 * 1000;
const nextEmailCache = { key: "", at: 0, value: null };

function cachedNextDigestRun(saved) {
  const key = [saved.emailProvider, saved.sendTime, saved.sendDays, saved.timezone].join("|");
  if (nextEmailCache.value && nextEmailCache.key === key && Date.now() - nextEmailCache.at < NEXT_EMAIL_TTL) {
    return nextEmailCache.value;
  }
  const value = nextDigestRun();
  Object.assign(nextEmailCache, { key, at: Date.now(), value });
  return value;
}

// Everything the Settings form needs. Shared by the full /setup page and the Settings pop-up
// (app/@modal/(.)setup), so both always show the same thing.
// The form itself only needs the quick local settings, so it shows right away. The two slow
// parts (who you are on Canvas, and the next email time) are handed over as promises: the form
// shows small placeholders for them and fills them in when they arrive.
export function settingsProps(fix) {
  const fixToken = fix === "token";
  const saved = publicConfig();
  return {
    saved,
    firstRun: false,
    installed: Boolean(process.env.DASHBOARD_INSTALL_DIR),
    version: currentVersion(),
    fixToken,
    emailOn: digestEnabled(),
    nextEmail: cachedNextDigestRun(saved),
    account: fixToken ? null : getAccount().catch(() => null),
  };
}
