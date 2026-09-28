import { spawn } from "child_process";
import { fromThisApp } from "@/lib/sameOrigin";

// The Reinstall and Uninstall buttons in Settings. Each opens the matching script in its own
// window, where you confirm. Both stop this server, so the dashboard window goes blank after.
const SCRIPTS = { reinstall: "Install.cmd", uninstall: "Uninstall.cmd" };

export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const { action } = await request.json().catch(() => ({}));
  const script = SCRIPTS[action];
  if (!script) return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  if (process.platform !== "win32") {
    return Response.json({ ok: false, error: `Run ${script} from the dashboard folder.` }, { status: 400 });
  }

  // `start` gives the script its own visible window that keeps running after this server stops.
  // It runs in the project folder, where both scripts live.
  spawn("cmd.exe", ["/c", `start "" "${script}"`], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: true,
  }).unref();

  return Response.json({ ok: true });
}
