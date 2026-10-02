"use client";

import { useMemo } from "react";
import { findExams } from "@/lib/exams";
import { findCrunch } from "@/lib/crunch";

// Exams in the next 3 weeks (lib/exams.js) and the heavy-week check (lib/crunch.js), shared by
// Incoming on Today and the This term page. Recomputed when the board changes, and once an hour
// as days roll over (`now` ticks every minute). Empty until the page has loaded in the browser.
export function useHeadsUp({ now, items, announcements, events, courses, status }) {
  const hour = now ? Math.floor(now / 3600000) : null;
  const exams = useMemo(
    () => (hour === null ? [] : findExams({ items, announcements, events, courses, status, now })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, announcements, events, courses, status, hour]
  );
  const crunch = useMemo(
    () => (hour === null ? { heavy: null, weeks: [], normal: null } : findCrunch({ items, status, now })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, status, hour]
  );
  return { ready: hour !== null, exams, crunch };
}
