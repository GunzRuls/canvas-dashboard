// True only for requests made by the dashboard's own pages. Routes that change settings or
// run programs use this so a website open in another tab can't trigger them.
export function fromThisApp(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
