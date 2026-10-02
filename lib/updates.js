import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { safeUrl } from "./safeUrl";

// Checks GitHub for a newer release of the installed app and installs it when you click Update.
// Only the installed app checks (the launcher sets DASHBOARD_INSTALL_DIR, and the release build
// sets DASHBOARD_VERSION). Running from the project folder, you update with git instead.

const REPO = "GunzRuls/canvas-dashboard";
const ASSET = "School-Dashboard-Setup.exe";
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const CHECK_EVERY = 12 * 60 * 60 * 1000;

const cache = (globalThis.__dashboardUpdate ??= { checkedAt: 0, latest: null });

export function currentVersion() {
  return process.env.DASHBOARD_VERSION || "";
}

export function updatesEnabled() {
  return Boolean(process.env.DASHBOARD_INSTALL_DIR && currentVersion());
}

// "1.10.0" is newer than "1.9.2". Anything after a "-" (like "-dev") is ignored.
function isNewer(latest, current) {
  const parts = (v) => String(v).replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function latestRelease() {
  if (cache.latest && Date.now() - cache.checkedAt < CHECK_EVERY) return cache.latest;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "School-Dashboard" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const release = await res.json();
  const asset = (release.assets || []).find((a) => a.name === ASSET);
  cache.latest = {
    version: String(release.tag_name || "").replace(/^v/, ""),
    url: asset?.browser_download_url || "",
    sha256: String(asset?.digest || "").replace(/^sha256:/, ""),
    notesUrl: safeUrl(release.html_url) || `https://github.com/${REPO}/releases/latest`,
  };
  cache.checkedAt = Date.now();
  return cache.latest;
}

export async function checkForUpdate() {
  if (!updatesEnabled()) return { available: false };
  const latest = await latestRelease();
  const available = Boolean(latest.url && isNewer(latest.version, currentVersion()));
  return { available, current: currentVersion(), latest: latest.version, notesUrl: latest.notesUrl };
}

// Downloads the new installer from this repo's release, checks it against GitHub's published
// SHA-256, and runs it with only a progress bar. The installer stops this server, updates the
// app, and opens the dashboard again. Saved settings are kept.
export async function installUpdate() {
  if (!updatesEnabled()) throw new Error("Updates only work in the installed app.");
  const latest = await latestRelease();
  if (!isNewer(latest.version, currentVersion())) throw new Error("You already have the latest version.");
  // Read as a real address first, so tricks like "/../" can't point outside this repo's releases.
  if (!safeUrl(latest.url).startsWith(DOWNLOAD_PREFIX)) throw new Error("Unexpected download address.");
  // No checksum from GitHub means nothing to check the download against, so don't run it.
  if (!/^[0-9a-f]{64}$/i.test(latest.sha256)) throw new Error("GitHub didn't list a checksum for this update. Download it yourself from the releases page.");

  const res = await fetch(safeUrl(latest.url), { headers: { "User-Agent": "School-Dashboard" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== latest.sha256.toLowerCase()) throw new Error("The download didn't match GitHub's checksum. Try again later.");

  // Remove installers left from earlier updates so they don't pile up (about 26 MB each).
  // The one for this update is removed the same way by the next update.
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (/^School-Dashboard-Setup-.*\.exe$/.test(name)) {
      try {
        fs.unlinkSync(path.join(os.tmpdir(), name));
      } catch {}
    }
  }

  const file = path.join(os.tmpdir(), `School-Dashboard-Setup-${latest.version.replace(/[^\w.-]/g, "")}.exe`);
  fs.writeFileSync(file, bytes);

  // `start` runs the installer in its own process so it keeps going after this server stops.
  spawn("cmd.exe", ["/c", `start "" "${file}" /SILENT /NORESTART`], {
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: true,
  }).unref();
  return { version: latest.version };
}
