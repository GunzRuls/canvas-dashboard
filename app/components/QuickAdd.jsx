"use client";

import { useState } from "react";

const INK = "var(--ink)";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Adds a personal to-do as a Canvas planner note, so it appears in Canvas too.
export default function QuickAdd({ courses, onAdded, onError }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const day = date || todayLocal();
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          date: new Date(`${day}T23:59:00`).toISOString(),
          courseId: courseId ? Number(courseId) : null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setTitle("");
      setDate("");
      onAdded();
    } catch (error) {
      onError(`Canvas didn't save that to-do. ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={add} className="mb-2 flex flex-none flex-wrap gap-1.5 rounded-xl bg-[var(--surface)] p-1.5">
      <label className="sr-only" htmlFor="quick-title">New to-do</label>
      <input
        id="quick-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a to-do"
        className="min-w-[180px] flex-1 rounded-lg bg-[var(--field)] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#2D7FF9]"
      />
      <label className="sr-only" htmlFor="quick-date">Date</label>
      <input
        id="quick-date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg bg-[var(--field)] px-2 py-1.5 text-sm"
        title="Leave empty for today"
      />
      <label className="sr-only" htmlFor="quick-class">Class</label>
      <select
        id="quick-class"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="max-w-[160px] rounded-lg bg-[var(--field)] px-2 py-1.5 text-sm"
      >
        <option value="">No class</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-50"
        style={{ background: "var(--inverse)", color: "var(--inverse-fg)" }}
      >
        {saving ? "Adding…" : "Add to-do"}
      </button>
    </form>
  );
}
