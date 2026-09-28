@AGENTS.md

# School Dashboard for Canvas: project context

A local Next.js (App Router, plain JavaScript, Tailwind v4) dashboard that pulls a student's Canvas data into one screen. It runs on the user's own Windows PC, never deployed publicly. Owner: Jojo (GitHub: GunzRuls), a Florida Poly student. The repo is public so classmates can use it.

## How it runs

- Classmates install with `School-Dashboard-Setup.exe` from GitHub Releases. `.github/workflows/release.yml` (on release published, or manual dispatch → artifact) runs `npm ci`, `BUILD_STANDALONE=1 npm run build` (standalone output only in that mode, see `next.config.mjs`), fails if `.env*`/`dashboard-*.json`/logs are in `.next/standalone`, downloads the matching `node.exe` and checks its SHA256, then compiles `installer/setup.iss` (Inno Setup) and attaches the .exe. Installed layout under `%LOCALAPPDATA%\Programs\School Dashboard`: `node\node.exe`, `app\` (standalone + `.next\static`), `launcher\` (start/stop scripts, icon), `unins000.exe`. Per-user install, no admin. Never change the `AppId` GUID in setup.iss (Windows uses it to match updates).
- Installed mode: `start-dashboard.ps1` detects `node\node.exe` + `app\server.js` and runs node with the full server.js path (so `stop-dashboard.ps1` can match it), with `HOSTNAME=127.0.0.1`, `PORT=3000`, `DASHBOARD_AUTO_STOP=1`, `DASHBOARD_DATA_DIR=%APPDATA%\School Dashboard` (personal files + `server.log`), `DASHBOARD_INSTALL_DIR`. `lib/dataDir.js` resolves personal file paths (falls back to the project folder); its `/*turbopackIgnore: true*/` comment prevents whole-project tracing, and `outputFileTracingExcludes` is a second guard. Don't use a bare `"**"` key there: it dropped Next's own route runtime from the trace. In Settings, installed mode shows "Get the latest version" (releases link) instead of Reinstall, and Uninstall runs `unins000.exe`, which asks whether to delete the AppData folder.
- Running from source: double-click `Install.cmd` (checks Node, stops a running server via `launcher/stop-dashboard.ps1`, deletes `.next`, `npm ci`, runs `launcher/create-shortcut.ps1` for the desktop icon, then launches). Rerunning it is the clean reinstall; settings files are kept. A prebuilt .lnk can't be shipped because shortcuts hold absolute paths.
- `Uninstall.cmd` → `launcher/uninstall.ps1`: stops the server, removes the desktop shortcut only if it points at this folder, then either deletes the whole folder (a hidden PowerShell waits for the uninstall window's process to exit first) or removes `node_modules`/`.next`/log and optionally the personal files. `stop-dashboard.ps1` only kills node.exe processes whose command line contains this folder's path.
- Settings has Reinstall / Uninstall buttons: `POST /api/maintenance` (same-origin only, `lib/sameOrigin.js`) runs `start "" Install.cmd|Uninstall.cmd` detached so the script outlives the server it stops.
- The app icon (`app/favicon.ico`, `app/icon.png`) is the same art as `launcher/dashboard.ico`; Chrome/Edge `--app` windows use it for the taskbar button.
- `.gitattributes` forces CRLF for `*.cmd`/`*.ps1` so GitHub ZIP downloads run correctly.
- Normal use is production mode through the desktop launcher (`launcher/start-dashboard.ps1`): it checks port 3000, rebuilds only if `app/`, `lib/`, `instrumentation.js` or `package.json` are newer than `.next/BUILD_ID`, then runs `npm run build && npm run start` in a hidden cmd (output to `launcher/server.log`, gitignored) with `DASHBOARD_AUTO_STOP=1`, shows a small WinForms "Starting..." box meanwhile, and opens Chrome or Edge with `--app=http://localhost:3000`.
- Auto-stop: `instrumentation.js` starts `lib/autoStop.js` only when `DASHBOARD_AUTO_STOP=1`. Every page (via `app/components/KeepAlive.jsx` in the layout) POSTs `/api/alive` every 20 s and sends `?closing=1` on pagehide. The server exits 45 s after a close with no further check-in, or after 10 min of silence (minimized windows can be throttled). A long gap between ticks (PC asleep) resets the clock. Plain `npm run start`/`npm run dev` never auto-stop.
- The server binds to 127.0.0.1 only (`-H 127.0.0.1` in both scripts) so nobody on the same Wi-Fi can reach it. Keep it that way; `/api/config` can change where the token is sent.
- For development use `npm run dev` (stop the launcher's server first).
- PowerShell on this machine needed `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` for npm/npx.

## Configuration (setup screen, never commit)

On first launch `app/page.js` redirects to `/setup` until a Canvas address and token exist. `/setup` doubles as the Settings screen (Settings button in the top bar). Canvas is required; Google Calendar and Resend are optional. `lib/config.js` is the only place settings are read: `getConfig()` reads `dashboard-config.json` (gitignored) fresh on each call, falling back per key to `.env.local` (`CANVAS_BASE_URL`, `CANVAS_TOKEN`, `GOOGLE_CALENDAR_ICS_URL`, `RESEND_API_KEY`, `DIGEST_TO_EMAIL`, `DIGEST_FROM_EMAIL`, `DASHBOARD_TIMEZONE`). Changes apply without a restart. `CRON_SECRET` stays env-only. Features hide themselves when their settings are missing.

`POST /api/config` rules: rejects requests whose Origin doesn't match the Host; checks the token against `/api/v1/users/self` and calendar links for `BEGIN:VCALENDAR` before saving; a blank secret field means keep the saved value; changing the Canvas address requires re-entering the token (so a saved token is never sent to a new host). The browser only ever gets `publicConfig()` (token's last 4 characters, calendar count, whether a Resend key exists).

