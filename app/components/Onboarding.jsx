"use client";

import { useEffect, useState } from "react";
import { Input, CanvasAddressHelp, TokenHelp, CalendarHelp, GmailHelp, ResendHelp } from "./setupHelp";

// First launch: a step-by-step setup instead of one long form. Canvas is required; the
// calendar and email steps can be skipped. Each save goes through /api/config, which checks
// Canvas (and calendar links) before anything is stored. Later changes happen in Settings.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const STEPS = ["welcome", "school", "connect", "calendar", "email", "look", "done"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [canvasBaseUrl, setCanvasBaseUrl] = useState("");
  const [canvasToken, setCanvasToken] = useState("");
  const [connected, setConnected] = useState(null); // { name, classes } once Canvas accepts the token
  const [calendarUrls, setCalendarUrls] = useState("");
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [emailProvider, setEmailProvider] = useState("gmail");
  const [gmailAddress, setGmailAddress] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");
  const [digestToEmail, setDigestToEmail] = useState("");
  const [sendTime, setSendTime] = useState("07:00");
  const [sendDays, setSendDays] = useState("weekdays");
  const [emailSaved, setEmailSaved] = useState(false);
  const [timezone, setTimezone] = useState("America/New_York");
  const [theme, setTheme] = useState("system");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
      const saved = localStorage.getItem("dashboard-theme");
      if (saved) setTheme(saved);
    } catch {}
  }, []);

  const go = (n) => {
    setError("");
    setStep(n);
  };
  const next = () => go(step + 1);
  const back = () => go(step - 1);

  // Saves through the same checks as Settings. A blank token means "keep the one just saved".
  async function save(extra) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasBaseUrl, timezone, ...extra }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "That didn't save.");
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connect(e) {
    e.preventDefault();
    const data = await save({ canvasToken });
    if (data) {
      setConnected({ name: data.name, classes: data.classes });
      setCanvasToken("");
    }
  }

  async function saveCalendar(e) {
    e.preventDefault();
    if (await save({ calendarUrls })) {
      setCalendarSaved(true);
      next();
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    const data = await save({ emailProvider, gmailAddress, gmailAppPassword, resendApiKey, digestToEmail, sendTime, sendDays });
    if (data) {
      if (emailProvider === "gmail" && !digestToEmail) setDigestToEmail(gmailAddress);
      setEmailSaved(true);
      next();
    }
  }

  function chooseTheme(value) {
    setTheme(value);
    try {
      if (value === "system") {
        localStorage.removeItem("dashboard-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("dashboard-theme", value);
        document.documentElement.dataset.theme = value;
      }
    } catch {}
  }

  const name = STEPS[step];
  const progress = step / (STEPS.length - 1);

  return (
    <main className="flex min-h-screen flex-col">
      <div className="h-1 w-full" style={{ background: "var(--surface-2)" }} aria-hidden="true">
        <div className="h-full transition-[width] duration-300" style={{ width: `${progress * 100}%`, background: "var(--focus)" }} />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        {step > 0 && step < STEPS.length - 1 && (
          <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
            Step {step} of {STEPS.length - 2}
          </p>
        )}

        <div key={name} className="step-in">
          {name === "welcome" && (
            <Card>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="" width={64} height={64} className="rounded-2xl" />
              <Title>Welcome to School Dashboard</Title>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                Your Canvas assignments, grades, and announcements on one screen.
              </p>
              <ul className="mt-5 space-y-3 text-sm" style={{ color: INK }}>
                <Feature title="Everything due, in one board">
                  To do, In progress, and Done, with what&apos;s due this week at the top.
                </Feature>
                <Feature title="Works with Canvas">
                  Check something off here and it&apos;s marked complete in Canvas too.
                </Feature>
                <Feature title="Private">
                  It runs on this computer. Your Canvas token is saved here and only ever sent to Canvas.
                </Feature>
              </ul>
              <Actions>
                <Primary onClick={next}>Get started</Primary>
                <span className="text-xs" style={{ color: MUTED }}>
                  Takes about 2 minutes
                </span>
              </Actions>
            </Card>
          )}

          {name === "school" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <Card>
                <Title>Where do you use Canvas?</Title>
                <Lead>Enter your school&apos;s Canvas address.</Lead>
                <Input
                  value={canvasBaseUrl}
                  onChange={(v) => {
                    setCanvasBaseUrl(v);
                    setConnected(null); // a new address needs the token checked again
                  }}
                  placeholder="yourschool.instructure.com"
                  required
                  autoFocus
                  className="mt-4 !py-2.5 !text-base"
                  aria-label="Canvas address"
                />
                <div className="mt-3">
                  <CanvasAddressHelp inline />
                </div>
                <Actions>
                  <Secondary onClick={back}>Back</Secondary>
                  <Primary type="submit">Next</Primary>
                </Actions>
              </Card>
            </form>
          )}

          {name === "connect" && (
            <form onSubmit={connect}>
              <Card>
                <Title>Connect your Canvas account</Title>
                <Lead>Canvas gives you a private key, called an access token, for apps like this one.</Lead>
                {connected ? (
                  <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--green-bg)", color: "var(--green-fg)" }}>
                    <p className="font-extrabold">✓ Connected{connected.name ? ` as ${connected.name}` : ""}</p>
                    {connected.classes != null && (
                      <p className="mt-0.5 font-semibold">
                        Found {connected.classes} {connected.classes === 1 ? "class" : "classes"} this term.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mt-4">
                      <TokenHelp canvasBaseUrl={canvasBaseUrl} inline />
                    </div>
                    <Input
                      type="password"
                      value={canvasToken}
                      onChange={setCanvasToken}
                      placeholder="Paste your token here"
                      required
                      autoFocus
                      className="mt-4 !py-2.5 !text-base"
                      aria-label="Canvas access token"
                    />
                  </>
                )}
                <ErrorNote text={error} />
                <Actions>
                  <Secondary onClick={back}>Back</Secondary>
                  {connected ? (
                    <Primary onClick={next}>Next</Primary>
                  ) : (
                    <Primary type="submit" disabled={busy}>
                      {busy ? "Checking with Canvas…" : "Connect"}
                    </Primary>
                  )}
                </Actions>
              </Card>
            </form>
          )}

          {name === "calendar" && (
            <form onSubmit={saveCalendar}>
              <Card>
                <Title>Add your Google Calendar?</Title>
                <Lead>
                  Optional. Your events show up in the week view, and class times help Smart Check in find your
                  classes.
                </Lead>
                <div className="mt-4">
                  <CalendarHelp inline />
                </div>
                <Input
                  type="password"
                  value={calendarUrls}
                  onChange={setCalendarUrls}
                  placeholder="https://calendar.google.com/calendar/ical/…"
                  required
                  className="mt-4"
                  aria-label="Secret calendar link"
                />
                <ErrorNote text={error} />
                <Actions>
                  <Secondary onClick={back}>Back</Secondary>
                  <Primary type="submit" disabled={busy}>
                    {busy ? "Checking…" : calendarSaved ? "Save again" : "Add calendar"}
                  </Primary>
                  <Skip onClick={next}>{calendarSaved ? "Next" : "Skip for now"}</Skip>
                </Actions>
              </Card>
            </form>
          )}

          {name === "email" && (
            <form onSubmit={saveEmail}>
              <Card>
                <Title>Get a morning email?</Title>
                <Lead>
                  Optional. A short list of what&apos;s due, every morning. It sends even with the dashboard closed, as
                  long as your PC is on.
                </Lead>
                <div className="mt-4 flex gap-1 self-start rounded-xl p-1" style={{ background: "var(--surface-2)", width: "fit-content" }} role="radiogroup" aria-label="Send with">
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
                      className="rounded-lg px-3 py-1.5 text-sm font-bold"
                      style={emailProvider === value ? { background: "var(--surface)", color: INK } : { color: MUTED }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-4">{emailProvider === "gmail" ? <GmailHelp inline /> : <ResendHelp inline />}</div>
                <div className="mt-4 flex flex-col gap-2">
                  {emailProvider === "gmail" ? (
                    <>
                      <Input type="email" value={gmailAddress} onChange={setGmailAddress} placeholder="Your Gmail: you@gmail.com" required aria-label="Your Gmail address" />
                      <Input type="password" value={gmailAppPassword} onChange={setGmailAppPassword} placeholder="App password: xxxx xxxx xxxx xxxx" required aria-label="Gmail app password" />
                      <Input type="email" value={digestToEmail} onChange={setDigestToEmail} placeholder="Send to (optional, any inbox): you@school.edu" aria-label="Send to" />
                    </>
                  ) : (
                    <>
                      <Input type="password" value={resendApiKey} onChange={setResendApiKey} placeholder="Resend API key (re_…)" required aria-label="Resend API key" />
                      <Input type="email" value={digestToEmail} onChange={setDigestToEmail} placeholder="Send to: the email you signed up with" required aria-label="Send to" />
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-bold" style={{ color: INK }} htmlFor="ob-time">
                      Send at
                    </label>
                    <Input id="ob-time" type="time" value={sendTime} onChange={setSendTime} className="!w-36" />
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
                          className="rounded-lg px-3 py-1.5 text-sm font-bold"
                          style={sendDays === value ? { background: "var(--surface)", color: INK } : { color: MUTED }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <ErrorNote text={error} />
                <Actions>
                  <Secondary onClick={back}>Back</Secondary>
                  <Primary type="submit" disabled={busy}>
                    {busy ? "Checking with Gmail…" : "Turn on email"}
                  </Primary>
                  <Skip onClick={next}>{emailSaved ? "Next" : "Skip for now"}</Skip>
                </Actions>
              </Card>
            </form>
          )}

          {name === "look" && (
            <Card>
              <Title>Pick your look</Title>
              <Lead>You can switch anytime with the button at the top of the dashboard.</Lead>
              <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
                {[
                  ["light", "Light"],
                  ["dark", "Dark"],
                  ["system", "Match Windows"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => chooseTheme(value)}
                    className="rounded-xl p-3 text-sm font-bold transition-shadow"
                    style={{
                      background: "var(--surface-2)",
                      color: INK,
                      boxShadow: theme === value ? "0 0 0 2px var(--focus)" : "none",
                    }}
                  >
                    <ThemeSwatch value={value} />
                    <span className="mt-2 block">{label}</span>
                  </button>
                ))}
              </div>
              <Actions>
                <Secondary onClick={back}>Back</Secondary>
                <Primary onClick={next}>Next</Primary>
              </Actions>
            </Card>
          )}

          {name === "done" && (
            <Card>
              <p className="text-4xl" aria-hidden="true">
                🎉
              </p>
              <Title>You&apos;re all set</Title>
              <ul className="mt-4 space-y-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                <li>✓ Canvas connected{connected?.classes != null ? ` (${connected.classes} classes)` : ""}</li>
                <li style={{ color: calendarSaved ? undefined : MUTED }}>
                  {calendarSaved ? "✓ Google Calendar added" : "– Google Calendar skipped"}
                </li>
                <li style={{ color: emailSaved ? undefined : MUTED }}>
                  {emailSaved ? `✓ Morning email to ${digestToEmail}` : "– Morning email skipped"}
                </li>
              </ul>
              <p className="mt-4 text-sm" style={{ color: MUTED }}>
                Change any of this later from <b>Settings</b> at the top of the dashboard. Hide or rename classes
                with <b>Manage classes</b>.
              </p>
              <Actions>
                <Primary onClick={() => window.location.assign("/")}>Open my dashboard</Primary>
              </Actions>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({ children }) {
  return (
    <div className="rounded-2xl p-6 sm:p-7" style={{ background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function Title({ children }) {
  return (
    <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: INK }}>
      {children}
    </h1>
  );
}

function Lead({ children }) {
  return (
    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
      {children}
    </p>
  );
}

function Feature({ title, children }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: "var(--focus)" }} aria-hidden="true" />
      <span>
        <b>{title}.</b> <span style={{ color: "var(--ink-soft)" }}>{children}</span>
      </span>
    </li>
  );
}

function Actions({ children }) {
  return <div className="mt-6 flex flex-wrap items-center gap-2">{children}</div>;
}

function Primary({ children, type = "button", ...rest }) {
  return (
    <button
      type={type}
      className="rounded-full px-5 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ background: "var(--inverse)", color: "var(--inverse-fg)" }}
      {...rest}
    >
      {children}
    </button>
  );
}

function Secondary({ children, ...rest }) {
  return (
    <button
      type="button"
      className="rounded-full px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
      style={{ background: "var(--surface-2)", color: INK }}
      {...rest}
    >
      {children}
    </button>
  );
}

function Skip({ children, ...rest }) {
  return (
    <button type="button" className="ml-auto px-2 py-2 text-sm font-bold hover:underline" style={{ color: MUTED }} {...rest}>
      {children}
    </button>
  );
}

function ErrorNote({ text }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: "var(--red-bg)", color: "var(--red-fg)" }}>
      {text}
    </p>
  );
}

// Tiny preview of each theme. These are fixed colors on purpose: they show what the other
// theme looks like, whatever theme is active right now.
function ThemeSwatch({ value }) {
  const light = { bg: "#F1F0F7", card: "#FFFFFF", bar: "#1C1A2E" };
  const dark = { bg: "#100F1C", card: "#1B1A2C", bar: "#ECEAF6" };
  const half = (c) => (
    <span className="flex flex-1 flex-col gap-1 p-1.5" style={{ background: c.bg }}>
      <span className="h-1.5 w-2/3 rounded-full" style={{ background: c.bar }} />
      <span className="h-5 rounded" style={{ background: c.card }} />
    </span>
  );
  return (
    <span className="flex h-12 overflow-hidden rounded-lg" aria-hidden="true">
      {value === "light" && half(light)}
      {value === "dark" && half(dark)}
      {value === "system" && (
        <>
          {half(light)}
          {half(dark)}
        </>
      )}
    </span>
  );
}
