"use client";

import { useEffect, useRef, useState } from "react";

// Quick look (DASH-9): a pop-up inside the dashboard that shows one assignment, quiz, discussion
// or announcement: when it's due, points, your submission, the full instructions and files.
// Canvas pages can't be shown inside the dashboard (Canvas forbids framing), so the content comes
// from /api/quicklook, which cleans the teacher's HTML on the server first. "Open in Canvas"
// goes to the real page (to submit) in the pop-up window from RedirectCard.jsx.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const TYPE_LABELS = {
  assignment: "Assignment",
  quiz: "Quiz",
  discussion_topic: "Discussion",
  discussion: "Discussion",
  announcement: "Announcement",
};

const SUBMIT_LABELS = {
  online_upload: "File upload",
  online_text_entry: "Text entry",
  online_url: "Website link",
  media_recording: "Media recording",
  discussion_topic: "Discussion post",
  student_annotation: "Annotation",
};

// Same pop-up plumbing as What-if: focus moves in, Tab stays inside, Escape closes, the page
// behind doesn't scroll, and focus goes back to what opened it.
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

// ---------- dates (browser only, so your timezone) ----------

function longDate(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// "in 3 days", "in 5 hours", "2 days ago"
function relative(iso, now) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  let text;
  if (mins < 60) text = `${Math.max(mins, 1)} min`;
  else if (mins < 36 * 60) {
    const h = Math.round(mins / 60);
    text = `${h} hour${h === 1 ? "" : "s"}`;
  } else {
    const d = Math.round(mins / 1440);
    text = `${d} day${d === 1 ? "" : "s"}`;
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function dueTone(iso, now, done) {
  if (done) return MUTED;
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return "var(--red-fg)";
  if (diff < 2 * 86400000) return "var(--amber-fg)";
  if (diff < 7 * 86400000) return "var(--blue-fg)";
  return MUTED;
}

function num(n) {
  return Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1);
}

// ---------- pieces ----------

function Badge({ text, bg, fg }) {
  return (
    <span className="whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: bg, color: fg }}>
      {text}
    </span>
  );
}

function submissionBadges(sub) {
  if (!sub) return [];
  const out = [];
  if (sub.excused) out.push({ text: "Excused", bg: "var(--chip)", fg: MUTED });
  if (sub.missing) out.push({ text: "Missing", bg: "var(--red-bg)", fg: "var(--red-fg)" });
  if (sub.late) out.push({ text: "Late", bg: "var(--orange-bg)", fg: "var(--orange-fg)" });
  if (sub.graded) out.push({ text: "Graded", bg: "var(--green-bg)", fg: "var(--green-fg)" });
  else if (sub.submitted) out.push({ text: "Submitted", bg: "var(--green-bg)", fg: "var(--green-fg)" });
  if (!out.length) out.push({ text: "Not submitted", bg: "var(--chip)", fg: "var(--ink-soft)" });
  return out;
}

// One fact box in the header ("Due", "Points", "Status"...).
function Fact({ label, children }) {
  return (
    <div className="min-w-0 rounded-[14px] px-3.5 py-2.5" style={{ background: "var(--glass)" }}>
      <p className="text-[11px] font-extrabold uppercase tracking-wide">{label}</p>
      <div className="mt-0.5 text-sm font-bold" style={{ color: INK }}>
        {children}
      </div>
    </div>
  );
}

function Bar({ w, h = "h-3.5" }) {
  return <span className={`settings-skeleton block ${h} rounded-md bg-[var(--surface-3)]`} style={{ width: w }} />;
}

// Placeholder shaped like the real content while Canvas answers.
function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex flex-col gap-2.5 rounded-2xl bg-[var(--surface)] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}>
        <Bar w="38%" h="h-4" />
        <Bar w="96%" />
        <Bar w="90%" />
        <Bar w="94%" />
        <Bar w="62%" />
        <span className="h-2" />
        <Bar w="30%" h="h-4" />
        <Bar w="88%" />
        <Bar w="72%" />
      </div>
      <div className="flex gap-2">
        <Bar w="140px" h="h-8" />
        <Bar w="110px" h="h-8" />
      </div>
    </div>
  );
}

