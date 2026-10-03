"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import WeekStrip from "./WeekStrip";
import QuickAdd from "./QuickAdd";
import GradeCalculator from "./GradeCalculator";
import ManageClasses from "./ManageClasses";
import EmptyState from "./EmptyState";
import UpdateNotice from "./UpdateNotice";
import AccountChip from "./AccountChip";
import NextClassCard from "./NextClassCard";
import IncomingPanel from "./IncomingPanel";
import TermView from "./TermView";
import ViewTabs, { viewForPath } from "./ViewTabs";
import { useHeadsUp } from "./useHeadsUp";
import QuickLook from "./QuickLook";
import { useGradeGoal, GoalPill, GoalTick, GoalEditor } from "./GradeGoal";
import WhatsNew from "./WhatsNew";
import { recentlyMoved } from "@/lib/changesDiff";
import SearchPalette, { SearchButton } from "./SearchPalette";
import { displayCode } from "@/lib/courseNames";

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

// Kinds of board items Quick look can show. Others (pages, peer reviews) open in the pop-up window.
const LOOK_TYPES = new Set(["assignment", "quiz", "discussion_topic"]);

// ---------- date helpers (only run in the browser, so times use your timezone) ----------

// "Oct 5 · 5:00 PM" for the compact board cards.
function formatDueShort(iso) {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
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
  clearedAnnouncements,
  events = [],
  calendarEnabled = false,
  calendarError = null,
  digestEnabled = false,
  newGrades = [],
  sessions = [],
  account = null,
  whatsNew = null,
  loadedAt,
  children, // the (empty) page under app/(dash)/layout.js
}) {
  const router = useRouter();
  // Which tab shows, from the URL: "/" is Today, "/term" is This term (see ViewTabs.jsx). Under the
  // Settings pop-up the URL is /setup, so the tab you were on stays.
  const pathname = usePathname();
  const [view, setView] = useState(() => viewForPath(pathname) || "today");
  const pathView = viewForPath(pathname);
  if (pathView && pathView !== view) setView(pathView);
  // This term mounts the first time you open it and then stays (hidden on Today), so switching
  // back and forth doesn't fetch its class breakdowns again.
  const [termOpened, setTermOpened] = useState(view === "term");
  if (view === "term" && !termOpened) setTermOpened(true);
  const todayRef = useRef(null);
  const termRef = useRef(null);
  const shownView = useRef(view);
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
  const [calc, setCalc] = useState(null); // { course, goal } while the grade calculator is open
  const [managing, setManaging] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [seenGradeKeys, setSeenGradeKeys] = useState(new Set());
  const [theme, setTheme] = useState(null); // "light" | "dark", read after load
  const [look, setLook] = useState(null); // the Quick look pop-up's item, see openLook
  const [searching, setSearching] = useState(false); // the Ctrl+K search pop-up (SearchPalette.jsx)
  // Search's words, results and row when one of its results opened Quick look: closing that Quick
  // look with Close or Escape reopens Search just as it was; a click outside closes everything.
  const [searchReturn, setSearchReturn] = useState(null);

  const refresh = () => startRefresh(() => router.refresh());

  // Switching tabs: the new tab's area fades in and rises a few pixels (the top bar stays still),
  // and the browser tab's title follows. Skipped for reduced motion.
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    document.title = view === "term" ? "This term · School Dashboard" : "School Dashboard";
    const el = (view === "term" ? termRef : todayRef).current;
    if (!el?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 180, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }
    );
  }, [view]);

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
  // Announcements you haven't cleared with Done (one list, so the hooks below don't redo work).
  const activeAnnouncements = useMemo(() => announcements.filter((a) => !dismissedIds.has(a.id)), [announcements, dismissedIds]);
  // Heads up reads every announcement, cleared ones too, so clearing the news about an exam
  // doesn't remove the exam itself.
  const examAnnouncements = useMemo(() => [...announcements, ...(clearedAnnouncements || [])], [announcements, clearedAnnouncements]);
  const headsUp = useHeadsUp({ now, items, announcements: examAnnouncements, events, courses, status });
  const colorFor = (courseId) => courseById[courseId]?.color || NEUTRAL_COLOR;
  const nameFor = (courseId, fallback) => courseById[courseId]?.name || fallback || "Personal";
  const codeFor = (courseId) => displayCode(courseById[courseId]);

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

  // Quick look: a plain click on an assignment, quiz, discussion or announcement opens it inside
  // the dashboard. Ctrl/Shift/Alt/middle clicks aren't stopped, so they go straight to Canvas.
  function openLook(e, target) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); // also tells RedirectCard to leave this click alone
    setSearchReturn(null); // Search sets it again right after when it opened this
    setLook(target);
  }

  // A fresh Search (button, Ctrl+K, "/") starts empty.
  function openSearch() {
    setSearchReturn(null);
    setSearching(true);
  }

  function lookItem(e, item) {
    if (!LOOK_TYPES.has(item.type) || !item.courseId) return; // opens in the pop-up window instead
    openLook(e, {
      kind: "item",
      key: item.key,
      type: item.type,
      courseId: item.courseId,
      id: item.plannableId,
      title: item.title,
      url: item.url,
    });
  }

  // Opening an announcement (either way) marks it read, as clicking it always has.
  function lookAnnouncement(e, a) {
    markRead(a);
    openLook(e, { kind: "announcement", type: "announcement", courseId: a.courseId, id: a.id, title: a.title, url: a.url, announcement: a });
  }

  // "What's new" (DASH-10): a row opens like a card title click; anything Quick look can't
  // show is left alone, so its link opens in the pop-up window.
  function openChange(e, c) {
    if (c.type === "announcement") {
      const a = announcements.find((x) => x.id === c.plannableId);
      if (a) lookAnnouncement(e, a);
      return;
    }
    const item = items.find((i) => i.key === c.key);
    if (item) lookItem(e, item);
  }
  const courseFor = (courseId) =>
    courseById[courseId] && { name: nameFor(courseId), code: codeFor(courseId), color: colorFor(courseId) };
  const movedFrom = now ? recentlyMoved(whatsNew?.changes || [], now) : {};

  const today = now
    ? new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "\u00A0";
  const filteredCourse = filter ? courseById[filter] : null;

  // Two tabs (DASH-17) share this shell: the top bar, the pop-ups (Search, Quick look, Grade calculator,
  // Manage classes) and the toast. On wide windows (xl) each tab fits one screen and its panels
  // scroll on their own; narrower windows stack the pieces and the page scrolls.
  // Today: a left sidebar (Next class + Grades) beside a slim 7-day strip over [board | Incoming].
  // This term: TermView.jsx (3-week calendar and exams | My classes).
  const clearAll =
    visibleAnnouncements.length > 0 ? (
      <button
        onClick={() => dismissAnnouncements(visibleAnnouncements)}
        className="text-link shrink-0 text-xs font-bold underline"
        style={{ color: INK }}
      >
        Clear {filter ? "these" : "all"} ({visibleAnnouncements.length})
      </button>
    ) : (
      <span className="shrink-0 text-xs" style={{ color: MUTED }}>Newest first</span>
    );

  return (
    <main className="flex min-h-screen flex-col gap-4 px-4 py-4 sm:px-5 xl:h-screen xl:gap-3.5 xl:overflow-y-auto">
      {/* Top bar: one row on wide windows */}
      <header className="relative z-30 flex flex-none flex-wrap items-center gap-x-3.5 gap-y-3 min-[90rem]:flex-nowrap">
        <h1 className="font-display whitespace-nowrap text-2xl font-extrabold tracking-tight xl:text-[26px]" style={{ color: INK }}>
          {today}
        </h1>
        <ViewTabs view={view} />
        <div className="panel flex min-h-[34px] flex-wrap items-center gap-x-1 rounded-full px-2.5 py-0.5">
          <Stat value={dueThisWeek} label="due this week" color="var(--blue-fg)" />
          <Stat value={overdue} label="overdue" color={overdue ? "var(--red-fg)" : "var(--line-2)"} />
          <Stat value={unreadCount} label="unread" color="var(--purple-fg)" />
          {liveGrades.length > 0 && (
            <Stat
              value={liveGrades.length}
              label={liveGrades.length === 1 ? "new grade" : "new grades"}
              color="var(--green-fg)"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto min-[90rem]:flex-nowrap">
          <SearchButton onClick={openSearch} />
          <WhatsNew whatsNew={whatsNew} now={now} courseFor={courseFor} onOpen={openChange} />
          <TopButton onClick={() => setManaging(true)}>Manage classes</TopButton>
          {/* Opens Settings as a pop-up over the dashboard (app/@modal/(.)setup). */}
          <Link href="/setup" scroll={false} className="btn btn-secondary h-[38px] px-3.5 text-sm">
            Settings
          </Link>
          <UpdateNotice />
          <TopButton onClick={refresh} disabled={isRefreshing} strong>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </TopButton>
          {/* Email summary and Dark mode live in the account menu. */}
          <AccountChip
            account={account}
            theme={theme}
            onToggleTheme={toggleTheme}
            digestEnabled={digestEnabled}
            sendingDigest={sendingDigest}
            onEmailSummary={emailSummary}
          />
        </div>
      </header>

      {termOpened && (
        <div ref={termRef} className={view === "term" ? "flex flex-col xl:min-h-0 xl:flex-1" : "hidden"}>
          <TermView
            now={now}
            courses={courses}
            items={items}
            status={status}
            headsUp={headsUp}
            announcements={activeAnnouncements}
            readIds={readIds}
            onLookItem={lookItem}
            onLookAnnouncement={lookAnnouncement}
            onCalculator={(course, goal) => setCalc({ course, goal })}
          />
        </div>
      )}
      <div ref={todayRef} className={view === "today" ? "flex flex-col gap-4 xl:min-h-[520px] xl:flex-1 xl:flex-row" : "hidden"}>
        {/* Sidebar: Next class, then every class's grade */}
        <aside
          className="flex flex-col gap-4 xl:min-h-0 xl:w-[288px] xl:flex-none xl:gap-3.5 min-[90rem]:w-[320px]"
          aria-label="Your classes"
        >
          <div className="flex-none">
            <NextClassCard
              now={now}
              courses={courses}
              sessions={sessions}
              items={items}
              status={status}
              announcements={activeAnnouncements}
              readIds={readIds}
              onLookItem={lookItem}
              onLookAnnouncement={lookAnnouncement}
              onAddTimes={() => setManaging(true)}
            />
          </div>

          <section className="panel flex flex-col px-2.5 pb-2 pt-3 xl:min-h-[160px] xl:flex-1" aria-labelledby="grades-heading">
            <div className="flex flex-none items-baseline justify-between gap-2 px-2 pb-1">
              <h2 id="grades-heading" className="font-display text-lg font-extrabold tracking-tight" style={{ color: INK }}>
                Grades
              </h2>
              {filter ? (
                <button onClick={() => setFilter(null)} className="text-link text-xs font-bold underline" style={{ color: INK }}>
                  Show all classes
                </button>
              ) : (
                <span className="text-xs" style={{ color: MUTED }}>Click a class to focus on it</span>
              )}
            </div>
            {courses.length === 0 ? (
              <Empty text="No classes to show. Use Manage classes to unhide one." />
            ) : (
              <div className="grid min-h-0 grid-cols-1 gap-0.5 sm:grid-cols-2 xl:flex-1 xl:grid-cols-1 xl:content-start xl:overflow-y-auto">
                {courses.map((c) => (
                  <GradeRow
                    key={c.id}
                    course={c}
                    active={filter === c.id}
                    dimmed={Boolean(filter) && filter !== c.id}
                    onSelect={() => setFilter(filter === c.id ? null : c.id)}
                    onCalculator={(goal) => setCalc({ course: c, goal })}
                    newGrades={gradesByCourse[c.id] || []}
                    onSeen={(list) => markGradesSeen(list)}
                  />
                ))}
              </div>
            )}
            {courses.length > 0 && (
              <p className="hidden flex-none px-2 pb-0.5 pt-1.5 text-[11.5px] leading-snug xl:block" style={{ color: MUTED }}>
                Check in, Calculator and Grades show when you point at a class.
              </p>
            )}
          </section>
        </aside>

        {/* Main area: slim 7-day strip, then board | Incoming */}
        <div className="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:flex-1 xl:gap-3.5">
          <WeekStrip
            items={visibleItems}
            status={status}
            events={events}
            calendarEnabled={calendarEnabled}
            calendarError={calendarError}
            now={now}
            colorFor={colorFor}
            nameFor={nameFor}
            onLook={lookItem}
          />

      <div className="grid grid-cols-1 gap-5 xl:min-h-[300px] xl:flex-1 xl:grid-cols-[minmax(0,1fr)_260px] xl:grid-rows-1 xl:gap-4 min-[90rem]:grid-cols-[minmax(0,1fr)_300px]">
        {/* Board */}
        <section className="flex min-h-0 min-w-0 flex-col" aria-labelledby="board-heading">
          {/* Heading row: title, the "Only X" filter chip, and the quick-add bar. */}
          <div className="mb-2.5 flex flex-none flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="board-heading" className="font-display text-xl font-extrabold tracking-tight" style={{ color: INK }}>
              Assignments
            </h2>
            {filteredCourse && (
              <button
                onClick={() => setFilter(null)}
                className="btn h-7 max-w-[180px] rounded-full bg-[var(--inverse)] pl-3 pr-2.5 text-xs text-[var(--inverse-fg)] hover:opacity-90"
                title="Show all classes"
              >
                <span className="truncate">Only {filteredCourse.name}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[11px] w-[11px] shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
            {/* QuickAdd keeps its own look; here it just loses its bottom margin and fits the row. */}
            <div className="min-w-[min(100%,420px)] flex-1 [&>form]:mb-0 [&>form]:shadow-[0_1px_2px_var(--shadow)] md:[&>form]:flex-nowrap md:[&_#quick-title]:min-w-[80px] md:[&_#quick-class]:max-w-[140px]">
              <QuickAdd
                courses={courses}
                onAdded={() => {
                  setToast({ tone: "ok", text: "To-do added to Canvas" });
                  refresh();
                }}
                onError={(text) => setToast({ tone: "error", text })}
              />
            </div>
          </div>
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
                        courseCode={codeFor(item.courseId)}
                        readIds={readIds}
                        dismissedIds={dismissedIds}
                        onLook={(e) => lookItem(e, item)}
                        onLookAnnouncement={lookAnnouncement}
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
                        movedFrom={movedFrom[item.key]}
                      />
                    )}
                    emptyKind={col.id}
                  />
                </BoardColumn>
              );
            })}
          </div>
        </section>

        {/* Incoming (DASH-15): Heads up | News (announcements) */}
        <IncomingPanel
          now={now}
          headsUp={headsUp}
          courses={courses}
          onLookItem={lookItem}
          onLookAnnouncement={lookAnnouncement}
          newsCount={visibleAnnouncements.length}
          clearAll={clearAll}
          news={
            visibleAnnouncements.length === 0 ? (
              <EmptyState kind="news" />
            ) : (
              <CardList
                cards={visibleAnnouncements}
                collapseAfter={12}
                listClassName="panel flex flex-col divide-y divide-[var(--chip)] overflow-hidden"
                renderCard={(a) => (
                  <AnnouncementCard
                    key={a.id}
                    announcement={a}
                    now={now}
                    unread={!readIds.has(a.id)}
                    color={colorFor(a.courseId)}
                    courseName={nameFor(a.courseId)}
                    courseCode={codeFor(a.courseId)}
                    onRead={() => markRead(a)}
                    onLook={(e) => lookAnnouncement(e, a)}
                    onDone={() => dismissAnnouncements([a])}
                  />
                )}
              />
            )
          }
        />
      </div>
        </div>
      </div>
      {children}
      <SearchPalette
        open={searching}
        onOpen={openSearch}
        onClose={() => setSearching(false)}
        restore={searchReturn}
        onPicked={setSearchReturn}
        courses={courses}
        items={items}
        status={status}
        announcements={activeAnnouncements}
        dismissedIds={dismissedIds}
        now={now}
        colorFor={colorFor}
        nameFor={nameFor}
        onFilter={setFilter}
        onLookItem={lookItem}
        onLookAnnouncement={lookAnnouncement}
      />
      {calc && (
        <GradeCalculator
          course={{ ...calc.course, code: displayCode(calc.course) }}
          goal={calc.goal}
          onClose={() => setCalc(null)}
        />
      )}
      {look && (
        <QuickLook
          key={`${look.type}-${look.id}`}
          target={look}
          course={{ color: colorFor(look.courseId), name: nameFor(look.courseId, items.find((i) => i.key === look.key)?.courseName), code: codeFor(look.courseId) }}
          now={now}
          boardStatus={look.kind === "item" ? status[look.key] : undefined}
          onMove={(to) => {
            const item = items.find((i) => i.key === look.key);
            if (item) moveItem(item, to);
          }}
          onDismiss={() => {
            setLook(null);
            setSearchReturn(null);
            dismissAnnouncements([look.announcement]);
          }}
          onClose={(reason) => {
            setLook(null);
            if (reason === "dismiss" && searchReturn) setSearching(true);
            else setSearchReturn(null);
          }}
        />
      )}
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

