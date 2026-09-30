"use client";

import { useEffect, useState } from "react";
import { Input, CanvasAddressHelp, TokenHelp, CalendarHelp, GmailHelp, ResendHelp } from "./setupHelp";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const RELEASES_URL = "https://github.com/GunzRuls/canvas-dashboard/releases/latest";

// "Thu 7:00 AM" from the task's next run time.
function nextEmailLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// Saved tokens and keys are never sent to this page. For those, a blank box means "keep it".
export default function SetupForm({ saved, firstRun, installed, version, fixToken, emailOn, nextEmail }) {
  const [canvasBaseUrl, setCanvasBaseUrl] = useState(saved.canvasBaseUrl);
  const [canvasToken, setCanvasToken] = useState("");
  const [calendarUrls, setCalendarUrls] = useState("");
  const [emailProvider, setEmailProvider] = useState(saved.emailProvider || "gmail");
  const [gmailAddress, setGmailAddress] = useState(saved.gmailAddress);
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [digestToEmail, setDigestToEmail] = useState(saved.digestToEmail);
  const [digestFromEmail, setDigestFromEmail] = useState(saved.digestFromEmail);
  const [sendTime, setSendTime] = useState(saved.sendTime || "07:00");
  const [sendDays, setSendDays] = useState(saved.sendDays || "weekdays");
  const [emailOff, setEmailOff] = useState(!emailOn);
  const [timezone, setTimezone] = useState(saved.timezone);
  const [clear, setClear] = useState([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, text }
  const [error, setError] = useState("");

  // On first launch, start with this computer's time zone.
  useEffect(() => {
    if (!firstRun) return;
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || saved.timezone);
    } catch {}
  }, [firstRun, saved.timezone]);

  const hasCalendar = saved.calendarCount > 0 && !clear.includes("calendarUrls");
  const hasGmailPassword = saved.hasGmailPassword && !clear.includes("gmailAppPassword");
  const hasResendKey = saved.hasResendKey && !clear.includes("resendApiKey");

  function remove(key) {
    setClear((c) => [...c, key]);
    setCalendarUrls("");
  }

  // Turning the email off forgets the app password and Resend key too.
  function turnOffEmail() {
    setEmailOff(true);
    setClear((c) => [...c, "gmailAppPassword", "resendApiKey"]);
    setGmailAppPassword("");
    setResendApiKey("");
    setTestResult(null);
  }

  // Saves everything. Returns the server's answer, or null (with the error shown) if it failed.
  async function save() {
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasBaseUrl,
          canvasToken,
          calendarUrls,
          emailProvider: emailOff ? "" : emailProvider,
          gmailAddress,
          gmailAppPassword,
          resendApiKey,
          digestToEmail,
          digestFromEmail,
          sendTime,
          sendDays,
          timezone,
          clear,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Couldn't save.");
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const data = await save();
    if (data?.scheduleWarning) {
      setError(`Saved, but ${data.scheduleWarning}`);
      setSaving(false);
    } else if (data) {
      window.location.assign("/");
    } else {
      setSaving(false);
    }
  }

  // Saves first (so Gmail checks the app password), then sends one right now.
  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    const data = await save();
    if (data) {
      try {
        const res = await fetch("/api/digest", { method: "POST" });
        const sent = await res.json();
        if (!sent.ok) throw new Error(sent.error || "The email didn't send.");
        setTestResult({ ok: true, text: `Test email sent to ${sent.to}. If it's not in your inbox, check spam and mark it "Not spam" once.` });
        setGmailAppPassword("");
      } catch (err) {
        setTestResult({ ok: false, text: err.message });
      }
    }
    setTesting(false);
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
            className="btn btn-secondary h-10 px-3.5 text-sm"
          >
            <span aria-hidden="true">←</span> Back to dashboard
          </a>
        )}
      </div>
      <h1 className="font-display text-3xl font-extrabold tracking-tight" style={{ color: INK }}>
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
            help={<CanvasAddressHelp />}
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
            help={<TokenHelp canvasBaseUrl={canvasBaseUrl} open={fixToken} />}
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
            help={<CalendarHelp />}
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
          open={emailOn}
          status={emailOn && !emailOff && nextEmail ? `On · next one ${nextEmailLabel(nextEmail)}` : ""}
          warning={emailOn && !emailOff && !nextEmail ? "Not scheduled yet. Click Save to start daily emails." : ""}
          onRemove={!emailOff ? turnOffEmail : null}
          removeLabel="Turn off morning email"
        >
          {emailOff ? (
            <>
              <p className="text-sm" style={{ color: MUTED }}>
                A short list of what&apos;s due, sent to you every morning. It sends even with the dashboard closed, as
                long as your PC is on.
              </p>
              <button
                type="button"
                onClick={() => setEmailOff(false)}
                className="btn btn-soft self-start px-4 py-2 text-sm"
              >
                Set up morning email
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-1 self-start rounded-xl p-1" style={{ background: "var(--surface-2)" }} role="radiogroup" aria-label="Send with">
                {[
                  ["gmail", "Gmail (recommended)"],
                  ["resend", "Resend"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={emailProvider === value}
                    onClick={() => setEmailProvider(value)}
                    className="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors hover:text-[var(--ink)]"
                    style={emailProvider === value ? { background: "var(--surface)", color: INK } : { color: MUTED }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {emailProvider === "gmail" ? (
                <>
                  <p className="text-sm" style={{ color: MUTED }}>
                    Sent from your own Gmail, free, with no extra accounts. It can go to any inbox, like your school
                    email.
                  </p>
                  <Field label="Your Gmail address">
                    <Input type="email" value={gmailAddress} onChange={setGmailAddress} placeholder="you@gmail.com" />
                  </Field>
                  <Field label="Gmail app password" help={<GmailHelp open={!hasGmailPassword} />}>
                    <Input
                      type="password"
                      value={gmailAppPassword}
                      onChange={setGmailAppPassword}
                      placeholder={hasGmailPassword ? "Saved. Leave blank to keep it." : "xxxx xxxx xxxx xxxx"}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <p className="text-sm" style={{ color: MUTED }}>
                    Sent through a free Resend account.
                  </p>
                  <Field label="Resend API key" help={<ResendHelp />}>
                    <Input
                      type="password"
                      value={resendApiKey}
                      onChange={setResendApiKey}
                      placeholder={hasResendKey ? "Saved. Leave blank to keep it." : "re_…"}
                    />
                  </Field>
                  <Field label="Send from (only if you verified a domain in Resend)">
                    <Input value={digestFromEmail} onChange={setDigestFromEmail} placeholder="School Dashboard <onboarding@resend.dev>" />
                  </Field>
                </>
              )}

              <Field label="Send to">
                <Input
                  type="email"
                  value={digestToEmail}
                  onChange={setDigestToEmail}
                  placeholder={emailProvider === "gmail" ? gmailAddress || "Same as your Gmail" : "you@example.com"}
                />
              </Field>

              <div className="flex flex-wrap items-end gap-3">
                <Field label="Send at">
                  <Input type="time" value={sendTime} onChange={setSendTime} className="!w-36" />
                </Field>
                <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)" }} role="radiogroup" aria-label="Days">
                  {[
                    ["weekdays", "Weekdays"],
                    ["daily", "Every day"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={sendDays === value}
                      onClick={() => setSendDays(value)}
                      className="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors hover:text-[var(--ink)]"
                      style={sendDays === value ? { background: "var(--surface)", color: INK } : { color: MUTED }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs" style={{ color: MUTED }}>
                It sends even with the dashboard closed, as long as your PC is on. If the PC was off at that time, it
                sends when you turn it on.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={testing || saving}
                  className="btn btn-secondary px-4 py-2 text-sm"
                >
                  {testing ? "Checking and sending…" : "Save & send a test email"}
                </button>
              </div>
              {testResult && (
                <p
                  role="status"
                  className="rounded-xl px-4 py-3 text-sm font-semibold"
                  style={testResult.ok ? { background: "var(--green-bg)", color: "var(--green-fg)" } : { background: "var(--red-bg)", color: "var(--red-fg)" }}
                >
                  {testResult.text}
                </p>
              )}
            </>
          )}
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
            className="btn btn-primary px-6 py-2.5 text-sm"
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
      <span className="font-display text-lg font-extrabold" style={{ color: INK }}>
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
            className="btn btn-secondary px-4 py-2 text-sm"
          >
            Get the latest version
          </a>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run("reinstall", "Reinstall the dashboard? It closes, reinstalls, and opens again. This takes a few minutes.")}
            className="btn btn-secondary px-4 py-2 text-sm"
          >
            Reinstall
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run("uninstall", "Open the uninstaller? You'll confirm each step in its window.")}
          className="btn btn-danger px-4 py-2 text-sm"
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

function Section({ title, note, open = true, status, warning, onRemove, removeLabel, children }) {
  const body = <div className="mt-3 flex flex-col gap-3">{children}</div>;
  const heading = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className="font-display text-lg font-extrabold" style={{ color: INK }}>
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
      {warning && (
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
          {warning}
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
              {removeLabel || "Turn off and remove saved links"}
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
