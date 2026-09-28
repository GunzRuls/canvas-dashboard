import { noteAlive } from "@/lib/autoStop";

// Open dashboard windows check in here. `?closing=1` is sent when a window closes or reloads.
export async function POST(request) {
  noteAlive(new URL(request.url).searchParams.get("closing") === "1");
  return new Response(null, { status: 204 });
}
