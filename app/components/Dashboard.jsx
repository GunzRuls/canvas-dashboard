"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import WeekStrip from "./WeekStrip";
import QuickAdd from "./QuickAdd";
import WhatIfPanel from "./WhatIfPanel";
import ManageClasses from "./ManageClasses";
import UpdateNotice from "./UpdateNotice";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const NEUTRAL_COLOR = "#8A879C"; // for items with no course (personal notes)
const IN_PROGRESS_KEY = "dashboard-in-progress";

const COLUMNS = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "In progress" },
  { id: "done", title: "Done" },
];

const TYPE_LABELS = {
  assignment: "Assignment",
  quiz: "Quiz",
  discussion_topic: "Discussion",
  wiki_page: "Page",
  planner_note: "Note",
  assessment_request: "Peer review",
};

// ---------- date helpers (only run in the browser, so times use your timezone) ----------

function formatDue(iso) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dueBadge(iso, now, isDone) {
  if (!iso || isDone) return null;
  const due = new Date(iso).getTime();
  if (due < now) return { text: "Overdue", bg: "var(--red-bg)", fg: "var(--red-fg)" };
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  if (days === 0) return { text: "Due today", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
  if (days === 1) return { text: "Tomorrow", bg: "var(--amber-bg)", fg: "var(--amber-fg)" };
  if (days <= 6) return { text: `In ${days} days`, bg: "var(--blue-bg)", fg: "var(--blue-fg)" };
  return { text: `In ${days} days`, bg: "var(--chip)", fg: MUTED };
}

function timeAgo(iso, now) {
  if (!iso) return "";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Soonest due first. Items with no due date go last.
function byDueDate(a, b) {
  if (!a.dueAt || !b.dueAt) return (a.dueAt ? 0 : 1) - (b.dueAt ? 0 : 1);
  return new Date(a.dueAt) - new Date(b.dueAt);
}

// The "week radar": due in the next 7 days (or already overdue), the same window as the
// "due this week" counter. Everything later, or with no due date, goes under "Later".
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function dueThisWeekOrOverdue(item, now) {
  return Boolean(item.dueAt) && new Date(item.dueAt).getTime() <= now + WEEK_MS;
}

// Done only keeps work until 5 days after its due date. It's still in Canvas after that.
const DONE_KEEP_DAYS = 5;
function stillShownInDone(item, now) {
  if (!item.dueAt) return true;
  return now - new Date(item.dueAt).getTime() < DONE_KEEP_DAYS * 24 * 60 * 60 * 1000;
}

// Done shows the most recent first, so something you just turned in is at the top.
function byDueDateNewest(a, b) {
  if (!a.dueAt || !b.dueAt) return (a.dueAt ? 0 : 1) - (b.dueAt ? 0 : 1);
  return new Date(b.dueAt) - new Date(a.dueAt);
}

// Where a card starts: Canvas's "marked complete" wins, then submission status.
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

// ---------- main component ----------

export default function Dashboard({
  courses,
  allCourses,
  items,
  announcements,
  events = [],
  calendarEnabled = false,
  calendarError = null,
  digestEnabled = false,
  newGrades = [],
  sessions = [],
  loadedAt,
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [now, setNow] = useState(null);
  const [filter, setFilter] = useState(null);
  const [status, setStatus] = useState(() =>
    Object.fromEntries(items.map((i) => [i.key, initialStatus(i)]))
  );
  const [overrideIds, setOverrideIds] = useState(() =>
    Object.fromEntries(items.filter((i) => i.override).map((i) => [i.key, i.override.id]))
  );
  const [readIds, setReadIds] = useState(() => readSetFrom(items, announcements));
  const [syncing, setSyncing] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [whatIfCourse, setWhatIfCourse] = useState(null);
  const [managing, setManaging] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [seenGradeKeys, setSeenGradeKeys] = useState(new Set());
  const [theme, setTheme] = useState(null); // "light" | "dark", read after load

  const refresh = () => startRefresh(() => router.refresh());

  // Keep Canvas data fresh without clicking Refresh: every 15 minutes while open, and when you
  // come back to the window after 3 or more minutes away.
  useEffect(() => {
    let loadedAt = Date.now();
    const reload = () => {
      loadedAt = Date.now();
      startRefresh(() => router.refresh());
    };
    const onReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt > 3 * 60 * 1000) reload();
    };
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), 15 * 60 * 1000);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [router]);

  // When the server sends fresh data (after Refresh), rebuild the board from it.
  useEffect(() => {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(IN_PROGRESS_KEY) || "[]");
    } catch {}
    const next = Object.fromEntries(items.map((i) => [i.key, initialStatus(i)]));
    for (const key of saved) if (next[key] === "todo") next[key] = "doing";
    setStatus(next);
    setOverrideIds(
      Object.fromEntries(items.filter((i) => i.override).map((i) => [i.key, i.override.id]))
    );
    setReadIds(readSetFrom(items, announcements));
    setDismissedIds(new Set());
  }, [items, announcements]);

  useEffect(() => {
    setSeenGradeKeys(new Set());
  }, [newGrades]);

  // Theme: your saved choice, otherwise whatever Windows is set to.
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem("dashboard-theme");
    } catch {}
    setTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("dashboard-theme", next);
    } catch {}
  }

  // If the filtered class gets hidden, clear the filter.
  useEffect(() => {
    if (filter && !courses.some((c) => c.id === filter)) setFilter(null);
  }, [courses, filter]);

  // Clock for "due today" / "3h ago" labels. Starts after the page loads in your browser.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 7000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const colorFor = (courseId) => courseById[courseId]?.color || NEUTRAL_COLOR;
  const nameFor = (courseId, fallback) => courseById[courseId]?.name || fallback || "Personal";

  const liveGrades = newGrades.filter((g) => !seenGradeKeys.has(g.key) && courseById[g.courseId]);
  const gradesByCourse = {};
  for (const g of liveGrades) (gradesByCourse[g.courseId] ||= []).push(g);
  const gradeForItem = (item) =>
    liveGrades.find(
      (g) =>
        g.courseId === item.courseId &&
        ((item.type === "assignment" && g.assignmentId === item.plannableId) ||
          (item.type === "quiz" && g.quizId === item.plannableId))
    );
  const checkIn = now ? findCheckIn(courses, sessions, now) : null;

  const visibleItems = items.filter((i) => !filter || i.courseId === filter);
  const visibleAnnouncements = announcements.filter(
    (a) => !dismissedIds.has(a.id) && (!filter || a.courseId === filter)
  );

  const unreadCount = visibleAnnouncements.filter((a) => !readIds.has(a.id)).length;
  const dueThisWeek = now
    ? visibleItems.filter((i) => {
        if (status[i.key] === "done" || !i.dueAt) return false;
        const t = new Date(i.dueAt).getTime();
        return t >= now && t <= now + 7 * 86400000;
      }).length
    : null;
  const overdue = now
    ? visibleItems.filter(
        (i) => status[i.key] !== "done" && i.dueAt && new Date(i.dueAt).getTime() < now
      ).length
    : null;

  function saveInProgress(nextStatus) {
    const keys = Object.keys(nextStatus).filter((k) => nextStatus[k] === "doing");
    try {
      localStorage.setItem(IN_PROGRESS_KEY, JSON.stringify(keys));
    } catch {}
  }

  function stopSyncing(key) {
    setSyncing((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  }

  async function moveItem(item, to) {
    const from = status[item.key];
    if (from === to) return;

    const nextStatus = { ...status, [item.key]: to };
    setStatus(nextStatus);
    saveInProgress(nextStatus);

    // "In progress" only exists on this dashboard. Only moves into or out of Done touch Canvas.
    const touchesCanvas = (from === "done") !== (to === "done");
    if (!touchesCanvas) return;

    setSyncing((s) => new Set(s).add(item.key));
    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannableType: item.type,
          plannableId: item.plannableId,
          overrideId: overrideIds[item.key],
          done: to === "done",
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setOverrideIds((o) => ({ ...o, [item.key]: data.overrideId }));
      setToast({ tone: "ok", text: to === "done" ? "Marked complete in Canvas" : "Unmarked in Canvas" });
    } catch (error) {
      setStatus((s) => {
        const reverted = { ...s, [item.key]: from };
        saveInProgress(reverted);
        return reverted;
      });
      setToast({ tone: "error", text: `Canvas didn't save that change. ${error.message}` });
    } finally {
      stopSyncing(item.key);
    }
  }

  async function deleteNote(item) {
    setSyncing((s) => new Set(s).add(item.key));
    try {
      const res = await fetch("/api/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.plannableId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setToast({ tone: "ok", text: "Deleted from Canvas" });
      refresh();
    } catch (error) {
      setToast({ tone: "error", text: `Canvas didn't delete that. ${error.message}` });
    } finally {
      stopSyncing(item.key);
    }
  }

  async function emailSummary() {
    setSendingDigest(true);
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setToast({ tone: "ok", text: `Summary sent to ${data.to}` });
    } catch (error) {
      setToast({ tone: "error", text: `The email didn't send. ${error.message}` });
    } finally {
      setSendingDigest(false);
    }
  }

  async function sendDismiss(list, dismiss) {
    const res = await fetch("/api/announcements/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dismiss,
        announcements: list.map((a) => ({ id: a.id, courseId: a.courseId, read: readIds.has(a.id) })),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
  }

  function setDismissed(list, dismissed) {
    setDismissedIds((d) => {
      const next = new Set(d);
      for (const a of list) dismissed ? next.add(a.id) : next.delete(a.id);
      return next;
    });
  }

  // Done: hides announcements from the dashboard and marks them read in Canvas.
  async function dismissAnnouncements(list) {
    if (!list.length) return;
    setDismissed(list, true);
    setReadIds((r) => {
      const next = new Set(r);
      for (const a of list) next.add(a.id);
      return next;
    });
    try {
      await sendDismiss(list, true);
      setToast({
        tone: "ok",
        text: list.length === 1 ? "Announcement cleared" : `${list.length} announcements cleared`,
        action: { label: "Undo", onClick: () => undoDismiss(list) },
      });
    } catch (error) {
      setDismissed(list, false);
      setToast({ tone: "error", text: `That didn't save. ${error.message}` });
    }
  }

  async function undoDismiss(list) {
    setToast(null);
    setDismissed(list, false);
    try {
      await sendDismiss(list, false);
    } catch (error) {
      setDismissed(list, true);
      setToast({ tone: "error", text: `Undo didn't save. ${error.message}` });
    }
  }

  async function markGradesSeen(list) {
    const keys = list.map((g) => g.key);
    setSeenGradeKeys((s) => new Set([...s, ...keys]));
    try {
      const res = await fetch("/api/grades/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (error) {
      setSeenGradeKeys((s) => {
        const next = new Set(s);
        for (const k of keys) next.delete(k);
        return next;
      });
      setToast({ tone: "error", text: `That didn't save. ${error.message}` });
    }
  }

  async function markRead(announcement) {
    if (readIds.has(announcement.id)) return;
    setReadIds((r) => new Set(r).add(announcement.id));
    try {
      const res = await fetch("/api/announcements/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: announcement.courseId, topicId: announcement.id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch (error) {
      setReadIds((r) => {
        const next = new Set(r);
        next.delete(announcement.id);
        return next;
      });
      setToast({ tone: "error", text: `Canvas didn't mark that as read. ${error.message}` });
    }
  }

  const today = now
    ? new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "\u00A0";
  const filteredCourse = filter ? courseById[filter] : null;

  return (
    <main className="flex min-h-screen flex-col gap-4 px-4 py-4 sm:px-6 xl:h-screen xl:overflow-y-auto">
      {/* Top bar */}
      <header className="flex flex-none flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl" style={{ color: INK }}>
            {today}
          </h1>
          <SmartCheckIn checkIn={checkIn} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stat value={dueThisWeek} label="due this week" bg="var(--blue-bg)" fg="var(--blue-fg)" />
          <Stat
            value={overdue}
            label="overdue"
            bg={overdue ? "var(--red-bg)" : "var(--surface-2)"}
            fg={overdue ? "var(--red-fg)" : MUTED}
          />
          <Stat value={unreadCount} label="unread" bg="var(--purple-bg)" fg="var(--purple-fg)" />
          {liveGrades.length > 0 && (
            <Stat
              value={liveGrades.length}
              label={liveGrades.length === 1 ? "new grade" : "new grades"}
              bg="var(--green-bg)"
              fg="var(--green-fg)"
            />
          )}
          <span className="mx-1 hidden h-6 w-px bg-[var(--line)] sm:block" />
          <TopButton onClick={toggleTheme} label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </TopButton>
          <TopButton onClick={() => setManaging(true)}>Manage classes</TopButton>
          <TopButton onClick={() => window.location.assign("/setup")}>Settings</TopButton>
          <UpdateNotice />
          {digestEnabled && (
            <TopButton onClick={emailSummary} disabled={sendingDigest}>
              {sendingDigest ? "Sending…" : "Email summary"}
            </TopButton>
          )}
          <TopButton onClick={refresh} disabled={isRefreshing} strong>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </TopButton>
        </div>
      </header>

      {/* Next 7 days */}
      <section className="flex-none" aria-label="Next 7 days">
        {calendarError && (
          <p className="mb-2 text-sm font-semibold" style={{ color: "var(--red-fg)" }}>
            Google Calendar didn't load: {calendarError}
          </p>
        )}
        <WeekStrip
          items={visibleItems}
          status={status}
          events={events}
          calendarEnabled={calendarEnabled}
          now={now}
          colorFor={colorFor}
          nameFor={nameFor}
        />
      </section>

      {/* Grades | Board | Announcements */}
      <div className="grid grid-cols-1 gap-4 xl:min-h-[520px] xl:flex-1 xl:grid-cols-[250px_minmax(0,1fr)_320px] xl:grid-rows-1">
        {/* Grades */}
        <section className="flex min-h-0 flex-col" aria-labelledby="grades-heading">
          <PanelHeading id="grades-heading" title="Grades">
            {filter ? (
              <button onClick={() => setFilter(null)} className="text-xs font-bold underline" style={{ color: INK }}>
                Show all
              </button>
            ) : (
              <span className="text-xs" style={{ color: MUTED }}>Tap one to focus</span>
            )}
          </PanelHeading>
          {courses.length === 0 ? (
            <Empty text="No classes to show. Use Manage classes to unhide one." />
          ) : (
            <div className="grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-col xl:overflow-y-auto xl:pr-1">
              {courses.map((c) => (
                <GradeTile
                  key={c.id}
                  course={c}
                  active={filter === c.id}
                  dimmed={Boolean(filter) && filter !== c.id}
                  onSelect={() => setFilter(filter === c.id ? null : c.id)}
                  onWhatIf={() => setWhatIfCourse(c)}
                  newGrades={gradesByCourse[c.id] || []}
                  onSeen={(list) => markGradesSeen(list)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Board */}
        <section className="flex min-h-0 flex-col" aria-labelledby="board-heading">
          <PanelHeading id="board-heading" title={filteredCourse ? `Assignments: ${filteredCourse.name}` : "Assignments"}>
            <span className="text-xs" style={{ color: MUTED }}>Done marks it complete in Canvas</span>
          </PanelHeading>
          <QuickAdd
            courses={courses}
            onAdded={() => {
              setToast({ tone: "ok", text: "To-do added to Canvas" });
              refresh();
            }}
            onError={(text) => setToast({ tone: "error", text })}
          />
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3 xl:grid-rows-1">
            {COLUMNS.map((col) => {
              // `now` is set after the page loads; until then use the server's load time so
              // the first draw matches and old Done cards never flash in.
              const cards = visibleItems
                .filter((i) => status[i.key] === col.id)
                .filter((i) => col.id !== "done" || stillShownInDone(i, now ?? loadedAt))
                .sort(col.id === "done" ? byDueDateNewest : byDueDate);
              return (
                <BoardColumn
                  key={col.id}
                  column={col}
                  count={cards.length}
                  isDropTarget={dropTarget === col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(col.id);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const item = items.find((i) => i.key === dragKey);
                    if (item) moveItem(item, col.id);
                    setDragKey(null);
                  }}
                >
                  <CardList
                    cards={cards}
                    collapseAfter={8}
                    splitAt={
                      col.id === "done"
                        ? undefined
                        : (() => {
                            const i = cards.findIndex((c) => !dueThisWeekOrOverdue(c, now ?? loadedAt));
                            return i === -1 ? cards.length : i;
                          })()
                    }
                    renderCard={(item) => (
                      <TaskCard
                        key={item.key}
                        item={item}
                        column={col.id}
                        now={now}
                        color={colorFor(item.courseId)}
                        courseName={nameFor(item.courseId, item.courseName)}
                        readIds={readIds}
                        onOpenAnnouncement={markRead}
                        syncing={syncing.has(item.key)}
                        dragging={dragKey === item.key}
                        onDragStart={() => setDragKey(item.key)}
                        onDragEnd={() => {
                          setDragKey(null);
                          setDropTarget(null);
                        }}
                        onMove={(to) => moveItem(item, to)}
                        onDelete={() => deleteNote(item)}
                        newGrade={gradeForItem(item)}
                      />
                    )}
                    emptyText={
                      col.id === "todo"
                        ? "Nothing left to start."
                        : col.id === "doing"
                        ? "Drag a card here when you start it."
                        : "Finished work lands here."
                    }
                  />
                </BoardColumn>
              );
            })}
          </div>
        </section>

        {/* Announcements */}
        <section className="flex min-h-0 flex-col" aria-labelledby="announcements-heading">
          <PanelHeading id="announcements-heading" title="Announcements">
            {visibleAnnouncements.length > 0 ? (
              <button
                onClick={() => dismissAnnouncements(visibleAnnouncements)}
                className="text-xs font-bold underline"
                style={{ color: INK }}
              >
                Clear {filter ? "these" : "all"} ({visibleAnnouncements.length})
              </button>
            ) : (
              <span className="text-xs" style={{ color: MUTED }}>Newest first</span>
            )}
          </PanelHeading>
          <div className="min-h-0 flex-1 xl:overflow-y-auto xl:pr-1">
            {visibleAnnouncements.length === 0 ? (
              <Empty text="All caught up. New announcements will show up here." />
            ) : (
              <CardList
                cards={visibleAnnouncements}
                collapseAfter={12}
                renderCard={(a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    now={now}
                    unread={!readIds.has(a.id)}
                    color={colorFor(a.courseId)}
                    courseName={nameFor(a.courseId)}
                    onRead={() => markRead(a)}
                    onDone={() => dismissAnnouncements([a])}
                  />
                )}
              />
            )}
          </div>
        </section>
      </div>

      {whatIfCourse && <WhatIfPanel course={whatIfCourse} onClose={() => setWhatIfCourse(null)} />}
      {managing && (
        <ManageClasses
          allCourses={allCourses}
          onClose={() => setManaging(false)}
          onSaved={() => {
            setManaging(false);
            setToast({ tone: "ok", text: "Class settings saved" });
            refresh();
          }}
          onError={(text) => setToast({ tone: "error", text })}
        />
      )}

      {toast && (
        // Bottom-center: the corners hold the announcements' Done buttons and other controls.
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl py-2.5 pl-4 pr-2 text-sm font-semibold shadow-lg"
          style={
            toast.tone === "error"
              ? { background: "var(--red-fg)", color: "var(--bg)" }
              : { background: "var(--inverse)", color: "var(--inverse-fg)" }
          }
        >
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="rounded-md px-2 py-0.5 font-bold"
              style={{ background: "color-mix(in srgb, currentColor 18%, transparent)" }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => setToast(null)}
            aria-label="Close"
            className="rounded-md px-1.5 text-base leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

function readSetFrom(items, announcements) {
  const ids = announcements.filter((a) => a.read).map((a) => a.id);
  for (const i of items) for (const a of i.announcements || []) if (a.read) ids.push(a.id);
  return new Set(ids);
}

// ---------- pieces ----------

function PanelHeading({ id, title, children }) {
  return (
    <div className="mb-2 flex flex-none items-baseline justify-between gap-2">
      <h2 id={id} className="truncate text-lg font-bold" style={{ color: INK }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function TopButton({ children, onClick, disabled, strong, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-full px-3.5 py-1.5 text-sm font-bold transition-opacity disabled:opacity-60"
      style={strong ? { background: "var(--inverse)", color: "var(--inverse-fg)" } : { background: "var(--surface)", color: INK }}
    >
      {children}
    </button>
  );
}

function Stat({ value, label, bg, fg }) {
  return (
    <span className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: bg, color: fg }}>
      <span className="font-extrabold">{value ?? "–"}</span> {label}
    </span>
  );
}

function scoreText(g) {
  if (g.points) return `${formatNumber(g.score)}/${formatNumber(g.points)}`;
  return g.grade || formatNumber(g.score);
}

function formatNumber(n) {
  return Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1);
}

function GradeTile({ course, active, dimmed, onSelect, onWhatIf, newGrades, onSeen }) {
  const score = course.score;
  const hasNew = newGrades.length > 0;
  return (
    <div
      className="relative flex-none rounded-xl p-3 text-white transition-opacity"
      style={{
        background: course.color,
        opacity: dimmed ? 0.4 : 1,
        boxShadow: active
          ? `0 0 0 2px var(--bg), 0 0 0 4px ${course.color}`
          : hasNew
          ? `0 0 0 2px var(--bg), 0 0 0 4px var(--green-fg)`
          : "none",
      }}
    >
      {/* Clicking the tile (anywhere that isn't a link or button) focuses the board on this class. */}
      <button
        onClick={onSelect}
        aria-pressed={active}
        aria-label={`Show only ${course.name}`}
        className="absolute inset-0 rounded-xl"
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <a
          href={course.homeUrl}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto line-clamp-2 text-sm font-bold leading-snug hover:underline"
          title={`Open ${course.name} in Canvas`}
        >
          {course.name}
          <svg aria-hidden="true" viewBox="0 0 12 12" className="ml-1 inline-block h-2.5 w-2.5 opacity-75">
            <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </a>
        {score === null ? (
          <span className="shrink-0 whitespace-nowrap text-sm font-bold opacity-90">No grade</span>
        ) : (
          <span className="shrink-0 text-xl font-extrabold leading-none tracking-tight">
            {Number(score).toFixed(1)}%
            {course.grade && <span className="ml-1 text-xs font-bold opacity-90">{course.grade}</span>}
          </span>
        )}
      </div>

      {hasNew && (
        <div className="relative z-10 mt-2 rounded-lg bg-black/20 p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
            <span>
              {newGrades.length} new grade{newGrades.length === 1 ? "" : "s"}
            </span>
            <button onClick={() => onSeen(newGrades)} className="rounded-full bg-white/25 px-2 py-0.5 hover:bg-white/35">
              Got it
            </button>
          </div>
          <ul className="space-y-0.5">
            {newGrades.slice(0, 4).map((g) => (
              <li key={g.key} className="flex items-baseline justify-between gap-2 text-xs">
                <a
                  href={g.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onSeen([g])}
                  className="truncate font-semibold hover:underline"
                  title={g.name}
                >
                  {g.name}
                </a>
                <span className="shrink-0 font-extrabold">{scoreText(g)}</span>
              </li>
            ))}
            {newGrades.length > 4 && <li className="text-xs opacity-80">and {newGrades.length - 4} more</li>}
          </ul>
        </div>
      )}

      <div className="relative z-10 mt-2 flex flex-wrap gap-1">
        {course.attendanceUrl && (
          <a
            href={course.attendanceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold hover:bg-white/85"
            style={{ color: course.color }}
            title="Open A+ Attendance for this class"
          >
            Check in
          </a>
        )}
        <button
          onClick={onWhatIf}
          className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold hover:bg-white/35"
        >
          What-if
        </button>
        <a
          href={course.gradesUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold hover:bg-white/35"
        >
          Grades
        </a>
      </div>
    </div>
  );
}

// ---------- Smart Check in ----------

function sessionsForToday(course, sessions, now) {
  if (course.schedule) {
    // Class times you entered in Manage classes win over the calendar.
    const d = new Date(now);
    if (!course.schedule.days.includes(d.getDay())) return [];
    const at = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      const t = new Date(now);
      t.setHours(h, m, 0, 0);
      return t.getTime();
    };
    return [{ start: at(course.schedule.start), end: at(course.schedule.end) }];
  }
  const today = new Date(now).toDateString();
  return sessions
    .filter((s) => s.courseId === course.id && new Date(s.start).toDateString() === today)
    .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }));
}

// Check-in opens 15 minutes before class and stays up until class ends.
function findCheckIn(courses, sessions, now) {
  const EARLY = 15 * 60 * 1000;
  let live = null;
  let next = null;
  for (const course of courses) {
    if (!course.attendanceUrl) continue;
    for (const s of sessionsForToday(course, sessions, now)) {
      if (now >= s.start - EARLY && now <= s.end) {
        if (!live || s.start > live.start) live = { course, ...s };
      } else if (s.start - EARLY > now && (!next || s.start < next.start)) {
        next = { course, ...s };
      }
    }
  }
  if (live) return { kind: "live", ...live };
  if (next) return { kind: "next", ...next };
  return null;
}

function SmartCheckIn({ checkIn }) {
  if (!checkIn) return null;
  const time = new Date(checkIn.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (checkIn.kind === "next") {
    return (
      <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold" style={{ color: MUTED }}>
        Next check-in: <span style={{ color: checkIn.course.color }}>{checkIn.course.name}</span> at {time}
      </span>
    );
  }
  return (
    <a
      href={checkIn.course.attendanceUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold text-white hover:brightness-110"
      style={{ background: checkIn.course.color }}
    >
      <span className="live-dot h-2 w-2 rounded-full bg-white" aria-hidden="true" />
      Check in: {checkIn.course.name}
    </a>
  );
}

function BoardColumn({ column, count, isDropTarget, children, ...dropHandlers }) {
  return (
    <div
      {...dropHandlers}
      className="flex min-h-[160px] flex-col rounded-2xl p-2 transition-colors xl:min-h-0"
      style={{
        background: isDropTarget ? "var(--surface-3)" : "var(--surface-2)",
        outline: isDropTarget ? `2px dashed ${INK}` : "none",
      }}
    >
      <h3 className="mb-2 flex flex-none items-center justify-between px-1 text-sm font-bold" style={{ color: INK }}>
        {column.title}
        <span className="rounded-full bg-[var(--surface)] px-2 text-xs" style={{ color: MUTED }}>
          {count}
        </span>
      </h3>
      <div className="max-h-[70vh] min-h-0 flex-1 overflow-y-auto xl:max-h-none">{children}</div>
    </div>
  );
}

// `splitAt` (board columns only): cards before this index are due this week, the rest are
// "Later". This week's cards are never hidden behind "Show more"; only Later folds up.
function CardList({ cards, collapseAfter, renderCard, emptyText, splitAt }) {
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0 && emptyText) {
    return (
      <p className="px-1 py-6 text-center text-sm" style={{ color: MUTED }}>
        {emptyText}
      </p>
    );
  }
  const split = splitAt ?? 0;
  const collapsedLimit = collapseAfter ? Math.max(collapseAfter, split) : cards.length;
  const limit = expanded ? cards.length : collapsedLimit;
  const canCollapse = collapseAfter && cards.length > collapsedLimit;
  const hasSections = splitAt !== undefined;
  return (
    <div className="flex flex-col gap-2">
      {hasSections ? (
        <>
          <SectionLabel label="This week" count={split} accent />
          {split === 0 && (
            <p className="px-1 pb-1 text-xs" style={{ color: MUTED }}>
              Nothing due in the next 7 days.
            </p>
          )}
          {cards.slice(0, Math.min(limit, split)).map(renderCard)}
          {split < cards.length && <SectionLabel label="Later" count={cards.length - split} />}
          {cards.slice(split, limit).map(renderCard)}
        </>
      ) : (
        cards.slice(0, limit).map(renderCard)
      )}
      {canCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg py-1.5 text-sm font-semibold hover:bg-[var(--surface)]"
          style={{ color: INK }}
        >
          {expanded ? "Show fewer" : `Show ${cards.length - limit} more`}
        </button>
      )}
    </div>
  );
}

function SectionLabel({ label, count, accent }) {
  return (
    <div
      className="flex items-center gap-2 px-1 pt-1 text-[11px] font-bold uppercase tracking-wide"
      style={{ color: accent ? "var(--blue-fg)" : MUTED }}
    >
      <span>{label}</span>
      <span className="h-px flex-1" style={{ background: "var(--line)" }} />
      <span>{count}</span>
    </div>
  );
}

function Badge({ text, bg, fg }) {
  return (
    <span className="rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: bg, color: fg }}>
      {text}
    </span>
  );
}

function statusBadges(submissions, newActivity) {
  const s = submissions || {};
  const badges = [];
  if (s.missing) badges.push({ text: "Missing", bg: "var(--red-bg)", fg: "var(--red-fg)" });
  if (s.late) badges.push({ text: "Late", bg: "var(--orange-bg)", fg: "var(--orange-fg)" });
  if (s.submitted && !s.graded) badges.push({ text: "Submitted", bg: "var(--green-bg)", fg: "var(--green-fg)" });
  if (s.graded) badges.push({ text: "Graded", bg: "var(--green-bg)", fg: "var(--green-fg)" });
  if (s.has_feedback) badges.push({ text: "New feedback", bg: "var(--purple-bg)", fg: "var(--purple-fg)" });
  if (s.excused) badges.push({ text: "Excused", bg: "var(--chip)", fg: MUTED });
  if (newActivity && !s.has_feedback) badges.push({ text: "New activity", bg: "var(--blue-bg)", fg: "var(--blue-fg)" });
  return badges;
}

function TaskCard({
  item,
  column,
  now,
  color,
  courseName,
  readIds,
  onOpenAnnouncement,
  syncing,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onDelete,
  newGrade,
}) {
  const isNote = item.type === "planner_note";
  const due = now ? dueBadge(item.dueAt, now, column === "done") : null;
  const badges = [
    ...(newGrade ? [{ text: `New grade: ${scoreText(newGrade)}`, bg: "var(--green-bg)", fg: "var(--green-fg)" }] : []),
    ...(due ? [due] : []),
    ...statusBadges(item.submissions, item.newActivity),
  ];
  const done = column === "done";
  const titleStyle = { color: INK, textDecoration: done ? "line-through" : undefined };

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-lg bg-[var(--surface)] px-2.5 py-2 active:cursor-grabbing"
      style={{ borderLeft: `5px solid ${color}`, opacity: dragging ? 0.4 : syncing ? 0.6 : 1 }}
    >
      <p className="truncate text-xs font-bold" style={{ color }} title={courseName}>
        {courseName}
      </p>

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug hover:underline"
          style={titleStyle}
        >
          {item.title}
        </a>
      ) : (
        <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug" style={titleStyle}>
          {item.title}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-xs" style={{ color: MUTED }}>
          {now ? formatDue(item.dueAt) : "\u00A0"}
        </span>
        {badges.map((b) => (
          <Badge key={b.text} {...b} />
        ))}
      </div>

      {item.announcements?.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {item.announcements.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => onOpenAnnouncement(a)}
              className="flex items-center gap-1.5 rounded-md bg-[var(--purple-bg)] px-1.5 py-0.5 text-[11px] font-bold hover:underline"
              style={{ color: "var(--purple-fg)" }}
              title={a.title}
            >
              {!readIds.has(a.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--purple-fg)]" aria-label="Unread" />}
              <span className="truncate">Announcement: {a.title}</span>
            </a>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        {column === "todo" && <MoveButton onClick={() => onMove("doing")}>Start</MoveButton>}
        {column === "doing" && <MoveButton onClick={() => onMove("todo")}>Back</MoveButton>}
        {!done && (
          <MoveButton onClick={() => onMove("done")} strong color={color}>
            Done
          </MoveButton>
        )}
        {done && <MoveButton onClick={() => onMove("todo")}>Reopen</MoveButton>}
        <span className="ml-1 truncate text-[11px] font-semibold" style={{ color: MUTED }}>
          {syncing ? "Saving…" : `${TYPE_LABELS[item.type] || "Item"}${item.points ? `, ${item.points} pts` : ""}`}
        </span>
        {isNote ? (
          <button onClick={onDelete} className="ml-auto shrink-0 text-xs font-bold hover:underline" style={{ color: "var(--red-fg)" }}>
            Delete
          </button>
        ) : (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 text-xs font-bold hover:underline"
            style={{ color }}
          >
            Open
          </a>
        )}
      </div>
    </article>
  );
}

function MoveButton({ children, onClick, strong, color }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-2 py-0.5 text-xs font-bold"
      style={strong ? { background: color, color: "white" } : { background: "var(--chip)", color: INK }}
    >
      {children}
    </button>
  );
}

function AnnouncementCard({ announcement: a, now, unread, color, courseName, onRead, onDone }) {
  return (
    <article
      className="rounded-lg bg-[var(--surface)] px-3 py-2.5"
      style={{ borderLeft: `5px solid ${color}`, opacity: unread ? 1 : 0.75 }}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-bold" style={{ color }} title={courseName}>
          {courseName}
        </span>
        <span className="shrink-0 font-semibold" style={{ color: MUTED }}>
          {now ? timeAgo(a.postedAt, now) : "\u00A0"}
        </span>
      </div>
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        onClick={onRead}
        className="mt-0.5 flex items-start gap-1.5 text-sm font-bold leading-snug hover:underline"
        style={{ color: INK }}
      >
        {unread && (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-label="Unread" />
        )}
        <span className="line-clamp-2">{a.title}</span>
      </a>
      {a.preview && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {a.preview}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="truncate" style={{ color: MUTED }}>
          {a.author}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {unread && (
            <button onClick={onRead} className="font-bold hover:underline" style={{ color: MUTED }}>
              Mark read
            </button>
          )}
          <button
            onClick={onDone}
            className="rounded-md px-2 py-0.5 font-bold text-white"
            style={{ background: color }}
          >
            Done
          </button>
        </span>
      </div>
    </article>
  );
}

function Empty({ text }) {
  return (
    <p className="rounded-xl bg-[var(--surface-2)] p-5 text-center text-sm" style={{ color: MUTED }}>
      {text}
    </p>
  );
}
