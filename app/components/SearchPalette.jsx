"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { displayCode } from "@/lib/courseNames";
import { formatSize } from "@/lib/canvasFiles";
import {
  rankEntries,
  highlight,
  snippet,
  matchLevel,
  fold,
  queryWords,
  nextDue,
  newestAnnouncements,
  fileSearchTerm,
} from "@/lib/search";

// Search (DASH-11): one box for classes, assignments, announcements and files. Ctrl+K (or "/"
// when you're not typing in a field) or the Search button opens it. Everything already on the
// page is searched right here as you type (lib/search.js ranks it); files are searched in Canvas
// a moment after you stop typing (/api/search/files). Opening a result does what clicking it on
// the dashboard does: a class filters the page, assignments and announcements open Quick look,
// files open in the pop-up window (RedirectCard.jsx), with Download as a second button.

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
const LIMITS = { class: 3, item: 6, announcement: 4, file: 6 }; // most rows per group
const GROUPS = [
  ["class", "Classes"],
  ["item", "Assignments"],
  ["announcement", "Announcements"],
  ["file", "Files"],
];
const TYPE_LABELS = {
  assignment: "Assignment",
  quiz: "Quiz",
  discussion_topic: "Discussion",
  wiki_page: "Page",
  planner_note: "Note",
  assessment_request: "Peer review",
};

// ---------- small pieces ----------

const MagnifierIcon = ({ size = 15 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

// The top bar's Search button (Dashboard.jsx).
export function SearchButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-secondary h-[38px] px-3.5 text-sm"
      aria-keyshortcuts="Control+K"
      title="Search classes, assignments, announcements and files (Ctrl+K)"
    >
      <MagnifierIcon />
      Search
      <kbd className="search-kbd">Ctrl K</kbd>
    </button>
  );
}

// Text with the matching words in <mark>.
function Hl({ text, query }) {
  return highlight(text, query).map((p, i) =>
    p.match ? (
      <mark key={i} className="search-mark">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    )
  );
}

function shortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dueText(iso, now, done) {
  if (!iso) return { text: done ? "Done" : "No due date", color: MUTED };
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (done) return { text: `Done · was due ${shortDate(iso)}`, color: "var(--green-fg)" };
  if (now && d.getTime() < now) return { text: `Overdue · ${shortDate(iso)}`, color: "var(--red-fg)" };
  return { text: `Due ${shortDate(iso)} · ${time}`, color: "var(--ink-soft)" };
}

// A tile in the class color with a small icon for the kind of thing.
const GLYPHS = {
  class: <path d="M4 6.5 12 3l8 3.5-8 3.5zM7 8.5v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5" />,
  assignment: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
  quiz: <path d="M9 11.5l2.2 2.2L15.5 9M5 4h14v16H5z" />,
  discussion_topic: <path d="M4 5h16v11H9l-5 4z" />,
  planner_note: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  announcement: <path d="M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6" />,
};

function KindTile({ kind }) {
  return (
    <span className="c-tint c-text grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[kind] || GLYPHS.assignment}
      </svg>
    </span>
  );
}

// Same file-type tile as Quick look's file list.
const FILE_KINDS = {
  pdf: { label: "PDF", bg: "var(--red-bg)", fg: "var(--red-fg)" },
  doc: { label: "DOC", bg: "var(--blue-bg)", fg: "var(--blue-fg)" },
  slides: { label: "PPT", bg: "var(--orange-bg)", fg: "var(--orange-fg)" },
  sheet: { label: "XLS", bg: "var(--green-bg)", fg: "var(--green-fg)" },
  image: { label: "IMG", bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  video: { label: "MEDIA", bg: "var(--chip)", fg: "var(--ink-soft)" },
  zip: { label: "ZIP", bg: "var(--chip)", fg: "var(--ink-soft)" },
  other: { label: "FILE", bg: "var(--chip)", fg: "var(--ink-soft)" },
};

function FileTile({ kind }) {
  const k = FILE_KINDS[kind] || FILE_KINDS.other;
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: k.bg, color: k.fg }} aria-hidden="true">
      <span className="flex flex-col items-center leading-none">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <span className="mt-0.5 text-[7.5px] font-extrabold tracking-wide">{k.label}</span>
      </span>
    </span>
  );
}

