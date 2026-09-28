"use client";

import { useEffect, useState } from "react";
import { PALETTE } from "@/lib/palette";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const DAYS = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "Th"],
  [5, "F"],
  [6, "Sa"],
  [0, "Su"],
];

// Hide classes you don't need, give them shorter names, and pick their colors.
export default function ManageClasses({ allCourses, onClose, onSaved, onError }) {
  const [rows, setRows] = useState(() =>
    allCourses.map((c) => ({
      id: c.id,
      canvasName: c.canvasName,
      code: c.code,
      name: c.name === c.canvasName ? "" : c.name,
      color: c.color,
      show: !c.hidden,
      attendance: c.customAttendanceUrl || "",
      foundAttendance: c.customAttendanceUrl ? null : c.attendanceUrl,
      schedule: c.schedule || { days: [], start: "", end: "" },
    }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (id, changes) => setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hidden: rows.filter((r) => !r.show).map((r) => r.id),
          names: Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.id, r.name.trim()])),
          colors: Object.fromEntries(rows.map((r) => [r.id, r.color])),
          attendance: Object.fromEntries(
            rows.filter((r) => r.attendance.trim()).map((r) => [r.id, r.attendance.trim()])
          ),
          schedule: Object.fromEntries(
            rows
              .filter((r) => r.schedule.days.length && r.schedule.start && r.schedule.end)
              .map((r) => [r.id, r.schedule])
          ),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      onSaved();
    } catch (error) {
      onError(`Your class settings didn't save. ${error.message}`);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Manage classes">
      <button className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} aria-label="Close" />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-[var(--bg)]">
        <div className="flex items-start justify-between gap-4 p-6 pb-3">
          <div>
            <h2 className="text-2xl font-extrabold" style={{ color: INK }}>Manage classes</h2>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Hidden classes disappear from the board, announcements, grades, and the morning email.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-bold" style={{ color: INK }}>
            Close
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-4">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl bg-[var(--surface)] p-4"
              style={{ borderLeft: `6px solid ${r.color}`, opacity: r.show ? 1 : 0.55 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold leading-snug" style={{ color: INK }}>{r.canvasName}</p>
                  <p className="text-xs" style={{ color: MUTED }}>{r.code}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-bold" style={{ color: INK }}>
                  <input
                    type="checkbox"
                    checked={r.show}
                    onChange={(e) => update(r.id, { show: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Show
                </label>
              </div>
              {r.show && (
                <>
                  <label className="mt-3 block text-xs font-semibold" style={{ color: MUTED }}>
                    Display name
                    <input
                      value={r.name}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      placeholder={r.canvasName}
                      className="mt-1 block w-full rounded-lg bg-[var(--field)] px-3 py-2 text-sm font-semibold"
                      style={{ color: INK }}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold" style={{ color: MUTED }}>
                    Attendance check-in link
                    <input
                      value={r.attendance}
                      onChange={(e) => update(r.id, { attendance: e.target.value })}
                      placeholder={r.foundAttendance ? "Found A+ Attendance automatically" : "None found. Paste a link to add one"}
                      className="mt-1 block w-full rounded-lg bg-[var(--field)] px-3 py-2 text-sm"
                      style={{ color: INK }}
                    />
                  </label>
                  {(r.foundAttendance || r.attendance.trim()) && (
                    <fieldset className="mt-3">
                      <legend className="text-xs font-semibold" style={{ color: MUTED }}>
                        Class times (optional, only if Smart Check in doesn't pick this class up)
                      </legend>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {DAYS.map(([day, label]) => {
                          const on = r.schedule.days.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                update(r.id, {
                                  schedule: {
                                    ...r.schedule,
                                    days: on ? r.schedule.days.filter((d) => d !== day) : [...r.schedule.days, day],
                                  },
                                })
                              }
                              className="h-7 min-w-7 rounded-md px-1.5 text-xs font-bold"
                              style={on ? { background: r.color, color: "white" } : { background: "var(--field)", color: MUTED }}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <input
                          type="time"
                          value={r.schedule.start}
                          onChange={(e) => update(r.id, { schedule: { ...r.schedule, start: e.target.value } })}
                          className="ml-1 rounded-lg bg-[var(--field)] px-2 py-1 text-xs"
                          aria-label="Class starts"
                        />
                        <span className="text-xs" style={{ color: MUTED }}>to</span>
                        <input
                          type="time"
                          value={r.schedule.end}
                          onChange={(e) => update(r.id, { schedule: { ...r.schedule, end: e.target.value } })}
                          className="rounded-lg bg-[var(--field)] px-2 py-1 text-xs"
                          aria-label="Class ends"
                        />
                      </div>
                    </fieldset>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
                    {PALETTE.map((color) => (
                      <button
                        key={color}
                        role="radio"
                        aria-checked={r.color === color}
                        aria-label={color}
                        onClick={() => update(r.id, { color })}
                        className="h-7 w-7 rounded-full"
                        style={{
                          background: color,
                          boxShadow: r.color === color ? `0 0 0 2px var(--surface), 0 0 0 4px ${color}` : "none",
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--line)] bg-[var(--surface)] p-4">
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-60"
            style={{ background: "var(--inverse)", color: "var(--inverse-fg)" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
