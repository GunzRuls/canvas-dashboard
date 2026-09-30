import { execFile } from "child_process";
import path from "path";

// Creates, changes, or removes the daily Windows task that sends the morning email
// (launcher/schedule-digest.ps1). The task runs even when the dashboard is closed.

function launcherDir() {
  const root = process.env.DASHBOARD_INSTALL_DIR || process.cwd();
  return path.join(/*turbopackIgnore: true*/ root, "launcher");
}

// When the daily email task will next run (ISO time), or "" if there's no task.
// Settings shows this so it never claims emails are going out when they aren't.
export function nextDigestRun() {
  if (process.platform !== "win32") return Promise.resolve("");
  const command =
    "$t = Get-ScheduledTask -TaskName 'School Dashboard Morning Email' -ErrorAction SilentlyContinue; " +
    "if ($t) { ($t | Get-ScheduledTaskInfo).NextRunTime.ToString('o') }";
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true, timeout: 15000 }, (error, stdout) =>
      resolve(error ? "" : String(stdout).trim())
    );
  });
}

export function scheduleDigest({ sendTime, sendDays, enabled }) {
  if (process.platform !== "win32") return Promise.resolve("skipped");
  const days = enabled ? sendDays : "off";
  const script = path.join(/*turbopackIgnore: true*/ launcherDir(), "schedule-digest.ps1");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Time", sendTime, "-Days", days],
      { windowsHide: true, timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`Couldn't set up the daily email task. ${String(stderr || error.message).trim().slice(0, 200)}`));
        else resolve(String(stdout).trim());
      }
    );
  });
}
