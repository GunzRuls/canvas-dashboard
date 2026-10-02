// Links built from outside data (Canvas, calendars, GitHub, your settings file) only ever become
// real web links. Anything else, like "javascript:..." or "data:...", which could run code when
// clicked, becomes "" (no link). Pure, so the browser, the server, and tests can all use it.

// Returns the full http(s) address, or "" when `url` isn't one. With `base`, a relative path
// like "/courses/1" is resolved against it first.
export function safeUrl(url, base) {
  if (!url || typeof url !== "string") return "";
  try {
    const u = base ? new URL(url, base) : new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// True when `url` is on the same site (scheme, host and port) as `base`. Your Canvas token is
// only ever sent to the Canvas address you saved, never to a link Canvas hands back.
export function sameOrigin(url, base) {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

// Canvas ids are whole numbers. Checking them keeps a bad value from changing which Canvas
// address a request goes to (like "1/../../users/self").
export function canvasId(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(text)) throw new Error("That item id doesn't look right.");
  return text;
}
