"use client";

import { useEffect, useRef, useState } from "react";
import { Input, CanvasAddressHelp, TokenHelp, GmailHelp, ResendHelp } from "./setupHelp";
import { CalendarLinkField } from "./CalendarSettings";
import { ClassTimesRow, EMPTY_TIMES, isBlank, timesProblem } from "./ClassTimes";
import { tourResponse, onboardingStart, sampleClassRows, isSampleValue, TOUR_SAMPLE } from "@/lib/tour";

// First launch: a step-by-step setup instead of one long form. Canvas is required; class times
// (listed right after Canvas connects), the calendar and email can be skipped. Each save goes through /api/config, which checks
// Canvas (and calendar links) before anything is stored. Later changes happen in Settings.
//
// Walkthrough (`tour` set, from /setup?tour=1): the same screens, every field already filled with
// obviously fake sample data (TOUR_SAMPLE in lib/tour.js), so you can click straight through. Every
// write goes through `send` below, which answers locally instead of calling the server, the class
// list is the sample one (no Canvas call), and the theme is only previewed. Nothing is saved.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const STEPS = ["welcome", "school", "connect", "calendar", "email", "look", "done"];

// The only way onboarding writes anything. In a walkthrough nothing leaves the page.
function sender(tour) {
  if (tour) {
    // A short pause so buttons show "Checking…" like the real thing.
    return (url, body) => new Promise((resolve) => setTimeout(() => resolve(tourResponse(url, body)), 400));
  }
  return async (url, body) => {
    // Belt and braces: a sample value from the walkthrough must never reach Canvas or Google.
    if (Object.values(body || {}).some(isSampleValue)) {
      return { ok: false, error: "That's a sample value from the walkthrough. Paste your own." };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };
}

export default function Onboarding({ tour = null }) {
  const send = sender(tour);
  const [start] = useState(() => onboardingStart(tour)); // sample values in a walkthrough, else empty
  const [step, setStep] = useState(0);
  const [canvasBaseUrl, setCanvasBaseUrl] = useState(start.canvasBaseUrl);
  const [canvasToken, setCanvasToken] = useState(start.canvasToken);
  const [connected, setConnected] = useState(null); // { name, classes } once Canvas accepts the token
  const [classTimes, setClassTimes] = useState(null); // how many classes got times, once saved
  const [calendarUrls, setCalendarUrls] = useState(start.calendarUrls);
  const [calendarSource, setCalendarSource] = useState("google");
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [emailProvider, setEmailProvider] = useState("gmail");
  const [gmailAddress, setGmailAddress] = useState(start.gmailAddress);
  const [gmailAppPassword, setGmailAppPassword] = useState(start.gmailAppPassword);
  const [resendApiKey, setResendApiKey] = useState(start.resendApiKey);
  const [digestToEmail, setDigestToEmail] = useState(start.digestToEmail);
  const [sendTime, setSendTime] = useState(start.sendTime);
  const [sendDays, setSendDays] = useState(start.sendDays);
  const [emailSaved, setEmailSaved] = useState(false);
  const [theme, setTheme] = useState("system");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = (n) => {
    setError("");
    // The theme picker starts on whatever is saved in this browser (read here, not during render,
    // so the server and browser render the same page).
    if (STEPS[n] === "look") setTheme(savedTheme());
    setStep(n);
  };
  const next = () => go(step + 1);
  const back = () => go(step - 1);

  // Saves through the same checks as Settings. A blank token means "keep the one just saved".
  async function save(extra) {
    setBusy(true);
    setError("");
    try {
      const data = await send("/api/config", { canvasBaseUrl, timezone: browserTimezone(), ...extra });
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
      if (!tour) setCanvasToken(""); // the walkthrough keeps its sample so Connect works again after Back
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

  // In a walkthrough, switching Google/Outlook swaps in that service's sample link (unless you
  // typed your own).
  function chooseCalendarSource(value) {
    setCalendarSource(value);
    if (tour && (!calendarUrls || Object.values(TOUR_SAMPLE.calendar).includes(calendarUrls))) {
      setCalendarUrls(TOUR_SAMPLE.calendar[value]);
    }
  }

  function chooseTheme(value) {
    setTheme(value);
    applyTheme(value, !tour);
  }

  // A walkthrough only previews the theme; leaving puts the saved one back.
  useEffect(() => {
    if (!tour) return;
    return () => applyTheme(savedTheme(), false);
  }, [tour]);

  const name = STEPS[step];
  const progress = step / (STEPS.length - 1);
  // The card widens once Canvas connects, so each class fits on one line with its days and times.
  const wide = name === "connect" && connected;

  return (
    <main className="flex min-h-screen flex-col">
      {tour && <TourBanner />}
      <div className="h-1 w-full" style={{ background: "var(--surface-2)" }} aria-hidden="true">
        <div className="h-full transition-[width] duration-300" style={{ width: `${progress * 100}%`, background: "var(--focus)" }} />
      </div>

      <div
        className="mx-auto flex w-full flex-1 flex-col justify-center px-4 py-10"
        style={{ maxWidth: wide ? 840 : 512, transition: "max-width 0.35s ease" }}
      >
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
                {tour && canvasBaseUrl === TOUR_SAMPLE.canvasBaseUrl && <SampleTag>A made-up school address.</SampleTag>}
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

          {name === "connect" && !connected && (
            <form onSubmit={connect}>
              <Card>
                <Title>Connect your Canvas account</Title>
                <Lead>Canvas gives you a private key, called an access token, for apps like this one.</Lead>
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
                {tour && canvasToken === TOUR_SAMPLE.canvasToken && (
                  <SampleTag>A fake token. Connect answers right here, without asking Canvas.</SampleTag>
                )}
                <ErrorNote text={error} />
                <Actions>
                  <Secondary onClick={back}>Back</Secondary>
                  <Primary type="submit" disabled={busy}>
                    {busy ? "Checking with Canvas…" : "Connect"}
                  </Primary>
                </Actions>
              </Card>
            </form>
          )}

          {name === "connect" && connected && (
            <ClassesList
              tour={Boolean(tour)}
              send={send}
              connected={connected}
              back={back}
              skip={next}
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
                  Optional. Google Calendar or Outlook. Events about your classes show up on the This term calendar,
                  and class times help the Next class card find your classes. Personal events stay off the dashboard
                  unless you turn them on in Settings.
                </Lead>
                <div className="mt-4">
                  <CalendarLinkField
                    source={calendarSource}
                    setSource={chooseCalendarSource}
                    url={calendarUrls}
                    setUrl={setCalendarUrls}
                    required
                  />
                  {tour && calendarUrls === TOUR_SAMPLE.calendar[calendarSource] && (
                    <SampleTag>
                      A fake {calendarSource === "google" ? "Google" : "Outlook"} link. Nothing is checked or added.
                    </SampleTag>
                  )}
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
                  {tour && (
                    <EmailSampleTag provider={emailProvider} values={{ gmailAddress, gmailAppPassword, resendApiKey, digestToEmail }} />
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
                <li>
                  ✓ Canvas connected
                  {tour && connected?.name ? ` as ${connected.name} at ${canvasBaseUrl.replace(/^https?:\/\//, "")}` : ""}
                  {connected?.classes != null ? ` (${connected.classes} classes)` : ""}
                </li>
                <li style={{ color: classTimes ? undefined : MUTED }}>
                  {classTimes
                    ? `✓ Class times for ${classTimes} ${classTimes === 1 ? "class" : "classes"}`
                    : "– Class times skipped"}
                </li>
                <li style={{ color: calendarSaved ? undefined : MUTED }}>
                  {calendarSaved ? "✓ Calendar added" : "– Calendar skipped"}
                  {tour && calendarSaved ? ` (${calendarSource === "google" ? "Google" : "Outlook"})` : ""}
                </li>
                <li style={{ color: emailSaved ? undefined : MUTED }}>
                  {emailSaved ? `✓ Morning email to ${digestToEmail}` : "– Morning email skipped"}
                  {tour && emailSaved ? `, ${timeLabel(sendTime)} on ${sendDays === "daily" ? "every day" : "weekdays"}` : ""}
                </li>
              </ul>
              {tour && (
                <p className="mt-4 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}>
                  That was the walkthrough, with sample data. Nothing was saved or sent, and your real settings are
                  unchanged.
                </p>
              )}
              <p className="mt-4 text-sm" style={{ color: MUTED }}>
                Change any of this later from <b>Settings</b> at the top of the dashboard. Hide or rename classes
                and change class times with <b>Manage classes</b>.
              </p>
              <Actions>
                {/* A full page load on purpose: the whole app starts fresh with the new settings. */}
                {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
                <Primary onClick={() => window.location.assign("/")}>Open my dashboard</Primary>
              </Actions>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

// This computer's time zone, so the morning email and "today" match your clock.
function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

function savedTheme() {
  try {
    return localStorage.getItem("dashboard-theme") || "system";
  } catch {
    return "system";
  }
}

// Switches the page to the theme right away ("system" follows Windows) and, unless `remember`
// is false (walkthrough preview), saves it.
function applyTheme(value, remember = true) {
  const root = document.documentElement;
  if (remember) {
    try {
      if (value === "system") localStorage.removeItem("dashboard-theme");
      else localStorage.setItem("dashboard-theme", value);
    } catch {}
  }
  if (value === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", value);
}

async function fetchClasses() {
  const res = await fetch("/api/settings");
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Couldn't load your classes.");
  return data;
}

// Right after Canvas connects: a "Connected" check pops in, then your classes are listed one per
// row with day toggles and times next to each. Canvas at most schools doesn't list meeting times, so
// they're entered once per semester. Saving sends only class times and hidden classes; names and
// colors are kept.
function ClassesList({ tour, send, connected, back, skip, onSaved }) {
  // A walkthrough starts with the sample classes (filled, empty and switched-off rows) and never
  // asks Canvas; otherwise the list loads from /api/settings.
  const [rows, setRows] = useState(() => (tour ? sampleClassRows() : null)); // [{ id, name, code, color, hidden, times }]
  const [before, setBefore] = useState({ schedule: {}, hidden: [] }); // what's already saved
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false); // show problems only after a save try
  const [busy, setBusy] = useState(false);
  const headingRef = useRef(null);

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
    if (!tour) load();
    // The token field and Connect button just went away, so keep keyboard focus on this card.
    headingRef.current?.focus();
  }, [tour]); // `tour` never changes while this is shown, so this runs once

  const update = (id, changes) => setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  const classes = (rows || []).filter((r) => !r.hidden);
  const notClasses = (rows || []).filter((r) => r.hidden);
  const count = connected.classes;

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
      const data = await send("/api/settings", { schedule, hidden });
      if (!data.ok) throw new Error(data.error || "That didn't save.");
      onSaved(classes.filter((r) => !isBlank(r.times)).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const link = "text-xs font-bold hover:underline";

  return (
    <form onSubmit={submit} noValidate>
      <style>{CONNECTED_MOTION}</style>
      <Card>
        <div
          role="status"
          className="ob-banner flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--green-bg)", color: "var(--green-fg)" }}
        >
          <span
            className="ob-pop flex h-8 w-8 flex-none items-center justify-center rounded-full"
            style={{ background: "var(--green-fg)" }}
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                className="ob-check"
                d="M3.5 8.5l3 3 6-7"
                stroke="var(--green-bg)"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="min-w-0">
            <span className="font-extrabold">Connected{connected.name ? ` as ${connected.name}` : ""}</span>
            {count != null && (
              <span className="font-semibold">
                {" · "}found {count} {count === 1 ? "class" : "classes"}
              </span>
            )}
          </p>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl"
          style={{ color: INK, outline: "none" /* focused by code, not by the user: no ring */ }}
        >
          When are your classes?
        </h1>
        <Lead>
          Canvas doesn&apos;t list class times, so add them once per semester. They power the <b>Next class</b> card
          and <b>Check in</b>. Leave a class empty to skip it. You can change these later in Manage classes.
        </Lead>

        {!rows && !loadError && (
          <div className="mt-5 flex flex-col gap-3" role="status" aria-label="Loading your classes">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-9 animate-pulse rounded-lg" style={{ background: "var(--field)" }} />
            ))}
          </div>
        )}
        {loadError && (
          <>
            <ErrorNote text={loadError} />
            <button type="button" onClick={load} className="btn btn-secondary mt-2 px-4 py-2 text-sm">
              Try again
            </button>
          </>
        )}

        {tour && (
          <SampleTag>Sample classes: some filled in, one empty, one switched off. Edit anything to try it.</SampleTag>
        )}
        {rows && rows.length > 0 && (
          <p className="mt-4 text-xs" style={{ color: MUTED }}>
            Switch off anything that isn&apos;t a class (like Career Services). It won&apos;t show on your dashboard.
          </p>
        )}
        {rows && (
          <ul className="mt-2">
            {rows.map((r, i) => {
              // "Same as above" copies the nearest shown class above this one.
              const above = rows.slice(0, i).findLast((x) => !x.hidden);
              const shown = !r.hidden;
              return (
                <li
                  key={r.id}
                  className={`ob-rise py-3 ${i ? "border-t border-[var(--chip)]" : ""}`}
                  style={{ animationDelay: `${250 + Math.min(i, 8) * 45}ms` }}
                >
                  <ClassTimesRow
                    name={r.name}
                    sub={[r.code && r.code !== r.name ? r.code : "", shown ? "" : "hidden"].filter(Boolean).join(" · ")}
                    color={r.color}
                    dim={!shown}
                    noTimes={!shown}
                    value={r.times}
                    onChange={(times) => update(r.id, { times })}
                    problem={checked && shown ? timesProblem(r.times) : ""}
                    below={
                      shown &&
                      above &&
                      !isBlank(above.times) &&
                      !timesProblem(above.times) &&
                      isBlank(r.times) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3" style={{ color: MUTED }}>
                          <button
                            type="button"
                            onClick={() => update(r.id, { times: { ...above.times, days: [...above.times.days] } })}
                            className={link}
                            aria-label={`Same times as ${above.name}`}
                          >
                            Same as above
                          </button>
                        </div>
                      )
                    }
                    actions={
                      <button
                        type="button"
                        role="switch"
                        aria-checked={shown}
                        aria-label={`Show ${r.name}`}
                        onClick={() => update(r.id, { hidden: shown })}
                        className="modal-switch flex-none"
                      >
                        <span className="modal-knob" />
                      </button>
                    }
                  />
                </li>
              );
            })}
            {!rows.length && (
              <li className="py-3 text-sm" style={{ color: MUTED }}>
                No classes to set up.
              </li>
            )}
          </ul>
        )}

        <ErrorNote text={error} />
        <Actions>
          <Secondary onClick={back}>Back</Secondary>
          <Primary type="submit" disabled={busy || !rows}>
            {busy ? "Saving…" : "Save and continue"}
          </Primary>
          <Skip onClick={skip}>Skip for now</Skip>
        </Actions>
      </Card>
    </form>
  );
}

// The "Connected" pop-in: the banner rises, the badge pops, the check draws itself, and the class
// rows rise in one after another. Kept here because only this screen uses it. The global
// reduced-motion rule turns all of it off, and the resting state is the finished look.
const CONNECTED_MOTION = `
@keyframes ob-pop { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ob-check { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
@keyframes ob-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ob-banner { animation: ob-rise 0.3s ease-out both; }
.ob-pop { animation: ob-pop 0.45s 0.1s cubic-bezier(0.3, 1.4, 0.5, 1) both; }
.ob-check { stroke-dasharray: 14; animation: ob-check 0.3s 0.4s ease-out both; }
.ob-rise { animation: ob-rise 0.3s ease-out both; }
`;

// Always on top during a walkthrough. "Exit" is a full page load on purpose: it skips the
// Settings pop-up route and starts the dashboard fresh with the saved theme.
function TourBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 text-center text-sm"
      style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}
    >
      <span>
        <b>Walkthrough:</b> everything here is sample data, so just click through. Nothing is saved or sent.
      </span>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full load on purpose (see above) */}
      <a href="/" className="font-extrabold underline underline-offset-2 hover:no-underline">
        Exit walkthrough
      </a>
    </div>
  );
}

// A small "Sample" label under a field the walkthrough filled in. It goes away once you type your own.
function SampleTag({ children }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-xs" style={{ color: MUTED }}>
      <span
        className="flex-none rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}
      >
        Sample
      </span>
      <span className="pt-px">{children}</span>
    </p>
  );
}

function EmailSampleTag({ provider, values }) {
  const sample = TOUR_SAMPLE.email;
  const fields = provider === "gmail" ? ["gmailAddress", "gmailAppPassword"] : ["resendApiKey", "digestToEmail"];
  if (!fields.every((f) => values[f] === sample[f])) return null;
  return (
    <SampleTag>
      {provider === "gmail" ? "A made-up Gmail address and app password." : "A fake Resend key."} No email is sent.
    </SampleTag>
  );
}

// "07:00" → "7:00 AM".
function timeLabel(value) {
  const [h, m] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
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