function TopButton({ children, onClick, disabled, strong, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`btn ${strong ? "btn-primary" : "btn-secondary"} h-[38px] px-3.5 text-sm`}
    >
      {children}
    </button>
  );
}

function Stat({ value, label, color }) {
  return (
    <span className="flex items-center gap-1.5 px-1.5 text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="font-extrabold" style={{ color: INK }}>
        {value ?? "–"}
      </span>
      {label}
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

// One class in the sidebar's Grades list (CLASS-8), compact so every class fits under Next class:
// a ring with the goal tick, the name (opens the course home) and the "N new" chip, then code ·
// grade and the goal pill. Check in / Calculator / Grades show only while you point at the row or
// are inside it with the keyboard (.grade-actions in globals.css). Clicking the row anywhere that
// isn't a link or button focuses the page on this class. New grades and the goal picker open
// inline, so the list can scroll without cutting them off.
function GradeRow({ course, active, dimmed, onSelect, onCalculator, newGrades, onSeen }) {
  const [open, setOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const goalPillRef = useRef(null);
  const g = useGradeGoal(course, goalOpen);
  const goalPanelId = `goal-${course.id}`;
  const score = course.score;
  const hasNew = newGrades.length > 0;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, Number(score)));
  const code = displayCode(course);
  const chip = "chip-btn pointer-events-auto rounded-md px-2 py-0.5 text-[11.5px] font-bold";
  return (
    <div
      className={`grade-item relative flex flex-col gap-[5px] rounded-[14px] px-2 py-[5px] transition-opacity ${active ? "c-tint" : "row-hover"}`}
      style={{
        "--c": course.color,
        opacity: dimmed ? 0.45 : 1,
        boxShadow: active ? "inset 0 0 0 1.5px var(--c)" : undefined,
      }}
    >
      <button
        onClick={onSelect}
        aria-pressed={active}
        aria-label={`Show only ${course.name}`}
        title={active ? "Show all classes" : "Show only this class"}
        className="absolute inset-0 rounded-[14px]"
      />
      <div className="pointer-events-none relative flex items-center gap-[11px]">
        <div
          className="grade-ring relative grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--c) ${pct * 3.6}deg, color-mix(in srgb, var(--c) 16%, var(--surface-2)) 0)`,
          }}
          aria-hidden="true"
        >
          <GoalTick goal={g.goal} />
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--surface)]">
            <span className="font-display text-[10.5px] font-extrabold tracking-tight" style={{ color: INK }}>
              {score === null ? "–" : Math.round(score) >= 100 ? "100" : `${Math.round(score)}%`}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <a
              href={course.homeUrl}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto flex min-w-0 items-center gap-1 text-sm font-bold leading-snug hover:underline"
              style={{ color: INK }}
              title={`Open ${course.name} in Canvas`}
            >
              <span className="truncate">{course.name}</span>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" style={{ color: MUTED }}>
                <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </a>
            {hasNew && (
              <button
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className={`${chip} ml-auto shrink-0 px-[7px] font-extrabold`}
                style={{ background: "var(--green-bg)", color: "var(--green-fg)" }}
              >
                {newGrades.length} new
              </button>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-xs tabular-nums" style={{ color: MUTED }}>
              {code && (
                <>
                  <b className="c-text font-bold">{code}</b>
                  {" · "}
                </>
              )}
              {score === null ? "No grade yet" : `${Number(score).toFixed(1)}%${course.grade ? ` · ${course.grade}` : ""}`}
            </p>
            <span ref={goalPillRef} className="contents">
              <GoalPill
                goal={g.goal}
                status={g.status}
                loading={g.loading}
                open={goalOpen}
                controls={goalPanelId}
                courseName={course.name}
                onToggle={() => setGoalOpen(!goalOpen)}
              />
            </span>
          </div>
        </div>
      </div>

      <div className="grade-actions pointer-events-none relative gap-[5px] pl-[51px]">
        {course.attendanceUrl && (
          <a
            href={course.attendanceUrl}
            target="_blank"
            rel="noreferrer"
            className={`${chip} c-tint c-text`}
            title="Open A+ Attendance for this class"
          >
            Check in
          </a>
        )}
        <button onClick={() => onCalculator(g.goal)} className={`${chip} flex items-center gap-1 bg-[var(--surface-2)]`} style={{ color: "var(--ink-soft)" }}>
          <CalcIcon />
          Calculator
        </button>
        <a href={course.gradesUrl} target="_blank" rel="noreferrer" className={`${chip} bg-[var(--surface-2)]`} style={{ color: "var(--ink-soft)" }}>
          Grades
        </a>
      </div>

      {(goalOpen || (hasNew && open)) && (
        <div className="pointer-events-none relative pl-[51px]">
          {goalOpen && (
            <GoalEditor
              id={goalPanelId}
              goal={g.goal}
              status={g.status}
              failed={g.failed}
              error={g.error}
              hasDropRules={g.outlook?.hasDropRules}
              unposted={g.outlook?.unposted}
              scale={g.outlook?.scheme}
              scaleReady={g.scaleReady}
              onSave={g.save}
              onClose={() => {
                setGoalOpen(false);
                goalPillRef.current?.querySelector("button")?.focus();
              }}
            />
          )}

          {hasNew && open && (
            <div className="pointer-events-auto mt-1.5 rounded-xl bg-[var(--surface)] p-2.5 shadow-[0_0_0_1px_var(--line)]" role="group" aria-label="New grades">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold" style={{ color: INK }}>
                  {newGrades.length} new grade{newGrades.length === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => {
                    setOpen(false);
                    onSeen(newGrades);
                  }}
                  className="btn btn-soft h-7 px-2.5 text-xs"
                >
                  Got it
                </button>
              </div>
              <ul className="space-y-1">
                {newGrades.slice(0, 6).map((g) => (
                  <li key={g.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onSeen([g])}
                      className="truncate font-semibold hover:underline"
                      style={{ color: "var(--ink-soft)" }}
                      title={g.name}
                    >
                      {g.name}
                    </a>
                    <span className="c-text shrink-0 font-extrabold">{scoreText(g)}</span>
                  </li>
                ))}
                {newGrades.length > 6 && (
                  <li className="text-xs" style={{ color: MUTED }}>
                    and {newGrades.length - 6} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLUMN_ACCENT = { todo: "var(--brand)", doing: "var(--amber-fg)", done: "var(--green-fg)" };

function BoardColumn({ column, count, isDropTarget, children, ...dropHandlers }) {
  const accent = COLUMN_ACCENT[column.id];
  return (
    <div
      {...dropHandlers}
      className="flex min-h-[160px] flex-col rounded-2xl transition-colors xl:min-h-0"
      style={{
        background: isDropTarget ? "var(--surface-2)" : "transparent",
        outline: isDropTarget ? `2px dashed ${accent}` : "none",
      }}
    >
      <h3
        className="mx-1 flex flex-none items-center gap-2 pb-1.5 text-sm font-extrabold"
        style={{ color: INK, borderBottom: `3px solid ${accent}` }}
        title={column.id === "done" ? "Done marks it complete in Canvas" : undefined}
      >
        {column.title}
        <span
          className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-extrabold"
          style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
        >
          {count}
        </span>
      </h3>
      <div className="max-h-[70vh] min-h-0 flex-1 overflow-y-auto px-1 pb-2 pt-2.5 xl:max-h-none">{children}</div>
    </div>
  );
}

// `splitAt` (board columns only): cards before this index are due this week, the rest are
// "Later". This week's cards are never hidden behind "Show more"; only Later folds up.
function CardList({ cards, collapseAfter, renderCard, emptyKind, splitAt, listClassName = "flex flex-col gap-2" }) {
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0 && emptyKind) return <EmptyState kind={emptyKind} />;
  const split = splitAt ?? 0;
  const collapsedLimit = collapseAfter ? Math.max(collapseAfter, split) : cards.length;
  const limit = expanded ? cards.length : collapsedLimit;
  const canCollapse = collapseAfter && cards.length > collapsedLimit;
  const hasSections = splitAt !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className={listClassName}>
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
      </div>
      {canCollapse && (
        <button onClick={() => setExpanded(!expanded)} className="btn btn-soft h-8 text-sm">
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
    <span className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: bg, color: fg }}>
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
  courseCode,
  readIds,
  dismissedIds,
  onLook,
  onLookAnnouncement,
  syncing,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onDelete,
  newGrade,
  movedFrom,
}) {
  const isNote = item.type === "planner_note";
  const done = column === "done";
  // The due pill sits top-right; in Done the short date goes there instead.
  const due = now ? dueBadge(item.dueAt, now, done) : null;
  const badges = [
    ...(newGrade ? [{ text: `New grade: ${scoreText(newGrade)}`, bg: "var(--green-bg)", fg: "var(--green-fg)" }] : []),
    ...statusBadges(item.submissions, item.newActivity),
  ];
  const kind = `${TYPE_LABELS[item.type] || "Item"}${item.points ? `, ${item.points} pts` : ""}`;
  const titleStyle = { color: INK, textDecoration: done ? "line-through" : undefined };
  const linked = (item.announcements || []).filter((a) => !dismissedIds.has(a.id));

  // Compact card (Today tab): class + due on one line, the title on one line (full title on hover),
  // then date, status badges and the actions on the last line, so a column shows ~5 cards.
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="task-card flex cursor-grab flex-col gap-1 rounded-xl px-3 py-2 active:cursor-grabbing"
      style={{ "--c": color, opacity: dragging ? 0.4 : syncing ? 0.6 : 1 }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="c-text flex min-w-0 flex-1 items-center gap-1.5 text-xs font-bold" title={courseCode ? `${courseName} (${courseCode})` : courseName}>
          <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
          <span className="truncate">{courseName}</span>
          <CourseCode code={courseCode} />
        </p>
        {due && <Badge {...due} />}
        {done && now && item.dueAt && (
          <span className="shrink-0 text-xs" style={{ color: MUTED }}>
            {new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          onClick={onLook}
          className="truncate text-sm font-bold leading-snug hover:underline"
          style={titleStyle}
          title={item.title}
        >
          {item.title}
        </a>
      ) : (
        <p className="truncate text-sm font-bold leading-snug" style={titleStyle} title={item.title}>
          {item.title}
        </p>
      )}

      {linked.length > 0 && (
        <div className="flex flex-col gap-1">
          {linked.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => onLookAnnouncement(e, a)}
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

      {/* Date and badges flow left; the buttons stay together on the right and only drop to a
          new line when the badges need the room. */}
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
        {!done && (
          <span className="mr-0.5 whitespace-nowrap text-xs" style={{ color: MUTED }} title={kind}>
            {syncing ? "Saving…" : now ? formatDueShort(item.dueAt) : "\u00A0"}
          </span>
        )}
        {done && syncing && (
          <span className="mr-0.5 text-xs" style={{ color: MUTED }}>
            Saving…
          </span>
        )}
        {movedFrom && !done && (
          <span title={`Was due ${new Date(movedFrom).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}>
            <Badge text="Moved" bg="var(--amber-bg)" fg="var(--amber-fg)" />
          </span>
        )}
        {badges.map((b) => (
          <Badge key={b.text} {...b} />
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {column === "todo" && <MoveButton onClick={() => onMove("doing")}>Start</MoveButton>}
          {column === "doing" && <MoveButton onClick={() => onMove("todo")}>Back</MoveButton>}
          {!done && (
            <MoveButton onClick={() => onMove("done")} strong>
              Done
            </MoveButton>
          )}
          {done && <MoveButton onClick={() => onMove("todo")}>Reopen</MoveButton>}
          {isNote ? (
            <button onClick={onDelete} className="ml-1 shrink-0 text-xs font-bold hover:underline" style={{ color: "var(--red-fg)" }}>
              Delete
            </button>
          ) : (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="c-text grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--surface-2)]"
              aria-label={`Open ${item.title} in Canvas`}
              title={`Open in Canvas (${kind})`}
            >
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
                <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// `strong` (Done) is tinted with the class color from the card's --c.
function MoveButton({ children, onClick, strong }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 shrink-0 rounded-md px-2.5 text-xs font-bold ${strong ? "btn-course" : "bg-[var(--chip)] hover:bg-[var(--surface-3)]"}`}
      style={strong ? undefined : { color: INK }}
    >
      {children}
    </button>
  );
}

// The small course code after a class label ("CEN 4065"); nothing when the class has no real code.
function CourseCode({ code }) {
  if (!code) return null;
  return (
    <span className="shrink-0 font-semibold tabular-nums" style={{ color: MUTED }}>
      {code}
    </span>
  );
}

function AnnouncementCard({ announcement: a, now, unread, color, courseName, courseCode, onRead, onLook, onDone }) {
  return (
    <article className="row-hover flex flex-col gap-[5px] px-4 py-[13px]" style={{ "--c": color, opacity: unread ? 1 : 0.72 }}>
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        <span className="c-text flex min-w-0 items-center gap-1.5 font-bold" title={courseCode ? `${courseName} (${courseCode})` : courseName}>
          <span className="c-dot h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
          <span className="truncate">{courseName}</span>
          <CourseCode code={courseCode} />
        </span>
        <span className="ml-auto shrink-0 font-medium" style={{ color: MUTED }}>
          {now ? timeAgo(a.postedAt, now) : " "}
        </span>
      </div>
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        onClick={onLook}
        className="font-display flex items-start gap-1.5 text-[15px] font-bold leading-tight hover:underline"
        style={{ color: INK }}
      >
        {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" aria-label="Unread" />}
        <span className="line-clamp-2">{a.title}</span>
      </a>
      {a.preview && (
        <p className="line-clamp-2 text-[13px] leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
          {a.preview}
        </p>
      )}
      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
        <span className="truncate" style={{ color: MUTED }}>
          {a.author}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {unread && (
            <button onClick={onRead} className="text-link font-bold hover:underline" style={{ color: MUTED }}>
              Mark read
            </button>
          )}
          <button onClick={onDone} className="btn btn-course h-[26px] rounded-lg px-2.5 text-xs">
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

// A small calculator for the Grades row's Calculator chip.
function CalcIcon() {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01" />
    </svg>
  );
}
