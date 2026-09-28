"use client";

import { useEffect, useState } from "react";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const RELEASES_URL = "https://github.com/GunzRuls/canvas-dashboard/releases/latest";

// Saved tokens and keys are never sent to this page. For those, a blank box means "keep it".
export default function SetupForm({ saved, firstRun, installed, version, fixToken }) {
  const [canvasBaseUrl, setCanvasBaseUrl] = useState(saved.canvasBaseUrl);
  const [canvasToken, setCanvasToken] = useState("");
  const [calendarUrls, setCalendarUrls] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [digestToEmail, setDigestToEmail] = useState(saved.digestToEmail);
  const [digestFromEmail, setDigestFromEmail] = useState(saved.digestFromEmail);
  const [timezone, setTimezone] = useState(saved.timezone);
  const [clear, setClear] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // On first launch, start with this computer's time zone.
  useEffect(() => {
    if (!firstRun) return;
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || saved.timezone);
    } catch {}
  }, [firstRun, saved.timezone]);

  const hasCalendar = saved.calendarCount > 0 && !clear.includes("calendarUrls");
  const hasEmail = saved.hasResendKey && !clear.includes("resendApiKey");

  function remove(key) {
    setClear((c) => [...c, key]);
    if (key === "resendApiKey") {
      setResendApiKey("");
      setDigestToEmail("");
      setDigestFromEmail("");
    } else {
      setCalendarUrls("");
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasBaseUrl,
          canvasToken,
          calendarUrls,
          resendApiKey,
          digestToEmail,
          digestFromEmail,
          timezone,
          clear,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Couldn't save.");
      window.location.assign("/");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-10">
      {/* Stays at the top while you scroll, so there's always a clear way back. */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 px-4 pb-3 pt-4" style={{ background: "var(--bg)" }}>
        {firstRun ? (
          <div className="h-8" />
        ) : (
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-opacity hover:opacity-80"
            style={{ background: "var(--surface)", color: INK }}
          >
            <span aria-hidden="true">←</span> Back to dashboard
          </a>
        )}
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: INK }}>
        {firstRun ? "Welcome! Let's connect Canvas" : "Settings"}
      </h1>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Everything you enter is saved only on this computer. Your token is only ever sent to Canvas.
      </p>
      {fixToken && (
        <p className="mt-4 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
          Your Canvas token stopped working. Follow the steps under Access token to make a new one, paste it, and
          click Save.
        </p>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Section title="Canvas" note="Required">
          <Field
            label="Your school's Canvas address"
            help={
              <Help>
                <li>Log in to Canvas in your browser the way you normally do.</li>
                <li>
                  Look at the address bar and copy the first part, before any <b>/</b>. It usually looks like{" "}
                  <b>yourschool.instructure.com</b>. Some schools use their own, like <b>canvas.yourschool.edu</b>.
                  Either works.
                </li>
              </Help>
            }
          >
            <Input
              value={canvasBaseUrl}
              onChange={setCanvasBaseUrl}
              placeholder="yourschool.instructure.com"
              required
              autoFocus={firstRun}
            />
          </Field>
          <Field
            label="Access token"
            help={
              <Help open={fixToken} note="Treat the token like a password: anyone who has it can see your Canvas. If you don't see + New Access Token, your school has turned tokens off for students, and the dashboard can't connect.">
                <li>
                  {canvasSettingsUrl(canvasBaseUrl) ? (
                    <Ext href={canvasSettingsUrl(canvasBaseUrl)}>Open your Canvas settings</Ext>
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
                  For <b>Purpose</b>, type &quot;School Dashboard&quot;. Leave <b>Expires</b> empty so it keeps
                  working.
                </li>
                <li>
                  Click <b>Generate Token</b> and copy the long token right away. Canvas only shows it once.
                </li>
              </Help>
            }
          >
            <Input
              type="password"
              value={canvasToken}
              onChange={setCanvasToken}
              placeholder={fixToken ? "Paste your new token" : saved.tokenEnding ? `Saved (ends in ${saved.tokenEnding}). Leave blank to keep it.` : "Paste your token"}
              required={!saved.tokenEnding || fixToken}
              autoFocus={fixToken}
            />
          </Field>
        </Section>

        <Section
          title="Google Calendar"
          note="Optional"
          open={hasCalendar}
          status={hasCalendar ? `${saved.calendarCount} calendar${saved.calendarCount === 1 ? "" : "s"} linked` : ""}
          onRemove={hasCalendar ? () => remove("calendarUrls") : null}
        >
          <p className="text-sm" style={{ color: MUTED }}>
            Shows your events in the week strip and helps find class times.
          </p>
          <Field
            label="Secret calendar link"
            help={
              <Help note="Keep this link private: anyone who has it can see that calendar. If it ever leaks, click Reset next to it in Google Calendar and paste the new one here. If you don't see a secret address, you may be using a school Google account that doesn't allow it; use your personal one.">
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
                <li>Paste it here. For more than one calendar, separate the links with commas.</li>
              </Help>
            }
          >
            <Input
              type="password"
              value={calendarUrls}
              onChange={setCalendarUrls}
              placeholder={hasCalendar ? "Leave blank to keep your saved links" : "https://calendar.google.com/calendar/ical/…"}
            />
          </Field>
        </Section>

        <Section
          title="Morning email"
          note="Optional"
          open={hasEmail}
          status={hasEmail ? `On, sending to ${saved.digestToEmail}` : ""}
          onRemove={hasEmail ? () => remove("resendApiKey") : null}
        >
          <p className="text-sm" style={{ color: MUTED }}>
            Emails you what&apos;s due each morning, using a free Resend account.
          </p>
          <Field
            label="Resend API key"
            help={
              <Help note="Without your own domain, Resend only delivers to the email you signed up with, so use that one below. Leave Send from blank unless you verified a domain in Resend.">
                <li>
                  Make a free account at <Ext href="https://resend.com/signup">resend.com</Ext>, using the email you
                  want the summary sent to.
                </li>
                <li>
                  Go to <Ext href="https://resend.com/api-keys">API Keys</Ext> and click <b>Create API Key</b>.
                </li>
                <li>
                  Name it &quot;School Dashboard&quot;, set <b>Permission</b> to <b>Sending access</b>, and click{" "}
                  <b>Add</b>.
                </li>
                <li>
                  Copy the key (it starts with <b>re_</b>). Resend only shows it once.
                </li>
              </Help>
            }
          >
            <Input
              type="password"
              value={resendApiKey}
              onChange={setResendApiKey}
              placeholder={hasEmail ? "Saved. Leave blank to keep it." : "re_…"}
            />
          </Field>
          <Field label="Send to">
            <Input type="email" value={digestToEmail} onChange={setDigestToEmail} placeholder="you@example.com" />
          </Field>
          <Field label="Send from (only if you verified a domain in Resend)">
            <Input value={digestFromEmail} onChange={setDigestFromEmail} placeholder="School Dashboard <onboarding@resend.dev>" />
          </Field>
        </Section>

        <Section title="Time zone" note="Used for the morning email">
          <Input value={timezone} onChange={setTimezone} placeholder="America/New_York" aria-label="Time zone" />
          <p className="text-xs" style={{ color: MUTED }}>
            Filled in from your computer. Names look like America/New_York or America/Chicago.
          </p>
        </Section>

        {error && (
          <p role="alert" className="rounded-xl px-4 py-3 text-sm font-bold" style={{ background: "var(--red-bg)", color: "var(--red-fg)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full px-5 py-2 text-sm font-bold transition-opacity disabled:opacity-60"
            style={{ background: "var(--inverse)", color: "var(--inverse-fg)" }}
          >
            {saving ? "Checking with Canvas…" : firstRun ? "Connect and open dashboard" : "Save"}
          </button>
        </div>
      </form>

      {!firstRun && <Maintenance installed={installed} version={version} />}
    </main>
  );
}

// Reinstall and uninstall run as scripts in their own window (Install.cmd / Uninstall.cmd).
function Maintenance({ installed, version }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action, question) {
    if (!window.confirm(question)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Couldn't start it.");
      setMessage("Continue in the window that just opened. You can close this one.");
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl p-5" style={{ background: "var(--surface)" }}>
      <span className="text-lg font-extrabold" style={{ color: INK }}>
        {installed ? "Update or uninstall" : "Reinstall or uninstall"}
      </span>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        {installed
          ? `${version ? `You have version ${version}. ` : ""}When a new version is out, an Update button appears at the top of the dashboard. Uninstall asks whether to keep your settings.`
          : "Reinstall starts fresh if something seems broken and keeps your settings. Uninstall removes the desktop icon and installed files, then asks whether to keep your settings."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {installed ? (
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-4 py-1.5 text-sm font-bold"
            style={{ background: "var(--surface-2)", color: INK }}
          >
            Get the latest version
          </a>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("reinstall", "Reinstall the dashboard? It closes, reinstalls, and opens again. This takes a few minutes.")}
            className="rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-60"
            style={{ background: "var(--surface-2)", color: INK }}
          >
            Reinstall
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run("uninstall", "Open the uninstaller? You'll confirm each step in its window.")}
          className="rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-60"
          style={{ background: "var(--red-bg)", color: "var(--red-fg)" }}
        >
          Uninstall…
        </button>
      </div>
      {message && (
        <p className="mt-3 text-sm font-bold" style={{ color: INK }}>
          {message}
        </p>
      )}
    </section>
  );
}

function Section({ title, note, open = true, status, onRemove, children }) {
  const body = <div className="mt-3 flex flex-col gap-3">{children}</div>;
  const heading = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className="text-lg font-extrabold" style={{ color: INK }}>
        {title}
      </span>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        {note}
      </span>
      {status && (
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--green-bg)", color: "var(--green-fg)" }}>
          {status}
        </span>
      )}
    </span>
  );

  return (
    <section className="rounded-2xl p-5" style={{ background: "var(--surface)" }}>
      {note === "Optional" ? (
        <details open={open}>
          <summary className="cursor-pointer list-none">{heading}</summary>
          {body}
          {onRemove && (
            <button type="button" onClick={onRemove} className="mt-3 text-xs font-bold hover:underline" style={{ color: "var(--red-fg)" }}>
              Turn off and remove saved {title === "Google Calendar" ? "links" : "key"}
            </button>
          )}
        </details>
      ) : (
        <>
          {heading}
          {body}
        </>
      )}
    </section>
  );
}

// `help` sits outside the <label> so clicking its links doesn't jump to the text box.
function Field({ label, help, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold" style={{ color: INK }}>
          {label}
        </span>
        {children}
      </label>
      {help}
    </div>
  );
}

// A "How do I find this?" dropdown with numbered steps.
function Help({ children, note, open = false }) {
  return (
    <details className="group" open={open}>
      <summary
        className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-bold hover:underline"
        style={{ color: "var(--blue-fg)" }}
      >
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        How do I find this?
      </summary>
      <div className="mt-2 rounded-xl p-3 text-sm leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink-soft)" }}>
        <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>
        {note && (
          <p className="mt-2.5 text-xs" style={{ color: MUTED }}>
            {note}
          </p>
        )}
      </div>
    </details>
  );
}

function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-bold underline" style={{ color: INK }}>
      {children}
    </a>
  );
}

// The user's Canvas settings page, once they've typed their Canvas address.
function canvasSettingsUrl(address) {
  const text = String(address || "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? `${url.origin}/profile/settings` : "";
  } catch {
    return "";
  }
}

function Input({ value, onChange, type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      className="w-full rounded-lg px-3 py-2 text-sm"
      style={{ background: "var(--field)", color: INK }}
      {...rest}
    />
  );
}
