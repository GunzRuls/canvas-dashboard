import { spawn } from "child_process";
import { fromThisApp } from "@/lib/sameOrigin";

// The Reinstall and Uninstall buttons in Settings. Each opens the matching script in its own
// window, where you confirm. Both stop this server, so the dashboard window goes blank after.
// In the installed app (DASHBOARD_INSTALL_DIR is set by the launcher), Uninstall runs the
// Windows uninstaller instead, and reinstalling means running the latest installer.
const SCRIPTS = { reinstall: "Install.cmd", uninstall: "Uninstall.cmd" };

export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const { action } = await request.json().catch(() => ({}));
  if (!SCRIPTS[action]) return Response.json({ ok: false, error: "Unknown action." }, { status: 400 });
  if (process.platform !== "win32") {
    return Response.json({ ok: false, error: `Run ${SCRIPTS[action]} from the dashboard folder.` }, { status: 400 });
  }

  const installDir = process.env.DASHBOARD_INSTALL_DIR;
  let target = SCRIPTS[action];
  let cwd = process.cwd();
  if (installDir) {
    if (action !== "uninstall") {
      return Response.json({ ok: false, error: "Download and run the latest installer to reinstall." }, { status: 400 });
    }
    target = "unins000.exe"; // written by the installer next to the app
    cwd = installDir;
  }

  // `start` gives it its own window that keeps running after this server stops.
  spawn("cmd.exe", ["/c", `start "" "${target}"`], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: true,
  }).unref();

  return Response.json({ ok: true });
}
