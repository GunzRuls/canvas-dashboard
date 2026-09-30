// Which service a calendar link comes from, so Settings can label it ("Google Calendar",
// "Outlook") without ever sending the secret link itself to the browser.
export function calendarKind(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === "calendar.google.com") return "google";
  if (host.startsWith("outlook.") || host.endsWith(".outlook.com")) return "outlook";
  if (/\/feeds\/calendars\//.test(url)) return "canvas";
  return "other";
}

export const CALENDAR_LABELS = {
  google: "Google Calendar",
  outlook: "Outlook calendar",
  canvas: "Canvas calendar feed",
  other: "Calendar",
};

// What a linked calendar puts on the week strip: only events whose title mentions one of your
// classes (the default, so personal things stay off), or everything.
export const SHOW_OPTIONS = ["classes", "all"];

export function normalShow(value) {
  return SHOW_OPTIONS.includes(value) ? value : "classes";
}
