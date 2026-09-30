"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, CanvasAddressHelp, TokenHelp, GmailHelp, ResendHelp } from "./setupHelp";
import { LinkedCalendars, CanvasFeed } from "./CalendarSettings";
import { Avatar } from "./AccountChip";
import { useSettingsModal, SettingsModalHeader } from "./SettingsModal";

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
export default function SetupForm({ saved, firstRun, installed, version, fixToken, emailOn, nextEmail, account }) {
  const [canvasBaseUrl, setCanvasBaseUrl] = useState(saved.canvasBaseUrl);
  const [canvasToken, setCanvasToken] = useState("");
  const [calendars, setCalendars] = useState(() => (saved.calendars || []).map((c, index) => ({ ...c, index })));
  const [newCalendarUrl, setNewCalendarUrl] = useState("");
  const [newCalendarShow, setNewCalendarShow] = useState("classes");
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
  const [savedNote, setSavedNote] = useState(""); // "Saved" next to the button, fades after a moment
  const router = useRouter();
  const modal = useSettingsModal(); // set when shown as the pop-up over the dashboard

  useEffect(() => {
    if (!savedNote) return;
    const timer = setTimeout(() => setSavedNote(""), 4000);
    return () => clearTimeout(timer);
  }, [savedNote]);

  // On first launch, start with this computer's time zone.
  useEffect(() => {
    if (!firstRun) return;
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || saved.timezone);
    } catch {}
  }, [firstRun, saved.timezone]);

  const hasGmailPassword = saved.hasGmailPassword && !clear.includes("gmailAppPassword");
  const hasResendKey = saved.hasResendKey && !clear.includes("resendApiKey");

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
          calendars: calendars.map(({ index, show }) => ({ index, show })),
          calendarUrls: newCalendarUrl,
          newCalendarShow,
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
      // The page can stay open after a save (test email), so continue from what was saved.
      if (data.calendars) {
        setCalendars(data.calendars.map((c, index) => ({ ...c, index })));
        setNewCalendarUrl("");
      }
      // Stay on this page: secrets are saved, so empty their boxes, then fetch the saved state
      // (token ending, email status, next send time) without reloading. A ?fix=token link is
      // done once the new token is saved.
      setCanvasToken("");
      setGmailAppPassword("");
      setResendApiKey("");
      setClear([]);
      // In the pop-up, the refresh also reloads the dashboard behind it (and again on Close).
      modal?.markSaved();
      if (fixToken && !modal) router.replace("/setup");
      else router.refresh();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setSavedNote("");
    const data = await save();
    if (data && firstRun) {
      window.location.assign("/");
      return;
    }
    if (data?.scheduleWarning) setError(`Saved, but ${data.scheduleWarning}`);
    else if (data) setSavedNote("Saved");
    setSaving(false);
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

  const content = (
    <>
      {fixToken && (
        <p className="mt-4 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
          Your Canvas token stopped working. Follow the steps under Access token to make a new one, paste it, and
          click Save.
        </p>
      )}

      <form onSubmit={submit} className={`${modal ? "mt-2" : "mt-6"} flex flex-col gap-4`}>
        <Section title="Canvas" note="Required">
          {account && (
            <Suspense fallback={<ConnectedAsPlaceholder />}>
              <ConnectedAs account={account} />
            </Suspense>
          )}
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
          title="Show my calendar here"
          note="Optional"
          open={calendars.length > 0}
          status={calendars.length ? `${calendars.length} linked` : ""}
        >
          <LinkedCalendars
            calendars={calendars}
            setCalendars={setCalendars}
            newUrl={newCalendarUrl}
            setNewUrl={setNewCalendarUrl}
            newShow={newCalendarShow}
            setNewShow={setNewCalendarShow}
          />
        </Section>

        <Section title="Send Canvas to my calendar" note="Optional" open={false}>
          <CanvasFeed />
        </Section>

        <Section
          title="Morning email"
          note="Optional"
          open={emailOn}
          badge={
            emailOn && !emailOff ? (
              <Suspense fallback={<span className="settings-skeleton inline-block h-5 w-28 rounded-full" style={{ background: "var(--surface-2)" }} aria-hidden="true" />}>
                <EmailSchedule nextEmail={nextEmail} />
              </Suspense>
            ) : null
          }
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
          {savedNote && (
            <span role="status" className="step-in text-sm font-bold" style={{ color: "var(--green-fg)" }}>
              ✓ {savedNote}. Changes are live on your dashboard.
            </span>
          )}
        </div>
      </form>

      {!firstRun && (
        <section className="settings-card mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5" style={{ background: "var(--surface)" }}>
          <div className="min-w-0">
            <span className="font-display text-lg font-extrabold" style={{ color: INK }}>
              First-time setup
            </span>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              See the setup steps a new student sees. Nothing you enter there is saved.
            </p>
          </div>
          {/* A full page load on purpose: a client-side move to /setup would be caught by the
              Settings pop-up route (app/@modal/(.)setup) instead of showing the walkthrough. */}
          <a href="/setup?tour=1" className="btn btn-secondary px-4 py-2 text-sm">
            Walk through setup
          </a>
        </section>
      )}
      {!firstRun && <Maintenance installed={installed} version={version} />}
    </>
  );

  // Pop-up over the dashboard: a fixed title row with Close, and the settings scroll below it.
  if (modal) {
    return (
      <>
        <SettingsModalHeader />
        <div className="settings-fade-in min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 sm:px-6">{content}</div>
      </>
    );
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
      {content}
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
    <section className="settings-card mt-8 rounded-2xl p-5" style={{ background: "var(--surface)" }}>
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

// Settings get `account` and `nextEmail` as promises from the server (they're slow to look up),
// so the rest of the form doesn't wait for them. A plain value works too.
function useSettled(value) {
  return value && typeof value.then === "function" ? use(value) : value;
}

// "Connected as" card at the top of the Canvas section.
function ConnectedAs({ account: accountOrPromise }) {
  const account = useSettled(accountOrPromise);
  if (!account) return null;
  return (
    <div className="settings-fade-in flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <Avatar account={account} size={36} />
      <div className="min-w-0 text-sm">
        <p className="text-xs font-bold" style={{ color: MUTED }}>
          Connected as
        </p>
        <p className="truncate font-extrabold" style={{ color: INK }}>
          {account.name}
          {account.login && (
            <span className="font-semibold" style={{ color: "var(--ink-soft)" }}>
              {" "}· {account.login}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// Same size as the card above, so nothing moves when your name arrives from Canvas.
function ConnectedAsPlaceholder() {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-2)" }} aria-hidden="true">
      <span className="settings-skeleton h-9 w-9 shrink-0 rounded-full" style={{ background: "var(--surface)" }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <span className="settings-skeleton h-3 w-20 rounded" style={{ background: "var(--surface)" }} />
        <span className="settings-skeleton h-3.5 w-3/5 rounded" style={{ background: "var(--surface)" }} />
      </div>
    </div>
  );
}

// Morning email badge: when the next one goes out, or a nudge to save if Windows has no task.
function EmailSchedule({ nextEmail: nextOrPromise }) {
  const nextEmail = useSettled(nextOrPromise);
  return nextEmail ? (
    <Badge tone="green">On · next one {nextEmailLabel(nextEmail)}</Badge>
  ) : (
    <Badge tone="amber">Not scheduled yet. Click Save to start daily emails.</Badge>
  );
}

function Badge({ tone, children }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone}-fg)` }}>
      {children}
    </span>
  );
}

function Section({ title, note, open = true, status, warning, badge, onRemove, removeLabel, children }) {
  const body = <div className="mt-3 flex flex-col gap-3">{children}</div>;
  const heading = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className="fold-title font-display text-lg font-extrabold" style={{ color: INK }}>
        {title}
      </span>
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        {note}
      </span>
      {status && <Badge tone="green">{status}</Badge>}
      {warning && <Badge tone="amber">{warning}</Badge>}
      {badge}
    </span>
  );

  return (
    <section className="settings-card rounded-2xl p-5" style={{ background: "var(--surface)" }}>
      {note === "Optional" ? (
        <details open={open}>
          <summary className="fold-summary flex items-center justify-between gap-3">
            {heading}
            <span
              className="fold-chevron grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg font-bold leading-none"
              style={{ color: MUTED }}
              aria-hidden="true"
            >
              ›
            </span>
          </summary>
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
