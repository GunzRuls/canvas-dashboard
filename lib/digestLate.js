// MAIL-5: is the scheduled morning email going out late? Pure (no imports), tested in
// tests/digestLate.test.mjs.
//
// Windows' task runs a missed send as soon as the PC is back on (StartWhenAvailable), which can
// be hours later. Only the scheduled send asks this (start-dashboard.ps1 -SendDigest posts
// {scheduled: true}); the Email summary button is never late.
//
// The rule:
// - The send it belongs to is the latest send time (sendTime on a send day) at or before now.
//   A send time up to 10 minutes in the future also counts, so a clock a little ahead never
//   turns an on-time email into yesterday's.
// - More than 2 hours after that time = late (subject "(sent late)", a greeting for the time
//   of day, and a line saying when it was due).
// - Late AND the next send is less than 2 hours away = skipped: a fresh one is about to go
//   out, so two nearly identical emails would arrive close together.
// Times are wall-clock times in `timeZone` (the PC's own zone: the Windows task uses it), so
// daylight saving changes move the send time with the clock, like Windows does.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
export const LATE_AFTER = 2 * HOUR;
export const SKIP_IF_NEXT_WITHIN = 2 * HOUR;
const EARLY_GRACE = 10 * MINUTE;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Wall-clock parts of `ms` in `timeZone`.
function partsIn(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, min: p.minute };
}

// How far `timeZone` is ahead of UTC at `ms`, in ms.
function offsetAt(ms, timeZone) {
  const p = partsIn(ms, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / MINUTE) * MINUTE;
}

// The moment a wall-clock time happens in `timeZone`. A time skipped by a spring-forward
// change lands an hour later, like a Windows trigger does.
export function wallTime(y, m, d, h, min, timeZone) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  return Math.max(first, second);
}

function validZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

// "07:00" -> "7:00 AM"
export function clockText(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

// { late, skip, scheduledAt, nextAt, minutesLate, daysAgo, clock, weekday }
// `daysAgo`: 0 = due earlier today, 1 = yesterday, ... (calendar days in `timeZone`).
export function digestLateness({ now = Date.now(), sendTime = "07:00", sendDays = "weekdays", timeZone } = {}) {
  const zone = validZone(timeZone);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(sendTime));
  const [h, min] = match ? [Number(match[1]), Number(match[2])] : [7, 0];
  const today = partsIn(now, zone);
  const todayNum = Date.UTC(today.y, today.m - 1, today.d) / (24 * HOUR);

  // Send times from 8 days back to 2 days ahead.
  const slots = [];
  for (let k = -2; k <= 8; k++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d - k));
    const weekday = date.getUTCDay();
    if (sendDays === "weekdays" && (weekday === 0 || weekday === 6)) continue;
    slots.push({
      at: wallTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), h, min, zone),
      daysAgo: todayNum - date.getTime() / (24 * HOUR),
      weekday: WEEKDAYS[weekday],
    });
  }
  slots.sort((a, b) => a.at - b.at);
  const index = slots.findLastIndex((s) => s.at <= now + EARLY_GRACE);
  const slot = slots[index];
  const nextAt = slots[index + 1]?.at ?? null;
  if (!slot) return { late: false, skip: false, scheduledAt: null, nextAt, minutesLate: 0, daysAgo: 0, clock: clockText(sendTime), weekday: "" };

  const lateBy = now - slot.at;
  const late = lateBy > LATE_AFTER;
  return {
    late,
    skip: late && nextAt != null && nextAt - now < SKIP_IF_NEXT_WITHIN,
    scheduledAt: slot.at,
    nextAt,
    minutesLate: Math.max(0, Math.round(lateBy / MINUTE)),
    daysAgo: slot.daysAgo,
    clock: clockText(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`),
    weekday: slot.weekday,
  };
}

// "Good morning" / "Good afternoon" / "Good evening" by the hour in `timeZone`.
// 5 AM to noon is morning, noon to 5 PM afternoon, the rest evening.
export function greetingFor(now, timeZone) {
  const { h } = partsIn(now, validZone(timeZone));
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

// The line under the greeting of a late email. Fixed wording, chosen by how late it is.
export function lateLine(late) {
  if (!late?.late) return "";
  const when =
    late.daysAgo <= 0 ? `at ${late.clock}` : late.daysAgo === 1 ? `yesterday at ${late.clock}` : `${late.weekday} at ${late.clock}`;
  const base = `This was due ${when} but your PC was off or asleep, so it's coming now.`;
  return late.daysAgo > 0 ? `${base} Everything below is up to date.` : base;
}