const DownloadIcon = (
  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </svg>
);

// ---------- the pop-up ----------

// Opens on Ctrl+K anywhere, or "/" outside text fields, unless another pop-up is already open.
function useShortcut(open, onOpen, onClose) {
  const ref = useRef({ open, onOpen, onClose });
  useEffect(() => {
    ref.current = { open, onOpen, onClose };
  }, [open, onOpen, onClose]);
  useEffect(() => {
    function onKey(e) {
      const { open: isOpen, onOpen: show, onClose: hide } = ref.current;
      const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
      if (!ctrlK && !slash) return;
      if (isOpen) {
        if (ctrlK) {
          e.preventDefault();
          hide();
        }
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return; // another pop-up is open
      e.preventDefault();
      show();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// Props come from Dashboard.jsx: the page's data and its own open handlers, so a result does
// exactly what clicking the same thing on the dashboard does.
export default function SearchPalette({ open, onOpen, onClose, ...rest }) {
  useShortcut(open, onOpen, onClose);
  if (!open) return null;
  return <Palette onClose={onClose} {...rest} />;
}

const NO_FILES = { list: [], skipped: 0, error: "" };

function Palette({
  onClose,
  courses,
  items,
  status,
  announcements,
  dismissedIds,
  now,
  colorFor,
  nameFor,
  onFilter,
  onLookItem,
  onLookAnnouncement,
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [fileResults, setFileResults] = useState({}); // search word -> { list, skipped, error }, while open
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const uid = useId();
  const optId = (i) => `${uid}-opt-${i}`;

  // Focus moves to the box, Tab stays inside, Escape closes, the page behind doesn't scroll,
  // and focus goes back to what opened it.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const node = dialogRef.current;
    const opener = document.activeElement;
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const els = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const inside = node.contains(document.activeElement);
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
  }, []);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const classLabel = (courseId, fallback) => {
    const c = courseById[courseId];
    return [nameFor(courseId, fallback), displayCode(c), c?.code].filter(Boolean).join(" ");
  };

  // Everything on the page, as search entries. Announcements attached to a board card are
  // searched too (by title; their message text isn't loaded).
  const entries = useMemo(() => {
    const out = courses.map((c) => ({
      kind: "class",
      key: `class-${c.id}`,
      title: c.name,
      meta: [displayCode(c), c.code, c.canvasName].filter(Boolean).join(" "),
      course: c,
    }));
    for (const item of items) {
      out.push({
        kind: "item",
        key: `item-${item.key}`,
        title: item.title,
        meta: `${classLabel(item.courseId, item.courseName)} ${TYPE_LABELS[item.type] || ""}`,
        date: item.dueAt,
        boost: status[item.key] === "done" ? -3 : 0,
        item,
      });
    }
    const seen = new Set();
    for (const a of announcements) {
      seen.add(a.id);
      out.push({
        kind: "announcement",
        key: `ann-${a.id}`,
        title: a.title,
        meta: classLabel(a.courseId),
        body: [a.preview, a.author].filter(Boolean).join(" "),
        date: a.postedAt,
        a,
      });
    }
    for (const item of items) {
      for (const a of item.announcements || []) {
        if (seen.has(a.id) || dismissedIds.has(a.id)) continue;
        seen.add(a.id);
        out.push({ kind: "announcement", key: `ann-${a.id}`, title: a.title, meta: classLabel(a.courseId), a });
      }
    }
    return out;
    // classLabel only reads courses/nameFor, which are covered here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, items, status, announcements, dismissedIds, nameFor]);

  // Files: searched in Canvas a moment after typing stops, by the longest word (Canvas matches one
  // piece of text); every word is then checked here like everything else.
  // Answers are kept per word while the pop-up is open, so deleting a letter doesn't ask again.
  const term = fileSearchTerm(query).toLowerCase();
  const courseIds = courses.map((c) => c.id).join(",");
  const files = !term ? { ...NO_FILES, loading: false } : fileResults[term] ? { ...fileResults[term], loading: false } : { ...NO_FILES, loading: true };
  const needFetch = Boolean(term) && !fileResults[term];
  useEffect(() => {
    if (!needFetch) return;
    const ctrl = new AbortController();
    const save = (result) => setFileResults((r) => ({ ...r, [term]: result }));
    const timer = setTimeout(() => {
      fetch(`/api/search/files?${new URLSearchParams({ q: term, courses: courseIds })}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!data.ok) throw new Error(data.error);
          save({ list: data.files, skipped: data.skipped, error: "" });
        })
        .catch((e) => {
          if (e.name !== "AbortError") save({ ...NO_FILES, error: "Couldn't search files in Canvas right now." });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, needFetch, courseIds]);

  const fileEntries = useMemo(
    () =>
      files.list.map((f) => ({
        kind: "file",
        key: `file-${f.course}-${f.id}`,
        title: f.name,
        meta: classLabel(f.course),
        date: f.updatedAt,
        file: f,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files.list, courses, nameFor]
  );

  // The groups to show: matches for a search, or "Jump to" when the box is empty.
  const groups = useMemo(() => {
    const t = now ?? 0; // the clock starts right after the page loads, before search can open
    if (!queryWords(query).length) {
      const isDone = (i) => status[i.key] === "done";
      const due = nextDue(items, t, isDone).map((item) => entries.find((e) => e.key === `item-${item.key}`)).filter(Boolean);
      const news = newestAnnouncements(announcements).map((a) => entries.find((e) => e.key === `ann-${a.id}`)).filter(Boolean);
      return [
        { kind: "item", label: "Next up", list: due },
        { kind: "announcement", label: "Newest announcements", list: news },
      ].filter((g) => g.list.length);
    }
    const ranked = rankEntries([...entries, ...fileEntries], query, t);
    return GROUPS.map(([kind, label]) => ({
      kind,
      label,
      list: ranked.filter((e) => e.kind === kind).slice(0, LIMITS[kind]),
    })).filter((g) => g.list.length || (g.kind === "file" && (files.loading || files.error)));
  }, [query, entries, fileEntries, items, announcements, status, now, files.loading, files.error]);

  const flat = useMemo(() => groups.flatMap((g) => g.list), [groups]);
  // Where each group's rows start in the flat list, for the row ids and the arrow keys.
  const starts = groups.map((g, gi) => groups.slice(0, gi).reduce((n, x) => n + x.list.length, 0));
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    document.getElementById(optId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Opens a result the way the dashboard would. Quick look takes the click (preventDefault), so the
  // search closes at once; an outside link is left to RedirectCard, so the search closes just after
  // (its card still reads the link while it's on the page).
  function choose(e, entry) {
    if (entry.kind === "class") {
      onFilter(entry.course.id);
      onClose();
      return;
    }
    if (entry.kind === "item") {
      if (!entry.item.url) {
        // A note has no page: show its class on the board instead.
        onFilter(entry.item.courseId || null);
        onClose();
        return;
      }
      onLookItem(e, entry.item);
    }
    if (entry.kind === "announcement") onLookAnnouncement(e, entry.a);
    if (e.defaultPrevented) onClose();
    else setTimeout(onClose, 0);
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat.length) document.getElementById(optId(activeIndex))?.click();
    } else if (e.key === "ArrowRight") {
      // At the end of the text, → jumps to the file's Download button.
      const entry = flat[activeIndex];
      const atEnd = e.currentTarget.selectionStart === query.length;
      const download = document.getElementById(`${optId(activeIndex)}-download`);
      if (entry?.kind === "file" && atEnd && download) {
        e.preventDefault();
        download.focus();
      }
    }
  }

  const hasQuery = queryWords(query).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-4 pt-[10vh]">
      <button className="modal-backdrop absolute inset-0 cursor-default" onClick={onClose} aria-label="Close search" tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="modal-in relative flex max-h-full w-full max-w-[640px] flex-col"
      >
        <div className="modal-glow flex max-h-[min(80vh,680px)] min-h-0 flex-col overflow-hidden rounded-[22px] bg-[var(--surface)]" style={{ "--c": "var(--brand)", color: INK }}>
          {/* The search box */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-3.5 py-3">
            <div className="relative flex min-w-0 flex-1 items-center">
              <span className="pointer-events-none absolute left-3.5" style={{ color: MUTED }}>
                <MagnifierIcon size={19} />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Search classes, assignments, announcements, files"
                className="h-12 min-w-0 flex-1 rounded-lg bg-[var(--field)] pl-11 pr-3 text-[17px] font-semibold"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={flat.length ? optId(activeIndex) : undefined}
                aria-autocomplete="list"
                aria-label="Search"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button onClick={onClose} className="btn btn-soft h-9 shrink-0 px-2.5 text-xs" aria-label="Close search">
              Esc
            </button>
          </div>

          {/* Results */}
          <div id={`${uid}-list`} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {!hasQuery && groups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm" style={{ color: MUTED }}>
                Type to search your classes, assignments, announcements and files.
              </p>
            )}
            {hasQuery && flat.length === 0 && !files.loading && (
              <div className="px-3 py-8 text-center">
                <p className="font-display text-lg font-extrabold">Nothing matches &ldquo;{query.trim()}&rdquo;</p>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                  Try fewer words or a different spelling.{files.error ? ` ${files.error}` : ""}
                </p>
              </div>
            )}
            {groups.map((g, gi) => (
              <div key={g.label} role="group" aria-label={g.label} className="mb-1.5 last:mb-0">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
                  {hasQuery ? g.label : `Jump to · ${g.label}`}
                  {g.kind === "file" && files.loading && <span className="font-bold normal-case tracking-normal">· Searching Canvas…</span>}
                </p>
                {g.kind === "file" && !files.loading && files.error && !g.list.length && (
                  <p className="px-3 pb-2 text-sm" style={{ color: MUTED }}>
                    {files.error}
                  </p>
                )}
                {g.list.map((entry, k) => {
                  const i = starts[gi] + k;
                  return (
                    <Row
                      key={entry.key}
                      id={optId(i)}
                      entry={entry}
                      selected={i === activeIndex}
                      onHover={() => setActive(i)}
                      onChoose={(e) => choose(e, entry)}
                      query={query}
                      now={now}
                      status={status}
                      colorFor={colorFor}
                      nameFor={nameFor}
                      courseById={courseById}
                    />
                  );
                })}
              </div>
            ))}
            {hasQuery && files.skipped > 0 && !files.loading && (
              <p className="px-3 pb-1 text-xs" style={{ color: MUTED }}>
                Canvas didn&apos;t answer for {files.skipped} class{files.skipped === 1 ? "" : "es"}, so their files may be missing.
              </p>
            )}
          </div>

          {/* Key hints */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-xs" style={{ color: MUTED }}>
            <span>
              <kbd className="search-kbd">↑</kbd> <kbd className="search-kbd">↓</kbd> move
            </span>
            <span>
              <kbd className="search-kbd">Enter</kbd> open
            </span>
            <span>
              <kbd className="search-kbd">→</kbd> download a file
            </span>
            <span>
              <kbd className="search-kbd">Esc</kbd> close
            </span>
            <span className="ml-auto hidden sm:inline">Files are searched by name in Canvas</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// One result. The row itself is the link or button that opens it, so Enter just clicks it.
function Row({ id, entry, selected, onHover, onChoose, query, now, status, colorFor, nameFor, courseById }) {
  const common = {
    id,
    role: "option",
    "aria-selected": selected,
    tabIndex: -1,
    onMouseMove: selected ? undefined : onHover,
    onClick: onChoose,
    className: "search-opt flex w-full min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left",
  };

  if (entry.kind === "class") {
    const c = entry.course;
    const code = displayCode(c);
    return (
      <div style={{ "--c": c.color }}>
        <button type="button" {...common}>
          <KindTile kind="class" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">
              <Hl text={c.name} query={query} />
            </span>
            <span className="block truncate text-xs font-semibold" style={{ color: MUTED }}>
              {code && (
                <>
                  <span className="c-text font-bold">
                    <Hl text={code} query={query} />
                  </span>
                  {" · "}
                </>
              )}
              Show only this class
            </span>
          </span>
          <span className="shrink-0 text-sm font-extrabold tabular-nums">{c.score === null || c.score === undefined ? "–" : `${Math.round(c.score)}%`}</span>
          <Enter selected={selected} label="Filter" />
        </button>
      </div>
    );
  }

  if (entry.kind === "file") {
    const f = entry.file;
    const size = formatSize(f.size);
    const color = colorFor(f.course);
    return (
      <div className="flex items-center gap-1" style={{ "--c": color }}>
        <a href={f.openUrl} target="_blank" rel="noreferrer" {...common}>
          <FileTile kind={f.kind} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold" title={f.name}>
              <Hl text={f.name} query={query} />
            </span>
            <ClassLine name={nameFor(f.course)} code={displayCode(courseById[f.course])} query={query}>
              {[size, f.updatedAt && `Updated ${shortDate(f.updatedAt)}`].filter(Boolean).join(" · ")}
            </ClassLine>
          </span>
          <Enter selected={selected} label="Open" />
        </a>
        {f.downloadUrl && (
          <a
            id={`${id}-download`}
            href={f.downloadUrl}
            download={f.name}
            data-no-redirect=""
            rel="noreferrer"
            onKeyDown={(e) => {
              // ← (or ↑ ↓) goes back to the search box.
              if (["ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                e.currentTarget.closest('[role="dialog"]')?.querySelector('[role="combobox"]')?.focus();
              }
            }}
            className="btn btn-soft h-8 shrink-0 px-2.5 text-xs"
            title={`Download ${f.name}`}
            aria-label={`Download ${f.name}`}
          >
            {DownloadIcon}
            <span className="hidden sm:inline">Download</span>
          </a>
        )}
      </div>
    );
  }

  if (entry.kind === "announcement") {
    const a = entry.a;
    const color = colorFor(a.courseId);
    // Show why it matched when the title alone doesn't explain it.
    const words = queryWords(query);
    const titleHasAll = words.every((w) => matchLevel(fold(a.title), w));
    const bodyText = words.length && !titleHasAll ? snippet(a.preview, query, 96) : "";
    return (
      <div style={{ "--c": color }}>
        <a href={a.url} target="_blank" rel="noreferrer" {...common}>
          <KindTile kind="announcement" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">
              <Hl text={a.title} query={query} />
            </span>
            {bodyText && (
              <span className="block truncate text-xs" style={{ color: "var(--ink-soft)" }}>
                <Hl text={bodyText} query={query} />
              </span>
            )}
            <ClassLine name={nameFor(a.courseId)} code={displayCode(courseById[a.courseId])} query={query}>
              {a.postedAt ? `Posted ${shortDate(a.postedAt)}` : "Announcement"}
            </ClassLine>
          </span>
          <Enter selected={selected} label="Quick look" />
        </a>
      </div>
    );
  }

  const item = entry.item;
  const color = colorFor(item.courseId);
  const done = status[item.key] === "done";
  const due = dueText(item.dueAt, now, done);
  const kind = TYPE_LABELS[item.type] || "Item";
  const Tag = item.url ? "a" : "button";
  const linkProps = item.url ? { href: item.url, target: "_blank", rel: "noreferrer" } : { type: "button" };
  return (
    <div style={{ "--c": color }}>
      <Tag {...linkProps} {...common}>
        <KindTile kind={item.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold" title={item.title} style={done ? { textDecoration: "line-through" } : undefined}>
            <Hl text={item.title} query={query} />
          </span>
          <ClassLine name={nameFor(item.courseId, item.courseName)} code={displayCode(courseById[item.courseId])} query={query}>
            <span style={{ color: due.color }}>{due.text}</span>
            <span>{` · ${kind}`}</span>
          </ClassLine>
        </span>
        <Enter selected={selected} label={!item.url ? "Show" : ["assignment", "quiz", "discussion_topic"].includes(item.type) && item.courseId ? "Quick look" : "Open"} />
      </Tag>
    </div>
  );
}

// "● Physics PHY 2048 · <children>"
function ClassLine({ name, code, query, children }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={{ color: MUTED }}>
      <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
      <span className="c-text truncate font-bold">
        <Hl text={name} query={query} />
      </span>
      {code && (
        <span className="shrink-0 tabular-nums">
          <Hl text={code} query={query} />
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

// What Enter does, shown on the highlighted row.
function Enter({ selected, label }) {
  return (
    <span className={`search-enter shrink-0 text-xs font-bold ${selected ? "" : "invisible"}`} aria-hidden="true">
      {label} <kbd className="search-kbd">↵</kbd>
    </span>
  );
}