const PaperclipIcon = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7.5" />
  </svg>
);
const ArrowIcon = (
  <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
    <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// `target`: { kind: "item" | "announcement", type, courseId, id, title, url }
// `boardStatus` ("todo" | "doing" | "done") and `onMove` come from the board (items only);
// `onDismiss` is the announcement's Done (hide + mark read).
export default function QuickLook({ target, course, now, boardStatus, onMove, onDismiss, onClose }) {
  const [look, setLook] = useState(null);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);
  useDialog(dialogRef, onClose);

  useEffect(() => {
    let cancelled = false;
    const q =new URLSearchParams({ type: target.type, courseId: String(target.courseId), id: String(target.id) });
    fetch(`/api/quicklook?${q}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error);
        setLook(data.look);
      })
      .catch((e) => !cancelled && setError(e.message || "Something went wrong."));
    return () => {
      cancelled = true;
    };
  }, [target.type, target.courseId, target.id]);

  const isAnnouncement = target.kind === "announcement";
  const typeLabel = TYPE_LABELS[look?.type || target.type] || "Item";
  const url = look?.url || target.url;
  const title = look?.title || target.title;
  const done = boardStatus === "done";
  const sub = look?.submission;
  const submitWays = (look?.submissionTypes || []).map((t) => SUBMIT_LABELS[t]).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="modal-backdrop absolute inset-0 cursor-default" onClick={onClose} aria-label="Close quick look" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quicklook-title"
        tabIndex={-1}
        className="modal-in relative flex max-h-full w-full max-w-[720px] flex-col"
        style={{ outline: "none" }}
      >
        <div
          className="modal-glow flex max-h-[min(88vh,860px)] min-h-0 flex-col overflow-hidden rounded-[26px] bg-[var(--bg)]"
          style={{ "--c": course.color, color: INK }}
        >
          <div className="h-2 shrink-0" style={{ background: "var(--c)" }} />

          {/* Header: type, class, title, then the facts */}
          <div className="c-tint c-text flex shrink-0 flex-col gap-3 px-5 pb-4 pt-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 text-xs font-extrabold uppercase tracking-[0.1em]">
                  <span>{typeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex min-w-0 items-center gap-1.5 normal-case tracking-normal">
                    <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
                    <span className="truncate">{course.name}</span>
                    {course.code && <span className="font-semibold opacity-80">{course.code}</span>}
                  </span>
                </p>
                <h2 id="quicklook-title" className="font-display mt-1.5 text-[24px] font-extrabold leading-tight" style={{ color: INK }}>
                  {title}
                </h2>
              </div>
              <button onClick={onClose} className="btn btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
                Close
              </button>
            </div>

            {!error && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {!look ? (
                  [0, 1, 2].map((i) => (
                    <div key={i} className={`flex flex-col gap-1.5 rounded-[14px] px-3.5 py-3 ${i === 2 ? "hidden sm:flex" : ""}`} style={{ background: "var(--glass)" }} aria-hidden="true">
                      <Bar w="40%" h="h-2.5" />
                      <Bar w="80%" />
                    </div>
                  ))
                ) : isAnnouncement || look.type === "announcement" ? (
                  <>
                    <Fact label="Posted">
                      {look.postedAt ? (
                        <>
                          {longDate(look.postedAt)}
                          {now && <span className="block text-xs font-semibold" style={{ color: MUTED }}>{relative(look.postedAt, now)}</span>}
                        </>
                      ) : (
                        "–"
                      )}
                    </Fact>
                    <Fact label="From">{look.author || "Your professor"}</Fact>
                  </>
                ) : (
                  <>
                    <Fact label="Due">
                      {look.dueAt ? (
                        <>
                          {longDate(look.dueAt)}
                          {now && (
                            <span className="block text-xs font-bold" style={{ color: dueTone(look.dueAt, now, done || sub?.submitted) }}>
                              {relative(look.dueAt, now)}
                            </span>
                          )}
                        </>
                      ) : (
                        "No due date"
                      )}
                    </Fact>
                    <Fact label={sub?.graded ? "Grade" : "Points"}>
                      {sub?.graded
                        ? `${num(sub.score)}${look.points ? ` / ${num(look.points)}` : ""}${sub.grade && !/^\d+(\.\d+)?$/.test(sub.grade) ? ` · ${sub.grade}` : ""}`
                        : look.points !== null && look.points !== undefined
                          ? `${num(look.points)} pts`
                          : "–"}
                    </Fact>
                    <Fact label="Status">
                      <span className="flex flex-wrap gap-1 pt-0.5">
                        {submissionBadges(sub).map((b) => (
                          <Badge key={b.text} {...b} />
                        ))}
                      </span>
                    </Fact>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Body: the instructions or message */}
          <div className="min-h-[200px] flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {error ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl bg-[var(--surface)] p-5" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}>
                <p className="font-display text-lg font-extrabold">Couldn&apos;t load this from Canvas</p>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {error}{url ? " You can still open it in Canvas." : ""}
                </p>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary h-10 px-4 text-sm">
                    Open in Canvas {ArrowIcon}
                  </a>
                )}
              </div>
            ) : !look ? (
              <Skeleton />
            ) : (
              <div className="flex flex-col gap-3.5">
                {look.lockNote && (
                  <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}>
                    {look.lockNote}
                  </p>
                )}
                {(look.quiz || submitWays.length > 0 || sub?.submittedAt) && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold" style={{ color: "var(--ink-soft)" }}>
                    {look.quiz?.questions ? <span>{look.quiz.questions} questions</span> : null}
                    {look.quiz?.timeLimit ? <span>{look.quiz.timeLimit} min time limit</span> : null}
                    {look.quiz?.attempts ? (
                      <span>{look.quiz.attempts === -1 ? "Unlimited attempts" : `${look.quiz.attempts} attempt${look.quiz.attempts === 1 ? "" : "s"}`}</span>
                    ) : null}
                    {submitWays.length > 0 && <span>Submit: {submitWays.join(", ")}</span>}
                    {sub?.submittedAt && <span>Turned in {longDate(sub.submittedAt)}</span>}
                  </p>
                )}

                {(look.html || !look.lockNote) && (
                  <section className="rounded-2xl bg-[var(--surface)] px-5 py-4" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} aria-label={isAnnouncement ? "Message" : "Instructions"}>
                    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
                      {isAnnouncement || look.type === "announcement" || look.type === "discussion" ? "Message" : "Instructions"}
                    </p>
                    {look.html ? (
                      // Cleaned on the server (lib/sanitizeHtml.js): only formatting, links and pictures.
                      <div className="quicklook-content" dangerouslySetInnerHTML={{ __html: look.html }} />
                    ) : (
                      <p className="text-sm" style={{ color: MUTED }}>
                        Nothing written in Canvas for this one.
                      </p>
                    )}
                  </section>
                )}

                {look.files?.length > 0 && (
                  <section aria-label="Files">
                    <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
                      Files
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {look.files.map((f) => (
                        <li key={f.url}>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex max-w-[300px] items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-[13px] font-bold shadow-[inset_0_0_0_1px_var(--line)] transition-shadow hover:shadow-[inset_0_0_0_1.5px_var(--c)]"
                            style={{ color: INK }}
                            title={f.name}
                          >
                            <span className="c-text shrink-0">{PaperclipIcon}</span>
                            <span className="truncate">{f.name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Actions: the card's own moves on the left, Canvas on the right */}
          {(url || isAnnouncement || boardStatus) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3 sm:px-6">
              {isAnnouncement ? (
                <button onClick={onDismiss} className="btn btn-course h-10 px-4 text-sm" title="Hide it here and mark it read in Canvas">
                  Done
                </button>
              ) : boardStatus ? (
                <>
                  <span className="mr-1 text-xs font-semibold" style={{ color: MUTED }}>
                    On your board: <b style={{ color: INK }}>{{ todo: "To do", doing: "In progress", done: "Done" }[boardStatus]}</b>
                  </span>
                  {boardStatus === "todo" && (
                    <button onClick={() => onMove("doing")} className="btn btn-soft h-10 px-4 text-sm">
                      Start
                    </button>
                  )}
                  {boardStatus === "doing" && (
                    <button onClick={() => onMove("todo")} className="btn btn-soft h-10 px-4 text-sm">
                      Back to To do
                    </button>
                  )}
                  {!done && (
                    <button onClick={() => onMove("done")} className="btn btn-course h-10 px-4 text-sm" title="Marks it complete in Canvas">
                      Done
                    </button>
                  )}
                  {done && (
                    <button onClick={() => onMove("todo")} className="btn btn-soft h-10 px-4 text-sm">
                      Reopen
                    </button>
                  )}
                </>
              ) : null}
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary ml-auto h-10 px-4 text-sm">
                  Open in Canvas {ArrowIcon}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
