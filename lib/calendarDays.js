// Which days a linked-calendar event covers, for the This term calendar (DASH-19). Pure: no
// imports, tested in tests/calendarDays.test.mjs.
//
// Events come from lib/calendar.js: timed ones have ISO `start`/`end`; all-day ones have
// "YYYY-MM-DD" dates with `end` exclusive (iCal's rule: a one-day event ends the next day).

export function localDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextDay(ms) {
  const d = new Date(ms);
  d.setDate(d.getDate() + 1); // DST-safe
  return d.getTime();
}

// `dayStarts`: local midnights (ms), in order. Returns one list per day of
// { event, first } where `first` is false on the 2nd, 3rd, ... day of a multi-day event.
export function eventsOnDays(events, dayStarts) {
  const out = dayStarts.map(() => []);
  for (const event of events || []) {
    if (event.allDay) {
      const start = String(event.start);
      const end = String(event.end || event.start);
      dayStarts.forEach((ms, i) => {
        const key = localDayKey(ms);
        const covers = end > start ? key >= start && key < end : key === start;
        if (covers) out[i].push({ event, first: key === start });
      });
    } else {
      const s = new Date(event.start).getTime();
      const e = new Date(event.end || event.start).getTime();
      if (!Number.isFinite(s)) continue;
      dayStarts.forEach((ms, i) => {
        const next = nextDay(ms);
        const covers = Number.isFinite(e) && e > s ? s < next && e > ms : s >= ms && s < next;
        if (covers) out[i].push({ event, first: s >= ms });
      });
    }
  }
  return out;
}
