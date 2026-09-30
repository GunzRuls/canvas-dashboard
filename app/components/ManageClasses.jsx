"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import ClassTimes, { EMPTY_TIMES, isBlank, timesProblem } from "./ClassTimes";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const COLOR_NAMES = ["Grape", "Tangerine", "Lagoon", "Bubblegum", "Cobalt", "Lime", "Sun", "Coral"];
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Pop-up plumbing (same as WhatIfPanel): focus moves in, Tab stays inside, Escape closes, the page
// behind doesn't scroll, and focus returns to the button that opened it.
function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    const opener = document.activeElement;
    node?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = node.contains(document.activeElement) && document.activeElement !== node;
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [ref]);
}

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
      schedule: c.schedule || EMPTY_TIMES,
    }))
  );
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false); // show class-time problems only after a save try
  const dialogRef = useRef(null);
  useDialog(dialogRef, onClose);

  const update = (id, changes) => setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  async function save() {
    // A class with half-entered times opens so you can see what to fix.
    const broken = rows.find((r) => timesProblem(r.schedule));
    if (broken) {
      setChecked(true);
      setOpenId(broken.id);
      onError(`Check the class times for ${broken.name.trim() || broken.canvasName}. ${timesProblem(broken.schedule)}`);
      return;
    }
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
              .filter((r) => !isBlank(r.schedule))
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

  const fieldClass = "rounded-[10px] bg-[var(--surface)] px-3 py-2.5 text-sm font-normal";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="modal-backdrop absolute inset-0 cursor-default" onClick={onClose} aria-label="Close manage classes" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-title"
        tabIndex={-1}
        className="modal-in relative flex max-h-full w-full max-w-[680px] flex-col"
        style={{ outline: "none" }}
      >
        <div
          className="modal-glow flex max-h-full min-h-0 flex-col overflow-y-auto rounded-[26px] bg-[var(--surface)]"
          style={{ "--c": "var(--brand)", "--ring-tint": "var(--brand-ring)", color: INK }}
        >
          <div className="flex h-2 shrink-0" aria-hidden="true">
            {PALETTE.slice(0, 6).map((color) => (
              <span key={color} className="flex-1" style={{ background: color }} />
            ))}
          </div>
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3.5 pt-5 sm:px-6">
            <div className="min-w-0">
              <h2 id="manage-title" className="font-display text-[26px] font-extrabold leading-tight">Manage classes</h2>
              <p className="mt-1 text-sm" style={{ color: MUTED }}>
                Rename, recolor, or hide a class, and set when it meets. Hidden classes disappear everywhere, including the email.
              </p>
            </div>
            <button onClick={onClose} className="btn btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
              Close
            </button>
          </div>

          <div className="flex min-h-48 flex-1 flex-col overflow-y-auto px-2 pb-2 sm:px-4">
            {rows.map((r) => {
              const open = openId === r.id;
              const display = r.name.trim() || r.canvasName;
              const sub = r.name.trim() ? r.canvasName : r.code;
              return (
                <div
                  key={r.id}
                  className={`flex flex-col gap-2.5 rounded-[14px] px-2.5 py-2.5 ${open ? "" : "row-hover"}`}
                  style={{ "--c": r.color, background: open ? "var(--hover)" : undefined }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-label={`Edit ${display}`}
                      tabIndex={-1}
                      className="c-tint flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                    >
                      <span className="c-dot h-3.5 w-3.5 rounded-full" />
                    </button>
                    <div className="min-w-0 flex-1" style={{ opacity: r.show ? 1 : 0.45 }}>
                      <p className="truncate text-[15px] font-bold">{display}</p>
                      <p className="truncate text-xs" style={{ color: MUTED }}>
                        {sub}
                        {r.show ? "" : " · hidden"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      aria-expanded={open}
                      className="btn btn-soft shrink-0 px-3 py-1.5 text-xs"
                    >
                      {open ? "Done" : "Edit"}
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.show}
                      aria-label={`Show ${display}`}
                      onClick={() => update(r.id, { show: !r.show })}
                      className="modal-switch shrink-0"
                    >
                      <span className="modal-knob" />
                    </button>
                  </div>

                  {open && (
                    <div className="flex flex-col gap-3 rounded-[14px] bg-[var(--bg)] p-3.5 sm:ml-[46px]">
                      <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                        Display name
                        <input
                          value={r.name}
                          onChange={(e) => update(r.id, { name: e.target.value })}
                          placeholder={r.canvasName}
                          className={fieldClass}
                          style={{ color: INK }}
                        />
                      </label>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-bold">Color</span>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
                          {PALETTE.map((color, i) => (
                            <button
                              key={color}
                              type="button"
                              role="radio"
                              aria-checked={r.color === color}
                              aria-label={COLOR_NAMES[i] || color}
                              onClick={() => update(r.id, { color })}
                              className="modal-swatch"
                              style={{
                                background: color,
                                boxShadow: r.color === color ? `0 0 0 3px var(--bg), 0 0 0 5px ${color}` : "none",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                        <span>
                          Attendance check-in link{" "}
                          <span className="font-normal" style={{ color: MUTED }}>
                            (optional)
                          </span>
                        </span>
                        <input
                          value={r.attendance}
                          onChange={(e) => update(r.id, { attendance: e.target.value })}
                          placeholder={r.foundAttendance ? "Found A+ Attendance automatically" : "None found. Paste a link to add one"}
                          className={fieldClass}
                          style={{ color: INK }}
                        />
                      </label>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-bold">
                          Class times{" "}
                          <span className="font-normal" style={{ color: MUTED }}>
                            (for the Next class card and Check in)
                          </span>
                        </span>
                        <ClassTimes
                          value={r.schedule}
                          onChange={(schedule) => update(r.id, { schedule })}
                          color={r.color}
                          label={display}
                          fieldBg="var(--surface)"
                          invalid={checked && Boolean(timesProblem(r.schedule))}
                        />
                        {checked && timesProblem(r.schedule) && (
                          <p className="text-xs font-bold" style={{ color: "var(--red-fg)" }}>
                            {timesProblem(r.schedule)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 justify-end gap-2.5 border-t border-[var(--chip)] px-5 pb-5 pt-3.5 sm:px-6">
            <button onClick={onClose} className="btn btn-secondary px-4 py-2.5 text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn btn-primary px-5 py-2.5 text-sm">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
