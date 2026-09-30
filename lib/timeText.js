// Typing a class time as text: "4", "4:30", "430", "4p", "4:30 pm", "16:00" all work.
// Saved as "HH:MM" (24-hour); shown as "4:30 PM".

// Without AM/PM, a bare hour is guessed the way class times usually go:
// 7-11 is morning, 12 is noon, 1-6 is afternoon or evening.
export function parseTimeText(input) {
  const text = String(input || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  if (!text) return "";
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?(a|am|p|pm)?$/) || text.match(/^(\d{1,2})(\d{2})(a|am|p|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const half = m[3] ? m[3][0] : "";
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half === "a") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  } else if (hour >= 1 && hour <= 6) {
    hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "16:30" -> "4:30 PM"
export function formatTimeText(hhmm) {
  const m = String(hhmm || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return "";
  const hour = Number(m[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m[2]} ${suffix}`;
}