Resend note: without a verified domain, Resend only delivers to the email the Resend account was created with.

## Architecture

The token only ever lives on the server. Pattern: browser → our API routes / server components → Canvas.

- `lib/canvas.js`: every Canvas call. `canvasFetch` adds the Bearer token; `canvasGetAll` follows the `Link: rel="next"` pagination. Reads: courses with `include[]=total_scores`, Planner items (`/api/v1/planner/items`, 21 days back to 90 ahead; announcements and calendar events excluded), announcements (45 days), course tabs (to find the A+ Attendance external tool link), recent grades (`/students/submissions?student_ids[]=self&graded_since=...`, 10 days), Canvas calendar events for class sessions, assignment groups for what-if. Writes: planner overrides (marked_complete), planner notes (create/delete), mark announcement read.
- `lib/loadDashboard.js`: the single loader used by both `app/page.js` and the email route. Applies settings, removes hidden classes, drops dismissed announcements, links announcements to matching cards, filters seen grades, builds class sessions (Canvas calendar plus Google events whose title contains the course code or name).
- `lib/settings.js`: `dashboard-settings.json` (gitignored): hidden class ids, display names, colors, manual attendance links, manual class times (`{days:[0-6], start:"HH:MM", end:"HH:MM"}`).
- `lib/dismissed.js`: `dashboard-dismissed.json` (gitignored): `announcements` (ids marked Done) and `grades` (seen grade keys `assignmentId:gradedAt`). Writes are serialized through a promise queue.
- `lib/linking.js`: attaches an announcement to a board card when the card title appears as whole words in the announcement title, same course, title at least 5 chars.
- `lib/gradeMath.js`: mirrors Canvas "current grade" (only graded or what-if work counts; weighted courses only count groups with graded work). `scoreNeeded` (one assignment) and `averageNeeded` (uniform % on everything left) solve linearly between 0 and full points. Drop-lowest rules are NOT applied.
- `lib/calendar.js`: Google iCal via `node-ical` `expandRecurringEvent` (handles recurrence, EXDATE, moved instances, DST). All-day events are passed as "YYYY-MM-DD" strings.
- `lib/digest.js`: morning email HTML (overdue, today, tomorrow, rest of week, new announcements). Grades and calendar were intentionally removed at the user's request.
- `lib/palette.js`: the 8 course colors.
- `app/components/Dashboard.jsx`: main client component (board, grade tiles, announcements, Smart Check in, theme toggle, toasts). `WeekStrip.jsx`, `QuickAdd.jsx`, `WhatIfPanel.jsx`, `ManageClasses.jsx`.
- API routes in `app/api/`: `planner`, `notes`, `announcements/read`, `announcements/dismiss`, `grades/seen`, `settings`, `whatif`, `digest` (GET for cron with optional CRON_SECRET, POST for the button).

## Behavior decisions (keep these)

- Board columns: To do / In progress / Done. Only moves into or out of Done touch Canvas (planner override). "In progress" is local only (localStorage key `dashboard-in-progress`). Initial status: override wins, then `submissions.submitted` means Done.
- Class names, not course codes, are shown everywhere; codes appear only as small secondary labels.
- Layout is one screen on desktop (xl): top bar, 7-day strip, then grades sidebar | board | announcements, each panel scrolling on its own. The user disliked long vertical pages.
- Announcements: Done hides and marks read; Clear all respects the class filter; Undo toast for 7 seconds.
- Smart Check in: live from 15 minutes before a session until it ends; manual class times override calendar data for that class; otherwise shows the next session today.
- Grade tile: clicking the tile filters the page; the class name link opens the Canvas course home; new grades show in the tile with Got it.
- Theme: CSS variables in `app/globals.css` (light default, dark via `prefers-color-scheme` or `data-theme`). A script in `app/layout.js` applies the saved `dashboard-theme` before paint. Use the variables (`var(--ink)`, `var(--surface)`, `var(--red-bg)`, etc.), never new hard-coded grays.
- Course colors are applied with inline styles (dynamic Tailwind class names would not compile).
- Relative times and dates render only after mount (`now` state) to avoid hydration mismatches and to use the browser's timezone.

## Features the user considered and declined

Auto-start with Windows, desktop notifications (Canvas already notifies), study-time finder, per-class quick-link rows (too crowded), Canvas inbox count, Sunday week-ahead email. Don't re-propose these unless asked.

## Working with the user

- Explain changes plainly and briefly; he is learning as he goes.
- Before committing, confirm `.env.local` and the three dashboard-*.json files (config, settings, dismissed) are not staged.
- After changes, remind him to close the dashboard window, wait about a minute for the server to stop, and reopen from the desktop icon (the launcher rebuilds automatically).
