# School Dashboard for Canvas

A dashboard that puts your Canvas assignments, grades, announcements, and class check-ins on one screen. It runs on your own Windows PC. Everything you enter is saved only on your computer, and your Canvas token is only ever sent to Canvas.

## Install

You need Windows 10 or 11 and Google Chrome or Microsoft Edge. Nothing else.

1. Go to the [latest release](https://github.com/GunzRuls/canvas-dashboard/releases/latest) and download **School-Dashboard-Setup.exe**.
2. Open it and click through the installer. No administrator password is needed.

   Windows may say "Windows protected your PC" because the installer isn't from a big company. Click **More info → Run anyway**.

3. The first time the dashboard opens, it asks for:
   - **Your school's Canvas address**, like `yourschool.instructure.com`
   - **A Canvas access token**: in Canvas go to **Account → Settings → Approved Integrations → + New Access Token**, then copy it.

   Google Calendar and the morning email are optional. You can add them now or later from **Settings** on the dashboard.

## Using it

- Open it from the **School Dashboard** icon on your desktop or in the Start menu.
- Close the window when you're done. The dashboard stops in the background by itself shortly after.
- Change your Canvas token, Google Calendar, or email settings from the **Settings** button.

## Update or uninstall

- **Update:** when a new version is out, an **Update to x.y.z** button appears at the top of the dashboard. Click it and the dashboard updates and reopens by itself. Your settings are kept. You can also download the newest **School-Dashboard-Setup.exe** from the [latest release](https://github.com/GunzRuls/canvas-dashboard/releases/latest) and run it.
- **Uninstall:** Windows **Settings → Apps → Installed apps → School Dashboard → Uninstall**, or **Settings → Uninstall** in the dashboard. It asks whether to keep your saved settings.
- After uninstalling, you can also delete your token in Canvas: **Account → Settings → Approved Integrations**.

## Optional features

- **Google Calendar:** in Google Calendar settings, open a calendar and copy **Secret address in iCal format**.
- **Morning email:** needs a free [Resend](https://resend.com) API key. Without your own verified domain, Resend only sends to the email you signed up with.

## Your data

Your settings are saved in `%APPDATA%\School Dashboard` and are never uploaded:

- `dashboard-config.json`: your Canvas address, token, and optional keys
- `dashboard-settings.json`: class names, colors, hidden classes, class times
- `dashboard-dismissed.json`: announcements and grades you've cleared
- `server.log`: details if the dashboard fails to start

## For developers

Next.js (App Router), plain JavaScript, Tailwind v4.

- **Run from source:** install [Node.js](https://nodejs.org) (LTS), then double-click **Install.cmd** (or run `npm ci`). The desktop icon then runs this folder, rebuilding when code changes, and personal files are kept in the folder itself. **Uninstall.cmd** removes it. For development, run `npm run dev` (stop the desktop version first, since both use port 3000). Settings can also come from `.env.local` (see `.env.example`); anything saved on the setup screen takes priority.
- **Release a new installer:** on GitHub, **Releases → Draft a new release**, create a tag with a higher number than the last one (like `v1.1.0`), and publish. The tag becomes the app's version, and installed copies offer the update the next time they open. The **Build installer** workflow builds `School-Dashboard-Setup.exe` and attaches it to the release in a few minutes. You can also run the workflow by hand from the **Actions** tab to get a test build.
