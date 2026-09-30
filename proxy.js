import { NextResponse } from "next/server";

// Security gate for every request, before any page or API route runs.
//
// The dashboard only listens on 127.0.0.1, so other devices can't reach it. What's left is
// websites open in your own browser, which can send requests to localhost:
//
// 1. DNS rebinding: a site can make its own name point at 127.0.0.1 so the browser treats it
//    as same-origin with the dashboard. Its requests then carry that site's name in the Host
//    header, so anything not addressed to localhost itself is refused.
// 2. Cross-site requests (CSRF): a site can submit forms or fetch() to localhost:3000 to mark
//    assignments done, delete to-dos, or change settings. Anything that isn't a plain read
//    must come from a dashboard page (Origin matches), or it's refused.
//
// Routes that change things also check the origin themselves (lib/sameOrigin.js).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);
// The "window is still open" ping. Harmless, and browsers may send it without an Origin
// while a window is closing (see app/components/KeepAlive.jsx).
const NO_ORIGIN_NEEDED = new Set(["/api/alive"]);

function hostname(host) {
  if (!host) return "";
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1).toLowerCase();
  return host.split(":")[0].toLowerCase();
}

function refuse(reason) {
  return new NextResponse(JSON.stringify({ ok: false, error: reason }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function proxy(request) {
  const host = request.headers.get("host") || "";
  if (!LOCAL_HOSTS.has(hostname(host))) return refuse("Not allowed.");

  if (!READ_ONLY.has(request.method) && !NO_ORIGIN_NEEDED.has(request.nextUrl.pathname)) {
    const origin = request.headers.get("origin");
    let originHost = "";
    try {
      originHost = origin ? new URL(origin).host : "";
    } catch {}
    if (!originHost || originHost !== host) return refuse("Not allowed.");
  }

  return NextResponse.next();
}
