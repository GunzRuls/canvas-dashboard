import { getConfig, isConfigured } from "@/lib/config";
import { readSettings } from "@/lib/settings";
import { readAllDismissed } from "@/lib/dismissed";
import { fromThisApp } from "@/lib/sameOrigin";
import { buildBackupPayload, encryptBackup, backupFileName, passwordProblem } from "@/lib/backup";

export const dynamic = "force-dynamic";

// "Move to another PC": returns your settings as a password-locked file to download (format in
// lib/backup.js). The password comes in the POST body only and is never logged or saved.
// Only the dashboard's own page may ask: the file holds your Canvas token (locked, but still).
export async function POST(request) {
  if (!fromThisApp(request)) {
    return Response.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  try {
    const { password } = await request.json().catch(() => ({}));
    const problem = passwordProblem(password);
    if (problem) return Response.json({ ok: false, error: problem }, { status: 400 });
    if (!isConfigured()) {
      return Response.json({ ok: false, error: "Connect Canvas first; there's nothing to back up yet." }, { status: 400 });
    }

    const config = getConfig(); // secrets decrypted here, then locked again with your password
    const payload = buildBackupPayload({ config, settings: await readSettings(), dismissed: await readAllDismissed() });
    const now = new Date();
    const file = await encryptBackup(payload, password, now);
    return new Response(JSON.stringify(file, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFileName(now, config.timezone)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // No details: the error could mention a setting.
    return Response.json({ ok: false, error: "Couldn't make the backup. Try again." }, { status: 500 });
  }
}
