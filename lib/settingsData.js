// Pure helpers for dashboard-settings.json (no file access, so tests can import them).
import { safeUrl } from "./safeUrl.js";
import { cleanGoal } from "./gradeGoals.js";

export const EMPTY_SETTINGS = { hidden: [], names: {}, colors: {}, attendance: {}, schedule: {}, goals: {} };
export const SETTINGS_KEYS = Object.keys(EMPTY_SETTINGS);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// A class time is { days: [0-6], start: "HH:MM", end: "HH:MM" } with start before end.
// Returns a clean copy, or null when it isn't usable.
export function cleanSchedule(value) {
  if (!value || !Array.isArray(value.days)) return null;
  const days = [...new Set(value.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length || !TIME.test(value.start) || !TIME.test(value.end)) return null;
  if (value.start >= value.end) return null;
  return { days, start: value.start, end: value.end };
}

// Drops anything invalid before it's saved.
export function cleanSettings(settings = {}) {
  return {
    hidden: [...new Set((settings.hidden || []).map(Number).filter(Boolean))],
    names: Object.fromEntries(
      Object.entries(settings.names || {}).filter(([, v]) => typeof v === "string" && v.trim())
    ),
    colors: Object.fromEntries(
      Object.entries(settings.colors || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v))
    ),
    // Only real web links (no "javascript:"), since they become Check in buttons.
    attendance: Object.fromEntries(
      Object.entries(settings.attendance || {})
        .map(([id, v]) => [id, String(v ?? "").trim()])
        .filter(([, v]) => /^https?:\/\//i.test(v) && safeUrl(v))
    ),
    // Class meeting times, used by the Next class card and Check in.
    schedule: Object.fromEntries(
      Object.entries(settings.schedule || {})
        .map(([id, v]) => [id, cleanSchedule(v)])
        .filter(([, v]) => v)
    ),
    // Grade goals (CLASS-6): a target percent per class, above 0 and up to 100.
    goals: Object.fromEntries(
      Object.entries(settings.goals || {})
        .filter(([id]) => /^\d+$/.test(id))
        .map(([id, v]) => [id, cleanGoal(v)])
        .filter(([, v]) => v !== null)
    ),
  };
}

// Only the parts that were sent change; everything else stays as saved. Manage classes sends
// its five parts (a full save); onboarding sends just `schedule` and `hidden`.
// `goals` is different: it changes one class at a time ({ "123": 90 } sets a goal,
// { "123": null } or "" removes it), so two rows saving at once can't undo each other.
export function mergeSettings(current = {}, patch = {}) {
  const merged = { ...EMPTY_SETTINGS, ...current };
  for (const key of SETTINGS_KEYS) {
    if (patch[key] === undefined) continue;
    if (key === "goals") {
      const goals = { ...(merged.goals || {}) };
      for (const [id, v] of Object.entries(patch.goals || {})) {
        if (cleanGoal(v) === null) delete goals[id];
        else goals[id] = v;
      }
      merged.goals = goals;
    } else {
      merged[key] = patch[key];
    }
  }
  return cleanSettings(merged);
}
