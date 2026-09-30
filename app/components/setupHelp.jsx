"use client";

// Where to find each thing the dashboard asks for. Shared by the first-launch onboarding and
// the Settings page so the instructions never drift apart. Keep the steps and links accurate
// if Canvas, Google Calendar, Outlook, Gmail, or Resend change their pages.

const INK = "var(--ink)";
const MUTED = "var(--muted)";

export function Input({ value, onChange, type = "text", className = "", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      className={`w-full rounded-lg px-3 py-2 text-sm ${className}`}
      style={{ background: "var(--field)", color: INK }}
      {...rest}
    />
  );
}

export function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-link font-bold underline" style={{ color: INK }}>
      {children}
    </a>
  );
}

// The user's Canvas settings page, once they've typed their Canvas address.
export function canvasSettingsUrl(address) {
  const text = String(address || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? `${url.origin}/profile/settings` : "";
  } catch {
    return "";
  }
}

// Numbered steps. `inline` shows them directly (onboarding); otherwise they sit in a
// "How do I find this?" dropdown (Settings).
export function Help({ children, note, open = false, inline = false }) {
  const panel = (
    <div className="rounded-xl p-3 text-sm leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink-soft)" }}>
      <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>
      {note && (
        <p className="mt-2.5 text-xs" style={{ color: MUTED }}>
          {note}
        </p>
      )}
    </div>
  );
  if (inline) return panel;
  return (
    <details className="group" open={open}>
      <summary
        className="text-link inline-flex cursor-pointer list-none items-center gap-1 text-xs font-bold hover:underline"
        style={{ color: "var(--blue-fg)" }}
      >
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        How do I find this?
      </summary>
      <div className="mt-2">{panel}</div>
    </details>
  );
}

export function CanvasAddressHelp(props) {
  return (
    <Help {...props}>
      <li>Log in to Canvas in your browser the way you normally do.</li>
      <li>
        Look at the address bar and copy the first part, before any <b>/</b>. It usually looks like{" "}
        <b>yourschool.instructure.com</b>. Some schools use their own, like <b>canvas.yourschool.edu</b>. Either
        works.
      </li>
    </Help>
  );
}

export function TokenHelp({ canvasBaseUrl, ...props }) {
  const settingsUrl = canvasSettingsUrl(canvasBaseUrl);
  return (
    <Help
      note="Treat the token like a password: anyone who has it can see your Canvas. If you don't see + New Access Token, your school has turned tokens off for students, and the dashboard can't connect."
      {...props}
    >
      <li>
        {settingsUrl ? (
          <Ext href={settingsUrl}>Open your Canvas settings</Ext>
        ) : (
          <>
            In Canvas, click <b>Account</b> (your picture, top left), then <b>Settings</b>
          </>
        )}
        .
      </li>
      <li>
        Scroll down to <b>Approved Integrations</b> and click <b>+ New Access Token</b>.
      </li>
      <li>
        For <b>Purpose</b>, type &quot;School Dashboard&quot;. Leave <b>Expires</b> empty so it keeps working.
      </li>
      <li>
        Click <b>Generate Token</b> and copy the long token right away. Canvas only shows it once.
      </li>
    </Help>
  );
}

export function CalendarHelp(props) {
  return (
    <Help
      note="Keep this link private: anyone who has it can see that calendar. If it ever leaks, click Reset next to it in Google Calendar and paste the new one here. If you don't see a secret address, you may be using a school Google account that doesn't allow it; use your personal one."
      {...props}
    >
      <li>
        On a computer, open <Ext href="https://calendar.google.com/calendar/r/settings">Google Calendar settings</Ext>{" "}
        (the phone app doesn&apos;t have this).
      </li>
      <li>
        On the left, under <b>Settings for my calendars</b>, click the calendar you want.
      </li>
      <li>
        Scroll down to <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>. It ends in{" "}
        <b>.ics</b>.
      </li>
      <li>Paste it here. To add another calendar, save this one first, then add the next.</li>
    </Help>
  );
}

// Outlook.com (personal) and school/work Microsoft 365 accounts use the same steps on
// different sites. Schools can turn publishing off; then the option is missing.
export function OutlookHelp(props) {
  return (
    <Help
      note="Keep this link private: anyone who has it can see that calendar. To stop sharing, go back to the same page and click Unpublish. Outlook can take a few hours to show new events through this link. If Publish a calendar is missing on a school account, your school turned it off; use a personal calendar instead."
      {...props}
    >
      <li>
        On a computer, click <b>Open school Outlook</b> (or <b>personal Outlook.com</b>) above. It opens with whatever
        Microsoft account you&apos;re signed into. (Or in Outlook on the web: <b>Settings</b> (gear) → <b>Calendar</b> →{" "}
        <b>Shared calendars</b>.)
      </li>
      <li>
        Under <b>Publish a calendar</b>, pick your calendar and <b>Can view all details</b>, then click{" "}
        <b>Publish</b>.
      </li>
      <li>
        Copy the <b>ICS</b> link (not the HTML one). It ends in <b>.ics</b>.
      </li>
      <li>Paste it here.</li>
    </Help>
  );
}

export function GmailHelp(props) {
  return (
    <Help
      note="An app password lets this dashboard send email from your Gmail without knowing your real password. If App passwords says it isn't available, turn on 2-Step Verification first; school Google accounts sometimes block it, so use a personal Gmail. You can delete the app password anytime from the same page."
      {...props}
    >
      <li>
        Turn on <Ext href="https://myaccount.google.com/signinoptions/two-step-verification">2-Step Verification</Ext> for
        your Gmail. Skip this if it&apos;s already on.
      </li>
      <li>
        Open <Ext href="https://myaccount.google.com/apppasswords">App passwords</Ext> in your Google account.
      </li>
      <li>
        Type <b>School Dashboard</b> as the name and click <b>Create</b>.
      </li>
      <li>
        Copy the 16-letter password Google shows and paste it here. Google only shows it once.
      </li>
    </Help>
  );
}

export function ResendHelp(props) {
  return (
    <Help
      note="Without your own domain, Resend only delivers to the email you signed up with, so use that one for Send to."
      {...props}
    >
      <li>
        Make a free account at <Ext href="https://resend.com/signup">resend.com</Ext>, using the email you want the
        summary sent to.
      </li>
      <li>
        Go to <Ext href="https://resend.com/api-keys">API Keys</Ext> and click <b>Create API Key</b>.
      </li>
      <li>
        Name it &quot;School Dashboard&quot;, set <b>Permission</b> to <b>Sending access</b>, and click <b>Add</b>.
      </li>
      <li>
        Copy the key (it starts with <b>re_</b>). Resend only shows it once.
      </li>
    </Help>
  );
}
