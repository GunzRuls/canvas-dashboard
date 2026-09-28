# School Dashboard for Canvas

A dashboard that puts your Canvas assignments, grades, announcements, and class check-ins on one screen. It runs on your own Windows PC. Your Canvas token stays on your computer and is never sent anywhere except Canvas.

## What you need

- Windows 10 or 11
- [Node.js](https://nodejs.org) (the LTS version)
- Google Chrome or Microsoft Edge

## Setup

1. Download this repo (green **Code** button → **Download ZIP**, then unzip it) or `git clone` it.
2. Open PowerShell in the project folder and install the dependencies:

   ```powershell
   npm install
   ```

   If PowerShell says running scripts is disabled, run this once and try again:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```

3. Make a Canvas access token: in Canvas go to **Account → Settings → Approved Integrations → + New Access Token**. Copy it.
4. Copy `.env.example` to a new file named `.env.local` and fill in:
   - `CANVAS_BASE_URL`: your school's Canvas address, like `https://yourschool.instructure.com`
   - `CANVAS_TOKEN`: the token from step 3

   The other settings are optional. Features that need them stay hidden until you add them.

5. Create the desktop icon:

   ```powershell
   powershell -ExecutionPolicy Bypass -File launcher\create-shortcut.ps1
   ```

6. Double-click **School Dashboard** on your desktop. The first start takes a minute while it builds.

## Using it

- Closing the dashboard window does not stop it. To stop it, close the minimized **School Dashboard** window on your taskbar.
- After changing `.env.local`, stop it and open it again from the desktop icon.
- Your class settings and dismissed items are saved in `dashboard-settings.json` and `dashboard-dismissed.json` in the project folder. They are personal and are not uploaded.

## Optional features

- **Google Calendar:** in Google Calendar settings, copy the "Secret address in iCal format" into `GOOGLE_CALENDAR_ICS_URL`. Separate several links with commas.
- **Morning email:** add a [Resend](https://resend.com) API key as `RESEND_API_KEY` and your email as `DIGEST_TO_EMAIL`. Without your own verified domain, Resend only sends to the email you signed up with.

## For developers

Next.js (App Router), plain JavaScript, Tailwind v4. Run `npm run dev` for development (stop the desktop version first, since both use port 3000).
