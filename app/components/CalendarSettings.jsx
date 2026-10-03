"use client";

import { useState } from "react";
import { Input, CalendarHelp, OutlookHelp } from "./setupHelp";
import { CALENDAR_LABELS } from "@/lib/calendarKind";

const INK = "var(--ink)";
const MUTED = "var(--muted)";

// Calendar parts of Settings (and the onboarding calendar step). Secret links are never sent
// to the browser: saved calendars appear only as "Google Calendar" / "Outlook calendar" rows.

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="flex gap-1 self-start rounded-xl p-1" style={{ background: "var(--surface-2)" }} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors hover:text-[var(--ink)]"
          style={value === v ? { background: "var(--surface)", color: INK } : { color: MUTED }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function ShowSelect({ value, onChange, label = "On the This term calendar, show" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg bg-[var(--field)] px-2 py-1.5 text-sm font-semibold"
      style={{ color: INK }}
    >
      <option value="classes">Classes only</option>
      <option value="all">Everything</option>
    </select>
  );
}

// Straight to the page where the link is. Outlook's addresses are the same for everyone: the
// browser's own sign-in decides whose calendar opens.
const QUICK_LINKS = {
  google: [["Open Google Calendar settings", "https://calendar.google.com/calendar/r/settings"]],
  outlook: [
    ["Open school Outlook", "https://outlook.office.com/calendar/options/calendar/SharedCalendars"],
    ["Open personal Outlook.com", "https://outlook.live.com/calendar/0/options/calendar/SharedCalendars"],
  ],
};

// Where to find the link, for the source picked in the Google / Outlook toggle. Same steps in
// onboarding and Settings, shown open, with a button straight to the right page.
export function CalendarLinkField({ source, setSource, url, setUrl, required = false }) {
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        value={source}
        onChange={setSource}
        label="Calendar from"
        options={[
          ["google", "Google Calendar"],
          ["outlook", "Outlook"],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS[source].map(([label, href]) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" className="btn btn-secondary px-3.5 py-2 text-sm">
            {label}
            <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5 opacity-60">
              <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </a>
        ))}
      </div>
      {source === "google" ? <CalendarHelp inline /> : <OutlookHelp inline />}
      <Input
        type="password"
        value={url}
        onChange={setUrl}
        required={required}
        aria-label="Secret calendar link"
        placeholder={
          source === "google"
            ? "https://calendar.google.com/calendar/ical/…/basic.ics"
            : "https://outlook.office365.com/owa/calendar/…/calendar.ics"
        }
      />
    </div>
  );
}

// `calendars`: the saved ones still kept, as { index, kind, show }.
export function LinkedCalendars({ calendars, setCalendars, newUrl, setNewUrl, newShow, setNewShow }) {
  const [source, setSource] = useState("google");
  const [adding, setAdding] = useState(calendars.length === 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: MUTED }}>
        <b style={{ color: INK }}>Google or Outlook → this dashboard.</b> Your events show on the This term calendar
        and help the Next class card find your class times. By default only events that mention one of your classes
        show up, so personal plans stay off. Pick <b style={{ color: INK }}>Everything</b> to see all of a
        calendar&apos;s events there.
      </p>

      {calendars.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--line)] rounded-xl" style={{ background: "var(--surface-2)" }}>
          {calendars.map((c) => (
            <li key={c.index} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-sm font-bold" style={{ color: INK }}>
                {CALENDAR_LABELS[c.kind] || CALENDAR_LABELS.other}
              </span>
              <span className="text-xs font-semibold" style={{ color: MUTED }} aria-hidden="true">
                On This term, show
              </span>
              <ShowSelect
                value={c.show}
                onChange={(show) => setCalendars(calendars.map((x) => (x.index === c.index ? { ...x, show } : x)))}
              />
              <button
                type="button"
                onClick={() => setCalendars(calendars.filter((x) => x.index !== c.index))}
                className="text-xs font-bold hover:underline"
                style={{ color: "var(--red-fg)" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl p-3" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
          <span className="text-sm font-bold" style={{ color: INK }}>
            {calendars.length ? "Add another calendar" : "Add a calendar"}
          </span>
          <CalendarLinkField source={source} setSource={setSource} url={newUrl} setUrl={setNewUrl} />
          <label className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
            On the This term calendar, show:
            <ShowSelect value={newShow} onChange={setNewShow} />
          </label>
          <p className="text-xs" style={{ color: MUTED }}>
            It&apos;s checked and added when you click Save.
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn btn-soft self-start px-4 py-2 text-sm">
          Add a calendar
        </button>
      )}
    </div>
  );
}

// Optional: subscribe your own calendar app to Canvas's feed, so due dates show there too.
// The subscription lives in Google/Outlook; the dashboard only hands over the link.
export function CanvasFeed() {
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await (await fetch("/api/canvas-feed")).json();
      if (!data.ok) throw new Error(data.error || "Couldn't get the link from Canvas.");
      setFeed(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const enc = encodeURIComponent;
  const webcal = feed ? feed.replace(/^https?:/i, "webcal:") : "";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: MUTED }}>
        <b style={{ color: INK }}>Canvas → Google or Outlook.</b> Puts every Canvas due date (and course events your
        teachers add) on your own calendar, updated by Canvas automatically. One click opens Google or Outlook with
        everything filled in. Announcements aren&apos;t included. Skip this if Canvas already notifies you; it&apos;s
        the same dates in one more place.
      </p>
      {!feed ? (
        <button type="button" onClick={load} disabled={loading} className="btn btn-soft self-start px-4 py-2 text-sm">
          {loading ? "Asking Canvas…" : "Set it up"}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-secondary px-3.5 py-2 text-sm" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/r?cid=${enc(webcal)}`}>
              Add to Google Calendar
            </a>
            <a className="btn btn-secondary px-3.5 py-2 text-sm" target="_blank" rel="noreferrer" href={`https://outlook.live.com/calendar/0/addfromweb?url=${enc(feed)}&name=${enc("Canvas")}`}>
              Add to Outlook.com
            </a>
            <a className="btn btn-secondary px-3.5 py-2 text-sm" target="_blank" rel="noreferrer" href={`https://outlook.office.com/calendar/0/addfromweb?url=${enc(feed)}&name=${enc("Canvas")}`}>
              Add to school Outlook
            </a>
            <button type="button" onClick={copy} className="btn btn-soft px-3.5 py-2 text-sm">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs" style={{ color: MUTED }}>
            <li>Confirm the subscription on the page that opens. New due dates can take several hours to appear.</li>
            <li>It shows up as its own calendar, so you can hide it or change its color there.</li>
            <li>
              To turn it off, remove the Canvas calendar in Google (its settings → <b>Unsubscribe</b>) or Outlook
              (right-click it → <b>Remove</b>).
            </li>
            <li>Keep the link private: anyone with it can see your due dates.</li>
          </ul>
        </>
      )}
      {error && (
        <p className="text-sm font-semibold" style={{ color: "var(--red-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
