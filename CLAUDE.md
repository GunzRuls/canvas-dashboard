@AGENTS.md

# School Dashboard for Canvas: project context

A local Next.js (App Router, plain JavaScript, Tailwind v4) dashboard that pulls a student's Canvas data into one screen. It runs on the user's own Windows PC, never deployed publicly. Owner: Jojo (GitHub: GunzRuls), a Florida Poly student. The repo is public so classmates can use it.

## How it runs

- Normal use is production mode through the desktop launcher (`launcher/start-dashboard.ps1`): it checks port 3000, rebuilds only if files in `app/` or `lib/` are newer than `.next/BUILD_ID`, then runs `npm run build && npm run start` in a minimized cmd window titled "School Dashboard", and opens Chrome or Edge with `--app=http://localhost:3000`.
- Closing the app window does NOT stop the server; closing the minimized cmd window does. After changing `.env.local`, the server must be restarted. If `npm run dev` is also running, the launcher just opens the old server on port 3000.
- For development use `npm run dev` (stop the launcher's server first).
- PowerShell on this machine needed `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` for npm/npx.

## Environment (.env.local, never commit)

`CANVAS_BASE_URL`, `CANVAS_TOKEN` (required). Optional: `GOOGLE_CALENDAR_ICS_URL` (comma-separated secret iCal links), `RESEND_API_KEY` + `DIGEST_TO_EMAIL` (+ optional `DIGEST_FROM_EMAIL`), `DASHBOARD_TIMEZONE` (default America/New_York), `CRON_SECRET`. Features hide themselves when their variables are missing. See `.env.example`.

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
- Before committing, confirm `.env.local` and the two dashboard-*.json files are not staged.
- After changes, remind him to close the "School Dashboard" server window and reopen from the desktop icon (the launcher rebuilds automatically).
