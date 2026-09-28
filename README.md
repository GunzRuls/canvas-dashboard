# School Dashboard for Canvas

A dashboard that puts your Canvas assignments, grades, announcements, and class check-ins on one screen. It runs on your own Windows PC. Everything you enter is saved only on your computer, and your Canvas token is only ever sent to Canvas.

## What you need

- Windows 10 or 11
- [Node.js](https://nodejs.org) (the LTS version)
- Google Chrome or Microsoft Edge

## Install

1. Download this repo: green **Code** button → **Download ZIP**, then unzip it somewhere you'll keep it (like your Documents folder).
2. Double-click **Install.cmd** in the folder. It installs everything, puts a **School Dashboard** icon on your desktop, and opens the dashboard.
3. The first time it opens, it asks for:
   - **Your school's Canvas address**, like `yourschool.instructure.com`
   - **A Canvas access token**: in Canvas go to **Account → Settings → Approved Integrations → + New Access Token**, then copy it.

   Google Calendar and the morning email are optional. You can add them now or later from **Settings** on the dashboard.

If Windows shows "Windows protected your PC" when you run Install.cmd, click **More info → Run anyway**.

## Using it

- Open it from the **School Dashboard** icon on your desktop.
- Close the window when you're done. The dashboard stops in the background by itself shortly after.
- Change your Canvas token, Google Calendar, or email settings from the **Settings** button.
- If something goes wrong while starting, the details are in `launcher\server.log`.

## Reinstall or uninstall

- **Reinstall** (if something seems broken): double-click **Install.cmd** again, or use **Settings → Reinstall**. It starts fresh and keeps your settings.
- **Uninstall:** double-click **Uninstall.cmd**, or use **Settings → Uninstall**. It removes the desktop icon and installed files, then asks whether to keep your settings or delete the whole folder.
- After uninstalling, you can also delete your token in Canvas: **Account → Settings → Approved Integrations**.

## Optional features

- **Google Calendar:** in Google Calendar settings, open a calendar and copy **Secret address in iCal format**.
- **Morning email:** needs a free [Resend](https://resend.com) API key. Without your own verified domain, Resend only sends to the email you signed up with.

## Your data

These files stay in your dashboard folder and are never uploaded:

- `dashboard-config.json`: your Canvas address, token, and optional keys
- `dashboard-settings.json`: class names, colors, hidden classes, class times
- `dashboard-dismissed.json`: announcements and grades you've cleared

## For developers

Next.js (App Router), plain JavaScript, Tailwind v4. Run `npm run dev` (stop the desktop version first, since both use port 3000). Settings can also come from `.env.local` (see `.env.example`). Anything saved on the setup screen takes priority.
