"use client";

import { useState } from "react";
import { Input } from "./setupHelp";

// "Move to another PC" (SET-4): save your settings as a password-locked file, then restore it
// on another computer instead of setting everything up again. The file is made and opened on the
// server (app/api/backup, lib/backup.js); this page only sends the password and the file's text.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const MIN_PASSWORD = 8;
const MAX_FILE = 256 * 1024; // same limit as lib/backup.js

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// The Settings section. `onRestored(data)` updates the form after a restore.
export function MoveToAnotherPC({ onRestored }) {
  const [open, setOpen] = useState(""); // "", "save" or "restore"
  const [done, setDone] = useState(null); // { text, notes } after a restore

  return (
    <section className="settings-card mt-8 rounded-2xl p-5" style={{ background: "var(--surface)" }}>
      <span className="font-display text-lg font-extrabold" style={{ color: INK }}>
        Move to another PC
      </span>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        Save a backup file of your settings (Canvas, calendars, morning email, and your classes&apos; names, colors and
        times), then restore it on your other computer instead of setting everything up again.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === "save" ? "" : "save")}
          aria-expanded={open === "save"}
          className="btn btn-secondary px-4 py-2 text-sm"
        >
          Save a backup…
        </button>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(open === "restore" ? "" : "restore");
          }}
          aria-expanded={open === "restore"}
          className="btn btn-secondary px-4 py-2 text-sm"
        >
          Restore from a backup…
        </button>
      </div>

      {open === "save" && <SaveBackup />}
      {open === "restore" && (
        <div className="step-in mt-4 flex flex-col gap-3">
          <p className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
            Restoring replaces this PC&apos;s settings (Canvas, calendars, morning email, and your classes&apos; names,
            colors and times) with the ones in the backup.
          </p>
          <RestoreFields
            send={postJson}
            danger
            submitLabel="Replace my settings"
            onRestored={(data) => {
              setOpen("");
              setDone({ notes: data.notes || [] });
              onRestored?.(data);
            }}
          />
        </div>
      )}
      {done && (
        <div role="status" className="step-in mt-4 text-sm">
          <p className="font-bold" style={{ color: "var(--green-fg)" }}>
            ✓ Restored. Your dashboard now uses the settings from the backup.
          </p>
          <RestoreNotes notes={done.notes} />
        </div>
      )}
    </section>
  );
}

