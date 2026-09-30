"use client";

import { useEffect, useState } from "react";
import { Input, CanvasAddressHelp, TokenHelp, GmailHelp, ResendHelp } from "./setupHelp";
import { CalendarLinkField } from "./CalendarSettings";
import ClassTimes, { EMPTY_TIMES, isBlank, timesProblem } from "./ClassTimes";

// First launch: a step-by-step setup instead of one long form. Canvas is required; the
// class times, calendar and email steps can be skipped. Each save goes through /api/config, which checks
// Canvas (and calendar links) before anything is stored. Later changes happen in Settings.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const STEPS = ["welcome", "school", "connect", "classes", "calendar", "email", "look", "done"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [canvasBaseUrl, setCanvasBaseUrl] = useState("");
  const [canvasToken, setCanvasToken] = useState("");
  const [connected, setConnected] = useState(null); // { name, classes } once Canvas accepts the token
  const [classTimes, setClassTimes] = useState(null); // how many classes got times, once saved
  const [calendarUrls, setCalendarUrls] = useState("");
  const [calendarSource, setCalendarSource] = useState("google");
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

          {name === "classes" && (
            <ClassesStep
              back={back}
              skip={next}
              saved={classTimes}
              onSaved={(count) => {
                setClassTimes(count);
                next();
              }}
            />
          )}

          {name === "calendar" && (
            <form onSubmit={saveCalendar}>
              <Card>
                <Title>Add your calendar?</Title>
                <Lead>
                  Optional. Google Calendar or Outlook. Events about your classes show up in the week view, and class
                  times help Smart Check in find your classes. Personal events stay off the dashboard unless you turn
                  them on in Settings.
                </Lead>
                <div className="mt-4">
                  <CalendarLinkField
                    source={calendarSource}
                    setSource={setCalendarSource}
                    url={calendarUrls}
                    setUrl={setCalendarUrls}
                    required
                  />
                </div>
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
                <li style={{ color: classTimes ? undefined : MUTED }}>
                  {classTimes
                    ? `✓ Class times for ${classTimes} ${classTimes === 1 ? "class" : "classes"}`
                    : "– Class times skipped"}
                </li>
                <li style={{ color: calendarSaved ? undefined : MUTED }}>
                  {calendarSaved ? "✓ Calendar added" : "– Calendar skipped"}
                </li>
                <li style={{ color: emailSaved ? undefined : MUTED }}>
                  {emailSaved ? `✓ Morning email to ${digestToEmail}` : "– Morning email skipped"}
                </li>
              </ul>
              <p className="mt-4 text-sm" style={{ color: MUTED }}>
                Change any of this later from <b>Settings</b> at the top of the dashboard. Hide or rename classes
                and change class times with <b>Manage classes</b>.
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

async function fetchClasses() {
  const res = await fetch("/api/settings");
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Couldn't load your classes.");
  return data;
}

// "When are your classes?" Canvas at most schools doesn't list meeting times, so they're entered
// once per semester. Saving sends only class times and hidden classes; names and colors are kept.
function ClassesStep({ back, skip, saved, onSaved }) {
  const [rows, setRows] = useState(null); // [{ id, name, code, color, hidden, times }]
  const [before, setBefore] = useState({ schedule: {}, hidden: [] }); // what's already saved
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false); // show problems only after a save try
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const load = () =>
    fetchClasses().then(
      (data) => {
        setBefore({ schedule: data.settings.schedule || {}, hidden: data.settings.hidden || [] });
        setRows(data.courses.map((c) => ({ ...c, times: c.schedule || EMPTY_TIMES })));
        setLoadError("");
      },
      (err) => setLoadError(err.message)
    );

  useEffect(() => {
    load();
  }, []);

  const update = (id, changes) => setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  const classes = (rows || []).filter((r) => !r.hidden);
  const notClasses = (rows || []).filter((r) => r.hidden);

  async function submit(e) {
    e.preventDefault();
    if (classes.some((r) => timesProblem(r.times))) {
      setChecked(true);
      setError("Some class times aren't finished. Fix them, or clear that class's days and times to skip it.");
      return;
    }
    setBusy(true);
    setError("");
    // Start from what's saved, so classes not listed here keep their times and hidden state.
    const schedule = { ...before.schedule };
    for (const r of rows) {
      if (r.hidden || isBlank(r.times)) delete schedule[r.id];
      else schedule[r.id] = r.times;
    }
    const listed = new Set(rows.map((r) => r.id));
    const hidden = [...before.hidden.filter((id) => !listed.has(id)), ...notClasses.map((r) => r.id)];
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule, hidden }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "That didn't save.");
      onSaved(classes.filter((r) => !isBlank(r.times)).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <Title>When are your classes?</Title>
        <Lead>
          Canvas doesn&apos;t list class times, so add them once per semester. They power the <b>Next class</b> card
          and <b>Check in</b>. Leave a class empty to skip it. You can change these later in Manage classes.
        </Lead>

        {!rows && !loadError && (
          <p className="mt-5 text-sm" style={{ color: MUTED }} role="status">
            Loading your classes…
          </p>
        )}
        {loadError && (
          <>
            <ErrorNote text={loadError} />
            <button type="button" onClick={load} className="btn btn-secondary mt-2 px-4 py-2 text-sm">
              Try again
            </button>
          </>
        )}

        {rows && (
          <ul className="mt-5 flex flex-col gap-5">
            {classes.map((r, i) => {
              const above = classes[i - 1];
              const problem = checked ? timesProblem(r.times) : "";
              return (
                <li key={r.id} className="flex flex-col gap-2" style={{ "--c": r.color }}>
                  <div className="flex items-center gap-2.5">
                    <span className="c-dot h-2.5 w-2.5 flex-none rounded-full" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold" style={{ color: INK }}>
                        {r.name}
                      </p>
                      {r.code && r.code !== r.name && (
                        <p className="truncate text-xs" style={{ color: MUTED }}>
                          {r.code}
                        </p>
                      )}
                    </div>
                    {above && !isBlank(above.times) && (
                      <button
                        type="button"
                        onClick={() => update(r.id, { times: { ...above.times, days: [...above.times.days] } })}
                        className="btn btn-soft flex-none rounded-md px-2.5 py-1 text-xs"
                        aria-label={`Same times as ${above.name}`}
                      >
                        Same as above
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => update(r.id, { hidden: true })}
                      className="btn btn-soft flex-none rounded-md px-2.5 py-1 text-xs"
                      aria-label={`${r.name} isn't a class. Hide it`}
                    >
                      Not a class
                    </button>
                  </div>
                  <ClassTimes
                    value={r.times}
                    onChange={(times) => update(r.id, { times })}
                    color={r.color}
                    label={r.name}
                    invalid={Boolean(problem)}
                  />
                  {problem && (
                    <p className="text-xs font-bold" style={{ color: "var(--red-fg)" }}>
                      {problem}
                    </p>
                  )}
                </li>
              );
            })}
            {!classes.length && (
              <li className="text-sm" style={{ color: MUTED }}>
                No classes to set up.
              </li>
            )}
          </ul>
        )}

        {notClasses.length > 0 && (
          <div className="mt-5 rounded-xl px-4 py-3" style={{ background: "var(--surface-2)" }}>
            <button
              type="button"
              onClick={() => setShowHidden(!showHidden)}
              aria-expanded={showHidden}
              className="text-sm font-bold hover:underline"
              style={{ color: "var(--ink-soft)" }}
            >
              <span aria-hidden="true">{showHidden ? "▾" : "▸"}</span> Hidden, not a class ({notClasses.length})
            </button>
            {showHidden && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {notClasses.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 text-sm" style={{ "--c": r.color, color: INK }}>
                    <span className="c-dot h-2.5 w-2.5 flex-none rounded-full" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <button
                      type="button"
                      onClick={() => update(r.id, { hidden: false })}
                      className="btn btn-secondary flex-none rounded-md px-2.5 py-1 text-xs"
                      aria-label={`${r.name} is a class. Show it`}
                    >
                      It&apos;s a class
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ErrorNote text={error} />
        <Actions>
          <Secondary onClick={back}>Back</Secondary>
          <Primary type="submit" disabled={busy || !rows}>
            {busy ? "Saving…" : saved != null ? "Save again" : "Save class times"}
          </Primary>
          <Skip onClick={skip}>{saved != null ? "Next" : "Skip for now"}</Skip>
        </Actions>
      </Card>
    </form>
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
    <h1 className="font-display mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: INK }}>
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
      className="btn btn-primary px-5 py-2.5 text-sm"
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
      className="btn btn-secondary px-4 py-2.5 text-sm"
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
