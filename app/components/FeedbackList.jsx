"use client";

import { useState } from "react";
import EmptyState from "./EmptyState";
import { displayCode } from "@/lib/courseNames";
import { scoreText } from "@/lib/feedback";

// Incoming's Feedback tab (CLASS-7): comments teachers left on your graded work in the last 30
// days, newest first. The assignment title opens Quick look; a long comment opens up on click.

const INK = "var(--ink)";
const MUTED = "var(--muted)";

function timeAgo(iso, now) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Placeholder rows while Canvas answers.
function Loading() {
  return (
    <div className="panel flex flex-col overflow-hidden" aria-label="Loading teacher comments">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-[var(--chip)] px-4 py-[13px] last:border-b-0" aria-hidden="true">
          <span className="settings-skeleton block h-3 w-[40%] rounded-md bg-[var(--surface-3)]" />
          <span className="settings-skeleton block h-3.5 w-[70%] rounded-md bg-[var(--surface-3)]" />
          <span className="settings-skeleton block h-3 w-[92%] rounded-md bg-[var(--surface-3)]" />
        </div>
      ))}
    </div>
  );
}

// `list` is null while loading; IncomingPanel has already left out hidden or filtered-out classes.
export default function FeedbackList({ list, error, courses, now, newIds, onLook, onRetry }) {
  if (error) {
    return (
      <div className="panel flex flex-col items-start gap-2 px-4 py-4 text-sm" role="status">
        <p className="font-bold" style={{ color: INK }}>Couldn&apos;t load teacher comments</p>
        <p style={{ color: MUTED }}>{error}</p>
        <button onClick={onRetry} className="btn btn-secondary h-8 px-3 text-[13px]">
          Try again
        </button>
      </div>
    );
  }
  if (!list) return <Loading />;
  if (!list.length) return <EmptyState kind="feedback" />;
  const courseById = Object.fromEntries(courses.map((c) => [String(c.id), c]));

  return (
    <div className="panel flex flex-col overflow-hidden">
      {list.map((f) => (
        <FeedbackRow key={f.id} f={f} course={courseById[String(f.courseId)]} now={now} isNew={newIds.has(f.id)} onLook={onLook} />
      ))}
    </div>
  );
}

function FeedbackRow({ f, course, now, isNew, onLook }) {
  const [open, setOpen] = useState(false);
  const code = displayCode(course);
  const score = scoreText(f);
  // Long or multi-line comments show 3 lines until clicked.
  const long = f.text.length > 160 || f.text.split("\n").length > 3;

  return (
    <article className="incoming-row flex flex-col gap-[5px] border-b border-[var(--chip)] px-4 py-[13px] last:border-b-0" style={{ "--c": course.color }}>
      <div className="c-text flex min-w-0 items-center gap-1.5 text-xs font-bold" title={code ? `${course.name} (${code})` : course.name}>
        <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
        <span className="min-w-0 truncate">{course.name}</span>
        {code && (
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: MUTED }}>
            {code}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <a
          href={f.url || undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => onLook(e, f)}
          className="font-display flex min-w-0 items-start gap-1.5 text-[15px] font-bold leading-tight hover:underline"
          style={{ color: INK }}
          title={f.assignmentTitle}
        >
          {isNew && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" aria-label="New" />}
          <span className="line-clamp-2">{f.assignmentTitle}</span>
        </a>
        {score && (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-md bg-[var(--chip)] px-1.5 py-px text-[11px] font-extrabold tabular-nums" style={{ color: INK }} title="Your score">
            {score}
          </span>
        )}
      </div>
      {long ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="feedback-text rounded-md text-left text-[13px] leading-[1.45]"
          style={{ color: "var(--ink-soft)" }}
          title={open ? "Show less" : "Show the whole comment"}
        >
          <span className={`whitespace-pre-line ${open ? "" : "line-clamp-3"}`}>{f.text}</span>
          <span className="mt-0.5 block text-xs font-bold" style={{ color: MUTED }}>
            {open ? "Show less" : "Show more"}
          </span>
        </button>
      ) : (
        <p className="whitespace-pre-line text-[13px] leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
          {f.text}
        </p>
      )}
      {f.attachments.length > 0 && (
        <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold">
          {f.attachments.map((a, i) =>
            a.url ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-link max-w-full truncate underline" style={{ color: INK }} title={`Open ${a.name}`}>
                {a.name}
              </a>
            ) : (
              <span key={i} className="max-w-full truncate" style={{ color: MUTED }}>
                {a.name}
              </span>
            )
          )}
        </p>
      )}
      <p className="truncate text-xs" style={{ color: MUTED }}>
        — {f.authorName}
        {now ? ` · ${timeAgo(f.createdAt, now)}` : ""}
      </p>
    </article>
  );
}
