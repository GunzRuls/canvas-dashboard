"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { ClassTimesRow, EMPTY_TIMES, isBlank, timesProblem } from "./ClassTimes";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const COLOR_NAMES = ["Grape", "Tangerine", "Lagoon", "Bubblegum", "Cobalt", "Lime", "Sun", "Coral"];
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// Pop-up plumbing (same as GradeCalculator): focus moves in, Tab stays inside, Escape closes, the page
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

// Set when each class meets (right in its row), hide classes you don't need, and use Edit for the
// rarer stuff: a shorter name, the color, and the attendance link.
export default function ManageClasses({ allCourses, onClose, onSaved, onError }) {
  // Shown classes first (sorted once on open, so a row doesn't jump when you flip its switch).
  const [rows, setRows] = useState(() =>
    [...allCourses].sort((a, b) => Number(Boolean(a.hidden)) - Number(Boolean(b.hidden))).map((c) => ({
      id: c.id,
      canvasName: c.canvasName,
      defaultName: c.defaultName || c.canvasName, // Canvas name without the term suffix
      code: c.code,
      name: c.customName ?? (c.name === c.canvasName ? "" : c.name), // only your own rename
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
    // A shown class with half-entered times scrolls into view so you can see what to fix.
    const broken = rows.find((r) => r.show && timesProblem(r.schedule));
    if (broken) {
      setChecked(true);
      document.getElementById(`class-row-${broken.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      onError(`Check the class times for ${broken.name.trim() || broken.defaultName}. ${timesProblem(broken.schedule)}`);
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
              .filter((r) => !isBlank(r.schedule) && !timesProblem(r.schedule)) // hidden classes' unfinished times are dropped
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
        className="modal-in relative flex max-h-full w-full max-w-[960px] flex-col"
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
                Pick the days and times each class meets (for the Next class card and Check in). Leave a class empty to
                skip it. Edit renames or recolors a class; the switch hides it everywhere, including the email.
              </p>
            </div>
            <button onClick={onClose} className="btn btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
              Close
            </button>
          </div>

          <div className="flex min-h-48 flex-1 flex-col overflow-y-auto px-2 pb-2 sm:px-4">
            {rows.map((r, i) => {
              const open = openId === r.id;
              const display = r.name.trim() || r.defaultName;
              const sub = r.code || (r.name.trim() ? r.defaultName : "");
              return (
                <div
                  key={r.id}
                  className={`flex flex-col gap-2.5 px-2.5 py-3 ${i ? "border-t border-[var(--chip)]" : ""}`}
                  style={{ "--c": r.color }}
                >
                  <ClassTimesRow
                    id={`class-row-${r.id}`}
                    wide
                    name={display}
                    sub={`${sub}${r.show ? "" : " · hidden"}`}
                    color={r.color}
                    dim={!r.show}
                    noTimes={!r.show}
                    value={r.schedule}
                    onChange={(schedule) => update(r.id, { schedule })}
                    problem={checked && r.show ? timesProblem(r.schedule) : ""}
                    lead={
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : r.id)}
                        aria-label={`Edit ${display}`}
                        tabIndex={-1}
                        className="c-tint flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                      >
                        <span className="c-dot h-3.5 w-3.5 rounded-full" />
                      </button>
                    }
                    actions={
                      <div className="flex flex-none items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : r.id)}
                          aria-expanded={open}
                          aria-label={open ? `Done editing ${display}` : `Edit name and color for ${display}`}
                          className="btn btn-soft min-w-[3.25rem] justify-center px-3 py-1.5 text-xs"
                        >
                          {open ? "Done" : "Edit"}
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.show}
                          aria-label={`Show ${display}`}
                          onClick={() => update(r.id, { show: !r.show })}
                          className="modal-switch"
                        >
                          <span className="modal-knob" />
                        </button>
                      </div>
                    }
                  />

                  {open && (
                    <div className="step-in flex flex-col gap-3 rounded-[14px] bg-[var(--bg)] p-3.5 sm:ml-[46px]">
                      <label className="flex flex-col gap-1.5 text-[13px] font-bold">
                        Display name
                        <input
                          value={r.name}
                          onChange={(e) => update(r.id, { name: e.target.value })}
                          placeholder={r.defaultName}
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
