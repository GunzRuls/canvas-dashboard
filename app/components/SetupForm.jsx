"use client";

import { useEffect, useState } from "react";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const RELEASES_URL = "https://github.com/GunzRuls/canvas-dashboard/releases/latest";

// Saved tokens and keys are never sent to this page. For those, a blank box means "keep it".
export default function SetupForm({ saved, firstRun, installed, version }) {
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
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: INK }}>
        {firstRun ? "Welcome! Let's connect Canvas" : "Settings"}
      </h1>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        Everything you enter is saved only on this computer. Your token is only ever sent to Canvas.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Section title="Canvas" note="Required">
          <Field label="Your school's Canvas address">
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
            hint={
              <>
                In Canvas: <b>Account → Settings → Approved Integrations → + New Access Token</b>. Copy the
                token and paste it here.
              </>
            }
          >
            <Input
              type="password"
              value={canvasToken}
              onChange={setCanvasToken}
              placeholder={saved.tokenEnding ? `Saved (ends in ${saved.tokenEnding}). Leave blank to keep it.` : "Paste your token"}
              required={!saved.tokenEnding}
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
            Shows your events in the week strip and helps find class times. In Google Calendar, open a
            calendar&apos;s settings and copy <b>Secret address in iCal format</b>. Separate several links with
            commas.
          </p>
          <Input
            type="password"
            value={calendarUrls}
            onChange={setCalendarUrls}
            placeholder={hasCalendar ? "Leave blank to keep your saved links" : "https://calendar.google.com/calendar/ical/…"}
          />
        </Section>

        <Section
          title="Morning email"
          note="Optional"
          open={hasEmail}
          status={hasEmail ? `On, sending to ${saved.digestToEmail}` : ""}
          onRemove={hasEmail ? () => remove("resendApiKey") : null}
        >
          <p className="text-sm" style={{ color: MUTED }}>
            Emails you what&apos;s due, using a free{" "}
            <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">
              Resend
            </a>{" "}
            account. Without your own domain, Resend only sends to the email you signed up with.
          </p>
          <Field label="Resend API key">
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
          <Input value={timezone} onChange={setTimezone} placeholder="America/New_York" />
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
          {!firstRun && (
            <a href="/" className="text-sm font-bold hover:underline" style={{ color: MUTED }}>
              Cancel
            </a>
          )}
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

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold" style={{ color: INK }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs" style={{ color: MUTED }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Input({ value, onChange, type = "text", ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--ink-soft)]"
      style={{ background: "var(--field)", borderColor: "var(--line)", color: INK }}
      {...rest}
    />
  );
}
