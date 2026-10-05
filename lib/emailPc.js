// MAIL-6 "One morning email, from one PC". Pure helpers (no imports), tested in
// tests/emailPc.test.mjs.
//
// `digestOnThisPc` in dashboard-config.json says whether THIS computer sends the daily email:
// "yes", "no" (the email is set up but another PC sends it), or "" (never set: counts as yes,
// which keeps the behavior of settings saved before this existed). It is per PC, so it is never
// put in a backup (lib/backup.js lists exactly what goes in).

export function sendsFromThisPc(config) {
  return String(config?.digestOnThisPc ?? "").trim() !== "no";
}

// The flag after a Settings save. `here` (true/false) is an explicit choice (the "Send from
// this PC" / "Stop sending from this PC" buttons). Otherwise turning the email on, from off,
// means this PC sends it; any other save keeps what this PC had.
export function flagAfterSave({ wasOn, isOn, flag, here }) {
  if (here === true) return "yes";
  if (here === false) return "no";
  if (isOn && !wasOn) return "yes";
  return String(flag || "");
}

// The flag after restoring a backup. The restore asks "Send the morning email from this PC
// too?" and anything but a clear yes means no: the backup's PC probably still sends it, and two
// emails a morning is worse than none here (the button still works).
export function flagAfterRestore({ emailOn, sendHere }) {
  if (!emailOn) return "";
  return sendHere === true ? "yes" : "no";
}

// Whether the Windows task should exist for these settings (`enabled` = digestEnabled(config)).
export function wantsTask(enabled, config) {
  return Boolean(enabled) && sendsFromThisPc(config);
}

// Whether a save or restore has to create, change or remove the Windows task, and with what.
export function taskChange({ before, after, enabledBefore, enabledAfter }) {
  const was = wantsTask(enabledBefore, before);
  const now = wantsTask(enabledAfter, after);
  const timing = after.sendTime !== before.sendTime || after.sendDays !== before.sendDays;
  return { needed: was !== now || timing, enabled: now };
}
