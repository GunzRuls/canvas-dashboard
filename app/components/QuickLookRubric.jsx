"use client";

import { useState } from "react";

// The grading rubric inside Quick look (DASH-12). `rubric` comes from lib/rubric.js (plain text
// only). Compact at first: one row per criterion with its points (and, once graded, the level you
// got and the teacher's comment). Each row opens to show its description and every level;
// "Show full rubric" opens them all. The class color (--c, set by Quick look) marks your level.

const INK = "var(--ink)";
const MUTED = "var(--muted)";

// Rubric points can be like 6.62, so up to 2 decimals (no trailing zeros).
function num(n) {
  return String(Number(Number(n).toFixed(2)));
}

function pts(n) {
  return `${num(n)} pt${Number(n) === 1 ? "" : "s"}`;
}

const Chevron = ({ open }) => (
  <span
    className="fold-chevron grid h-6 w-6 shrink-0 place-items-center rounded-md"
    style={{ color: MUTED, transform: open ? "rotate(90deg)" : "none" }}
    aria-hidden="true"
  >
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

// One level ("Excellent · 10 pts") as a small box; yours gets the class tint and a ring.
function Level({ rating, mine }) {
  return (
    <li
      className={`flex min-w-0 flex-1 basis-[150px] flex-col gap-0.5 rounded-xl px-3 py-2 ${mine ? "c-tint" : "bg-[var(--surface-2)]"}`}
      style={mine ? { boxShadow: "inset 0 0 0 1.5px var(--c)" } : undefined}
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] font-bold" style={{ color: INK }}>
        <span className="break-words">{rating.name || "Level"}</span>
        {rating.points !== null && <span className="font-display shrink-0 text-[13px]">{pts(rating.points)}</span>}
      </p>
      {mine && <p className="c-text text-[11px] font-extrabold uppercase tracking-wide">Your level</p>}
      {rating.details && (
        <p className="whitespace-pre-line break-words text-xs" style={{ color: "var(--ink-soft)" }}>
          {rating.details}
        </p>
      )}
    </li>
  );
}

function Criterion({ c, open, onToggle, hidePoints }) {
  const mine = c.assessment?.ratingId ? c.ratings.find((r) => r.id === c.assessment.ratingId) : null;
  const canOpen = Boolean(c.details || c.ratings.length);
  const score = c.assessment && c.assessment.points !== null && !hidePoints
    ? `${num(c.assessment.points)}${c.points !== null ? ` / ${num(c.points)}` : ""}`
    : c.points !== null
      ? pts(c.points)
      : "";

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        className="fold-summary flex w-full items-start gap-2 text-left disabled:cursor-default"
      >
        {canOpen ? <Chevron open={open} /> : <span className="w-6 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="fold-title block break-words text-sm font-bold" style={{ color: INK }}>
            {c.name}
          </span>
          {mine && !open && (
            <span className="c-tint c-text mt-1 inline-block rounded-md px-1.5 py-px text-[11px] font-bold">
              {mine.name || "Your level"}
            </span>
          )}
        </span>
        {score && (
          <span className={`font-display shrink-0 pt-0.5 text-sm font-extrabold ${c.assessment ? "c-text" : ""}`} style={c.assessment ? undefined : { color: "var(--ink-soft)" }}>
            {score}
          </span>
        )}
      </button>

      {c.assessment?.comment && (
        <p className="ml-8 mt-2 whitespace-pre-line break-words rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[13px]" style={{ color: INK }}>
          <span className="mr-1 font-bold" style={{ color: MUTED }}>
            Comment:
          </span>
          {c.assessment.comment}
        </p>
      )}

      {open && (
        <div className="ml-8 mt-2 flex flex-col gap-2">
          {c.details && (
            <p className="whitespace-pre-line break-words text-[13px]" style={{ color: "var(--ink-soft)" }}>
              {c.details}
            </p>
          )}
          {c.ratings.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={`Levels for ${c.name}`}>
              {c.ratings.map((r) => (
                <Level key={r.id} rating={r} mine={r.id === c.assessment?.ratingId} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function QuickLookRubric({ rubric }) {
  const [openIds, setOpenIds] = useState(() => new Set());
  const openable = rubric.criteria.filter((c) => c.details || c.ratings.length).map((c) => c.id);
  const allOpen = openable.length > 0 && openable.every((id) => openIds.has(id));

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showTotal = !rubric.hidePoints && rubric.total !== null;
  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--surface)]" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} aria-label="Rubric">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
            Rubric <span className="font-bold normal-case tracking-normal">· {rubric.criteria.length} criteria</span>
          </p>
          <p className="mt-0.5 break-words text-sm font-bold" style={{ color: INK }}>
            {rubric.title}
            {showTotal && !rubric.assessed && <span style={{ color: MUTED }}> · {pts(rubric.total)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rubric.assessed && rubric.earned !== null && (
            <span className="c-tint c-text font-display rounded-lg px-2.5 py-1 text-sm font-extrabold">
              You got {num(rubric.earned)}
              {showTotal ? `/${num(rubric.total)}` : ""}
            </span>
          )}
          {openable.length > 0 && (
            <button
              type="button"
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(openable))}
              className="btn btn-soft h-8 px-3 text-[13px]"
            >
              {allOpen ? "Show less" : "Show full rubric"}
            </button>
          )}
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {rubric.criteria.map((c) => (
          <Criterion key={c.id} c={c} open={openIds.has(c.id)} onToggle={() => toggle(c.id)} hidePoints={rubric.hidePoints} />
        ))}
      </ul>
    </section>
  );
}