// Password twice, then the server sends the file back as a download.
function SaveBackup() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAs, setSavedAs] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSavedAs("");
    if (password.length < MIN_PASSWORD) return setError(`Use a password with at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't make the backup.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "school-dashboard-backup.sdbackup";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setSavedAs(name);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="step-in mt-4 flex flex-col gap-3">
      <p className="text-sm" style={{ color: MUTED }}>
        Pick a password for the file. It locks your Canvas token and other keys inside it.{" "}
        <b style={{ color: INK }}>It can&apos;t be recovered if you forget it</b>; you&apos;d just make a new backup.
      </p>
      <Input
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={`Password (at least ${MIN_PASSWORD} characters)`}
        autoComplete="new-password"
        aria-label="Backup password"
      />
      <Input
        type="password"
        value={confirm}
        onChange={setConfirm}
        placeholder="Type it again"
        autoComplete="new-password"
        aria-label="Type the backup password again"
      />
      {error && <ErrorNote text={error} />}
      <div>
        <button type="submit" disabled={busy} className="btn btn-primary px-4 py-2 text-sm">
          {busy ? "Locking…" : "Save backup file"}
        </button>
      </div>
      {savedAs && (
        <p role="status" className="text-sm" style={{ color: "var(--ink-soft)" }}>
          <b style={{ color: "var(--green-fg)" }}>✓ Saved {savedAs}</b> to your Downloads folder. Copy it to the other PC
          (a USB stick, OneDrive, or email it to yourself), install the dashboard there, and pick{" "}
          <b>Restore from a backup</b>.
        </p>
      )}
    </form>
  );
}

// Pick the file, type its password, restore. Used by Settings and the first onboarding screen.
// `send(url, body)` is the caller's way of writing (onboarding's answers locally in a walkthrough).
// `onBack` (onboarding) adds a Back button beside Restore, in onboarding's larger button size.
export function RestoreFields({ send, onRestored, tour = false, danger = false, submitLabel = "Restore", onBack, children }) {
  const [file, setFile] = useState(null); // { name, text }
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // MAIL-6: set when the backup has the morning email; the next submit carries the answer.
  const [askEmail, setAskEmail] = useState(null); // { sendTime, sendDays }
  const [emailHere, setEmailHere] = useState(false); // "No, keep it on my other PC" is the default

  async function pick(e) {
    const chosen = e.target.files?.[0];
    setError("");
    setAskEmail(null);
    setEmailHere(false);
    if (!chosen) return;
    if (chosen.size > MAX_FILE) {
      setFile(null);
      return setError("That file is too big to be a backup.");
    }
    setFile({ name: chosen.name, text: await chosen.text() });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!file && !tour) return setError("Pick your backup file first.");
    if (file && !password) return setError("Type the password you picked when you saved the backup.");
    setBusy(true);
    try {
      const data = await send("/api/backup/restore", {
        file: file?.text || "",
        password,
        ...(askEmail ? { emailHere } : {}),
      });
      // Nothing was saved yet: show the question, then Restore again sends the answer.
      if (data.askEmail) return setAskEmail({ sendTime: data.sendTime, sendDays: data.sendDays });
      if (!data.ok) throw new Error(data.error || "That didn't restore.");
      setPassword("");
      onRestored(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <label className="btn btn-secondary flex-none cursor-pointer px-4 py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
          {file ? "Choose another file" : "Choose backup file"}
          <input type="file" accept=".sdbackup,.json" onChange={pick} className="sr-only" />
        </label>
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: file ? INK : MUTED }}>
          {file ? file.name : "school-dashboard-backup-….sdbackup"}
        </span>
      </div>
      <Input
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="The backup's password"
        autoComplete="off"
        aria-label="Backup password"
      />
      {children}
      {askEmail && <EmailHereQuestion ask={askEmail} value={emailHere} onChange={setEmailHere} />}
      {error && <ErrorNote text={error} />}
      <div className={`flex flex-wrap items-center gap-2 ${onBack ? "mt-3" : ""}`}>
        {onBack && (
          <button type="button" onClick={onBack} className="btn btn-secondary px-4 py-2.5 text-sm">
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className={`btn ${danger ? "btn-danger" : "btn-primary"} ${onBack ? "px-5 py-2.5" : "px-4 py-2"} text-sm`}
        >
          {busy ? "Checking with Canvas…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// "7:00 AM" from "07:00".
function clock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

// MAIL-6: a backup with the morning email would otherwise send it from both PCs.
function EmailHereQuestion({ ask, value, onChange }) {
  const when = clock(ask.sendTime);
  const options = [
    [false, "No, keep it on my other PC", "The email stays set up here, so the Email summary button still works. You can switch later in Settings."],
    [true, "Yes, send from this PC", `This PC will send it${when ? ` at ${when}` : ""}${ask.sendDays === "daily" ? " every day" : " on weekdays"}. Turn it off on the other PC, or you'll get two.`],
  ];
  return (
    <fieldset className="step-in flex flex-col gap-2 rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
      <legend className="sr-only">Send the morning email from this PC too?</legend>
      <p className="text-sm font-extrabold" style={{ color: INK }} aria-hidden="true">
        Send the morning email from this PC too?
      </p>
      <p className="text-sm" style={{ color: MUTED }}>
        Your backup has the morning email set up. If your other PC keeps sending it, you&apos;d get two each morning.
      </p>
      {options.map(([v, label, hint]) => (
        <label
          key={label}
          className="settings-card flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5"
          style={{ background: "var(--surface)", outline: value === v ? "2px solid var(--brand)" : undefined }}
        >
          <input type="radio" name="email-here" checked={value === v} onChange={() => onChange(v)} className="mt-1" />
          <span className="text-sm">
            <span className="block font-bold" style={{ color: INK }}>
              {label}
            </span>
            <span className="block" style={{ color: MUTED }}>
              {hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// What didn't come across (a calendar link that stopped working, email settings that failed).
export function RestoreNotes({ notes }) {
  if (!notes?.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {notes.map((note) => (
        <li key={note} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
          {note}
        </li>
      ))}
    </ul>
  );
}

function ErrorNote({ text }) {
  return (
    <p role="alert" className="rounded-xl px-4 py-3 text-sm font-bold" style={{ background: "var(--red-bg)", color: "var(--red-fg)" }}>
      {text}
    </p>
  );
}
