"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { weekStart, dayRange } from "@/lib/crunch";
import { displayCode } from "@/lib/courseNames";
import { groupTotals } from "@/lib/gradeMath";
import { letterScale, letterFor } from "@/lib/gradeGoals";
import { goalSentence } from "@/lib/gradeCalc";
import { DateTile, countdownStyle, examLink, examTime, Related } from "./HeadsUp";
import { useGradeGoal, GoalPill, GoalTick, GoalEditor } from "./GradeGoal";
import { classGlance, dueCountdown } from "@/lib/classGlance";

const INK = "var(--ink)";
const MUTED = "var(--muted)";
const DAY = 24 * 60 * 60 * 1000;
const WEEK_NAMES = ["This week", "Next week", "Week after next"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOWN_PER_DAY = 5; // items a day shows before "+N more"

// Same rule as the board: Canvas's "marked complete" wins, then submission status.
function initialStatus(item) {
  if (item.override) return item.override.done ? "done" : "todo";
  if (item.submissions?.submitted) return "done";
  return "todo";
}

function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "Tue 10/6, 8 AM", or just the day when the time isn't known.
function shortWhen(exam) {
  const d = new Date(exam.at);
  const day = `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
  if (!exam.hasTime) return day;
  return `${day}, ${d.toLocaleTimeString(undefined, d.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" })}`;
}

function Star({ className = "h-[11px] w-[11px]" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="currentColor">
      <path d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.4L12 16.9 6.3 20.1l1.4-6.4L2.9 9.4l6.4-.7z" />
    </svg>
  );
}

// This term (DASH-16). Left, "Coming up": this week and the next two on a calendar (items as
// class-colored dots, exams as stars, a heavy week shaded amber) with the exam cards under it.
// Right, "My classes": each class's grade, its real Canvas categories as a bar (solid = graded,
// striped = still to come), its next exam and goal; a row opens to the class at a glance, the
// category table, one goal sentence and the grade calculator. Pointing at a class lights up its work
// on the calendar.
export default function TermView({ now, courses, items, status, headsUp, announcements = [], readIds, onLookItem, onLookAnnouncement, onCalculator }) {
  const [hover, setHover] = useState(null); // course id lit up on the calendar
  const [openId, setOpenId] = useState(null); // the class row that's open
  const breakdowns = useBreakdowns(courses);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [String(c.id), c])), [courses]);
  const hovered = hover !== null ? courseById[String(hover)] : null;
  const nextExam = (courseId) => headsUp.exams.find((x) => String(x.courseId) === String(courseId)) || null;

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1 xl:flex-row">
      <section className="flex min-w-0 flex-col gap-2.5 xl:min-h-0 xl:flex-1" aria-labelledby="comingup-heading">
        <div className="flex min-h-10 flex-none flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id="comingup-heading" className="font-display whitespace-nowrap text-xl font-extrabold tracking-tight" style={{ color: INK }}>
            Coming up
          </h2>
          {now && (
            <span className="whitespace-nowrap text-[13px] font-semibold" style={{ color: MUTED }}>
              {dayRange(weekStart(now), weekStart(now) + 20 * DAY)}
            </span>
          )}
          {hovered && (
            <button
              onClick={() => setHover(null)}
              className="c-tint c-text flex h-[26px] max-w-[300px] items-center gap-1.5 rounded-full px-2.5 text-xs font-extrabold"
              style={{ "--c": hovered.color, boxShadow: "inset 0 0 0 1.5px var(--c)" }}
              title="Show every class"
            >
              <span className="c-dot h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />
              <span className="truncate">Showing {hovered.name}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[10px] w-[10px] shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
          <div className="ml-auto flex items-center gap-3.5 whitespace-nowrap text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            <span className="flex items-center gap-[5px]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--ink-soft)]" aria-hidden="true" />
              Due
            </span>
            <span className="flex items-center gap-[5px]">
              <Star className="h-3 w-3" />
              Exam
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="h-2.5 w-3 rounded-[3px]" style={{ background: "var(--heavy)", boxShadow: "inset 0 0 0 1.5px var(--amber-line)" }} aria-hidden="true" />
              Heavy week
            </span>
          </div>
        </div>

        <Calendar now={now} items={items} status={status} exams={headsUp.exams} crunch={headsUp.crunch} courseById={courseById} hover={hover} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />

        <ExamCards exams={headsUp.exams} ready={headsUp.ready} courseById={courseById} hover={hover} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
      </section>

      <section
        className="flex min-w-0 flex-col gap-2.5 xl:min-h-0 xl:w-[min(600px,46%)] xl:flex-none"
        aria-labelledby="classes-heading"
        onMouseLeave={() => setHover(null)}
      >
        <div className="flex min-h-10 flex-none items-center gap-3">
          <h2 id="classes-heading" className="font-display whitespace-nowrap text-xl font-extrabold tracking-tight" style={{ color: INK }}>
            My classes
          </h2>
          <div className="ml-auto flex items-center gap-3 whitespace-nowrap text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            <span className="flex items-center gap-[5px]">
              <span className="h-2 w-3.5 rounded-[3px] bg-[var(--ink-soft)]" aria-hidden="true" />
              Graded
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="tocome h-2 w-3.5 rounded-[3px]" style={{ "--c": "var(--muted)" }} aria-hidden="true" />
              Still to come
            </span>
          </div>
        </div>
        <div className="panel flex flex-col gap-0.5 overflow-x-hidden p-1.5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          {courses.length === 0 && (
            <p className="p-5 text-center text-sm" style={{ color: MUTED }}>
              No classes to show. Use Manage classes to unhide one.
            </p>
          )}
          {courses.map((c) => (
            <ClassRow
              key={c.id}
              course={c}
              data={breakdowns[c.id]}
              exam={nextExam(c.id)}
              now={now}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              matched={hover === c.id}
              onHover={() => setHover(c.id)}
              onCalculator={(goal) => onCalculator(c, goal)}
              glance={openId === c.id && now ? classGlance({ courseId: c.id, items, status, announcements, now }) : null}
              readIds={readIds}
              onLookItem={onLookItem}
              onLookAnnouncement={onLookAnnouncement}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// Each class's assignment groups from /api/breakdown, asked for after the page has loaded (one
// request per class, all at once). { [courseId]: { breakdown } | { error } }; missing = loading.
function useBreakdowns(courses) {
  const [data, setData] = useState({});
  const ids = courses.map((c) => c.id).join(",");
  useEffect(() => {
    let stop = false;
    for (const id of ids ? ids.split(",") : []) {
      fetch(`/api/breakdown?courseId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((res) => {
          if (stop) return;
          setData((d) => ({ ...d, [id]: res.ok ? { breakdown: res.breakdown } : { error: res.error || "Canvas didn't answer." } }));
        })
        .catch(() => !stop && setData((d) => ({ ...d, [id]: { error: "Canvas didn't answer." } })));
    }
    return () => {
      stop = true;
    };
  }, [ids]);
  return data;
}

// ---------- Coming up: the 3-week calendar ----------

function Calendar({ now, items, status, exams, crunch, courseById, hover, onLookItem, onLookAnnouncement }) {
  const weeks = useMemo(() => {
    if (!now) return null;
    const start = weekStart(now);
    const examItemKeys = new Set(exams.filter((x) => x.item).map((x) => x.item.key));
    const byDay = new Map();
    const push = (ms, entry) => {
      const k = dateKey(ms);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(entry);
    };
    const end = start + 21 * DAY;
    for (const i of items) {
      if (!i.dueAt) continue;
      const due = new Date(i.dueAt).getTime();
      if (due < start || due >= end + DAY) continue;
      push(due, {
        key: i.key,
        at: due,
        title: i.title,
        courseId: i.courseId,
        done: (status[i.key] ?? initialStatus(i)) === "done",
        exam: examItemKeys.has(i.key),
        href: i.url,
        open: (e) => onLookItem(e, i),
      });
    }
    // Exams found only in an announcement or a calendar event (no board card of their own).
    for (const x of exams) {
      if (x.item) continue;
      const { href, onClick } = examLink(x, onLookItem, onLookAnnouncement);
      push(x.day, { key: `exam-${x.id}`, at: x.at, title: x.title, courseId: x.courseId, done: false, exam: true, href, open: onClick });
    }
    for (const list of byDay.values()) list.sort((a, b) => b.exam - a.exam || a.at - b.at);

    const today = dateKey(now);
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    return [0, 1, 2].map((w) => {
      const ws = start + w * 7 * DAY;
      const days = DAY_NAMES.map((_, d) => {
        const ms = new Date(ws).setDate(new Date(ws).getDate() + d); // DST-safe day steps
        return { ms, key: dateKey(ms), today: dateKey(ms) === today, past: ms < todayStart, entries: byDay.get(dateKey(ms)) || [] };
      });
      const heavy = (crunch.weeks || []).find((x) => x.heavy && x.start === weekStart(days[0].ms)) || null;
      // As in the design: the third row leads with its dates, "Week after next" under them.
      const range = dayRange(days[0].ms, days[6].ms);
      return w < 2 ? { name: WEEK_NAMES[w], range, days, heavy } : { name: range, range: WEEK_NAMES[w], days, heavy };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now && Math.floor(now / 3600000), items, status, exams, crunch]);

  if (!weeks) return <div className="panel min-h-[420px] xl:min-h-0 xl:flex-1" aria-hidden="true" />;
  const todayIdx = (new Date(now).getDay() + 6) % 7;

  return (
    <div className="panel min-h-0 overflow-x-auto xl:flex-1 xl:overflow-hidden">
      <div
        className="grid h-full min-w-[640px] grid-cols-[96px_repeat(7,minmax(0,1fr))] grid-rows-[32px_repeat(3,minmax(130px,auto))] xl:grid-rows-[32px_repeat(3,minmax(0,1fr))]"
        role="grid"
        aria-label="This week and the next two"
      >
        <div role="row" className="contents">
          <div role="columnheader" className="border-b border-[var(--chip)]" />
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              role="columnheader"
              className="flex items-center border-b border-l border-[var(--chip)] px-2.5 text-[11px] font-extrabold uppercase tracking-[0.07em]"
              style={{ color: i === todayIdx ? "var(--brand-text)" : MUTED }}
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w, wi) => (
          <div role="row" key={wi} className="contents">
            <div
              role="rowheader"
              className={`flex min-h-0 flex-col gap-[3px] py-2.5 pl-3.5 pr-2.5 ${wi ? "border-t border-[var(--chip)]" : ""}`}
              style={w.heavy ? { background: "var(--amber-bg)", boxShadow: "inset 3px 0 0 var(--amber-line)" } : undefined}
            >
              <span className="whitespace-nowrap text-[13px] font-extrabold" style={{ color: w.heavy ? "var(--amber-fg)" : INK }}>
                {w.name}
              </span>
              <span className="whitespace-nowrap text-[11.5px] font-semibold tracking-[-0.01em]" style={{ color: MUTED }}>
                {w.range}
              </span>
              {w.heavy && (
                <span className="mt-1.5 flex flex-col gap-[3px] text-[11.5px] font-bold leading-tight" style={{ color: "var(--amber-fg)" }} title="This week has clearly more work left than a normal week this term.">
                  <span className="flex items-center gap-1">
                    <span className="grid h-[15px] w-[15px] place-items-center rounded-[5px] text-[10px] font-extrabold" style={{ background: "var(--amber-fg)", color: "var(--amber-bg)" }} aria-hidden="true">
                      !
                    </span>
                    Heavy week
                  </span>
                  <span>
                    {w.heavy.count} items · {Math.round(w.heavy.points)} pts
                  </span>
                </span>
              )}
            </div>
            {w.days.map((d) => (
              <DayCell key={d.key} day={d} heavy={Boolean(w.heavy)} top={wi > 0} courseById={courseById} hover={hover} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({ day, heavy, top, courseById, hover }) {
  const shown = day.entries.slice(0, SHOWN_PER_DAY);
  const more = day.entries.slice(SHOWN_PER_DAY);
  const label = new Date(day.ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const num = new Date(day.ms).getDate();
  const showMonth = num === 1; // "Oct 1" where a new month starts
  return (
    <div
      role="gridcell"
      aria-label={`${label}${day.entries.length ? `, ${day.entries.length} due` : ""}`}
      className={`flex min-h-0 min-w-0 flex-col gap-[3px] overflow-hidden border-l border-[var(--chip)] px-1.5 pb-1.5 pt-[7px] ${top ? "border-t" : ""}`}
      style={day.today ? { background: "var(--today)", boxShadow: "inset 0 0 0 1.5px var(--brand-ring)" } : heavy ? { background: "var(--heavy)" } : undefined}
    >
      <span
        className="mb-px self-start rounded-full px-[5px] text-xs font-extrabold tabular-nums"
        style={day.today ? { background: "var(--brand)", color: "#FFFFFF" } : { color: day.past ? MUTED : "var(--ink-soft)" }}
      >
        {showMonth ? new Date(day.ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : num}
      </span>
      {shown.map((e) => {
        const course = courseById[String(e.courseId)];
        const match = hover !== null && String(e.courseId) === String(hover);
        const dim = hover !== null && !match;
        const cls = `cal-item flex min-w-0 items-center gap-[5px] rounded-md px-[5px] py-0.5 text-[11.5px] font-bold whitespace-nowrap ${e.exam ? "cal-exam c-text" : ""} ${match ? "term-match c-text" : ""} ${dim ? "term-dim" : ""}`;
        const tip = `${course?.name || "Personal"}: ${e.title}${e.done ? " (done)" : ""}`;
        const body = (
          <>
            {e.exam ? <Star /> : <span className="c-dot h-[7px] w-[7px] shrink-0 rounded-full" aria-hidden="true" />}
            <span
              className="min-w-0 truncate"
              style={e.done ? { textDecoration: "line-through", color: MUTED, fontWeight: 600 } : e.exam || match ? undefined : { color: INK }}
            >
              {e.title}
            </span>
          </>
        );
        const style = { "--c": course?.color || "#8A879C", opacity: e.done && !dim ? 0.7 : undefined };
        return e.href ? (
          <a key={e.key} href={e.href} target="_blank" rel="noreferrer" onClick={e.open} className={`${cls} hover:underline`} style={style} title={tip}>
            {body}
          </a>
        ) : (
          <span key={e.key} className={cls} style={style} title={tip}>
            {body}
          </span>
        );
      })}
      {more.length > 0 && (
        <span className="px-[5px] text-[11px] font-bold" style={{ color: MUTED }} title={more.map((e) => e.title).join("\n")}>
          +{more.length} more
        </span>
      )}
    </div>
  );
}

// The exam cards under the calendar: the next three exams, like the ones in Incoming.
function ExamCards({ exams, ready, courseById, hover, onLookItem, onLookAnnouncement }) {
  if (!ready) return <div className="h-[72px] flex-none" aria-hidden="true" />;
  if (!exams.length) {
    return (
      <p className="panel flex flex-none items-center gap-2 px-4 py-3 text-[13px] font-semibold" style={{ color: "var(--ink-soft)" }}>
        <Star className="h-3 w-3" />
        No exams in the next 3 weeks.
      </p>
    );
  }
  return (
    <div className="grid flex-none grid-cols-1 gap-3 md:grid-cols-3">
      {exams.slice(0, 3).map((x) => {
        const course = courseById[String(x.courseId)];
        const pill = countdownStyle(x);
        const { href, onClick } = examLink(x, onLookItem, onLookAnnouncement);
        const match = hover !== null && String(x.courseId) === String(hover);
        const dim = hover !== null && !match;
        return (
          <article
            key={x.id}
            className={`panel term-card flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 ${match ? "term-match" : ""} ${dim ? "term-dim" : ""}`}
            style={{ "--c": course?.color || "var(--muted)" }}
          >
            <DateTile ms={x.day} />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <div className="flex min-w-0 items-center gap-1.5">
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className="font-display min-w-0 truncate text-[15px] font-bold hover:underline" style={{ color: INK }} title={x.title}>
                    {x.title}
                  </a>
                ) : (
                  <span className="font-display min-w-0 truncate text-[15px] font-bold" style={{ color: INK }} title={x.title}>
                    {x.title}
                  </span>
                )}
                <span className="ml-auto shrink-0 whitespace-nowrap rounded-[7px] px-2 py-0.5 text-[11px] font-extrabold" style={pill.style}>
                  {pill.text}
                </span>
              </div>
              <span className="c-text min-w-0 truncate text-xs font-bold">{course?.name || "Class"}</span>
              <div className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                <span className="shrink-0">{examTime(x)}</span>
                <span className="ml-auto flex min-w-0 gap-1">
                  {x.related.slice(0, 1).map((r, i) => (
                    <Related key={i} r={r} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />
                  ))}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------- My classes ----------

// A class's categories for the bar and the table. Weighted classes count categories worth more
// than 0% (bar width = weight); points classes count categories with points (width = points).
// Solid = the graded share of the category's points; the rest is still to come.
function categoriesOf(breakdown) {
  if (!breakdown) return [];
  const cats = breakdown.groups.map((g) => {
    const counted = g.assignments.filter((a) => !a.excused);
    const total = counted.reduce((s, a) => s + (a.points || 0), 0);
    const gradedPts = counted.filter((a) => a.graded).reduce((s, a) => s + (a.points || 0), 0);
    const gradedCount = counted.filter((a) => a.graded).length;
    const share = total > 0 ? gradedPts / total : counted.length ? gradedCount / counted.length : 0;
    return {
      id: g.id,
      name: g.name,
      weight: g.weight || 0,
      total,
      count: counted.length,
      gradedCount,
      share,
      percent: groupTotals(g).percent,
      basis: breakdown.weighted ? g.weight || 0 : total,
    };
  });
  return cats.filter((c) => (breakdown.weighted ? c.weight > 0 : c.total > 0));
}

function fmtPct(n, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return `${Number(n).toFixed(digits)}%`;
}

function ClassRow({ course, data, exam, now, open, onToggle, matched, onHover, onCalculator, glance, readIds, onLookItem, onLookAnnouncement }) {
  const [goalOpen, setGoalOpen] = useState(false);
  const goalRef = useRef(null);
  const g = useGradeGoal(course, goalOpen);
  const panelId = useId();
  const goalPanelId = `term-goal-${course.id}`;
  const breakdown = data?.breakdown || null;
  const cats = categoriesOf(breakdown);
  const scale = letterScale(breakdown?.scheme || g.outlook?.scheme);
  const score = course.score;
  const letter = score === null ? "" : letterFor(Number(score), scale) || course.grade || "";
  const pct = score === null ? 0 : Math.max(0, Math.min(100, Number(score)));
  const code = displayCode(course);
  const totalBasis = cats.reduce((s, c) => s + c.basis, 0);

  // A click anywhere on the row's top line opens it, except on its own links and buttons.
  function rowClick(e) {
    if (e.target.closest("a, button, input, select")) return;
    onToggle();
  }

  return (
    <div
      className={`term-row flex flex-none flex-col gap-2.5 rounded-[14px] px-2.5 py-[9px] ${matched ? "term-match" : open ? "term-open" : ""}`}
      style={{ "--c": course.color }}
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <div className="flex cursor-pointer items-center gap-3" onClick={rowClick}>
        <span
          className="relative grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--c) ${pct * 3.6}deg, color-mix(in srgb, var(--c) 16%, var(--surface-2)) 0)` }}
          aria-hidden="true"
        >
          <GoalTick goal={g.goal} />
          <span className="font-display grid h-[35px] w-[35px] place-items-center rounded-full bg-[var(--surface)] text-[11px] font-extrabold" style={{ color: INK }}>
            {score === null ? "–" : Math.round(score) >= 100 ? "100" : `${Math.round(score)}%`}
          </span>
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <div className="flex min-w-0 items-baseline gap-[7px]">
            <a href={course.homeUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[14.5px] font-extrabold hover:underline" style={{ color: INK }} title={`Open ${course.name} in Canvas`}>
              {course.name}
            </a>
            {code && <span className="c-text shrink-0 text-xs font-bold">{code}</span>}
          </div>
          {open && <TaughtBy teachers={breakdown?.teachers || []} messageUrl={breakdown?.messageUrl || ""} />}
          <CategoryBar cats={cats} total={totalBasis} weighted={breakdown?.weighted} state={data ? (data.error ? "error" : "ok") : "loading"} />
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs" style={{ color: MUTED }}>
            {exam ? (
              <>
                <span className="c-text flex min-w-0 items-center gap-1.5 font-bold">
                  <Star />
                  <span className="truncate">
                    {exam.title} · {shortWhen(exam)} · {countdownStyle(exam).text}
                  </span>
                </span>
              </>
            ) : (
              <span>No exams in the next 3 weeks</span>
            )}
          </div>
        </div>

        <div className="flex w-[110px] shrink-0 flex-col items-end gap-[5px]">
          <div className="flex items-baseline gap-[5px]">
            <span className="font-display text-xl font-extrabold tracking-tight" style={{ color: INK }}>
              {score === null ? "No grade" : `${Number(score).toFixed(1)}%`}
            </span>
            {letter && (
              <span className="text-xs font-bold" style={{ color: MUTED }}>
                {letter}
              </span>
            )}
          </div>
          <span ref={goalRef} className="contents">
            <GoalPill
              goal={g.goal}
              status={g.status}
              loading={g.loading}
              open={goalOpen}
              controls={goalPanelId}
              courseName={course.name}
              onToggle={() => setGoalOpen(!goalOpen)}
              long
            />
          </span>
        </div>

        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Details for ${course.name}`}
          className="term-chevron grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{ color: MUTED }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {goalOpen && (
        <div className="ml-[58px]">
          <GoalEditor
            id={goalPanelId}
            goal={g.goal}
            status={g.status}
            failed={g.failed}
            error={g.error}
            hasDropRules={g.outlook?.hasDropRules}
            unposted={g.outlook?.unposted}
            scale={scale}
            scaleReady={Boolean(breakdown) || g.scaleReady}
            onSave={g.save}
            onClose={() => {
              setGoalOpen(false);
              goalRef.current?.querySelector("button")?.focus();
            }}
          />
        </div>
      )}

      {open && (
        <div id={panelId} className="ml-[58px] flex flex-col gap-2.5">
          {glance && <ClassGlance glance={glance} now={now} readIds={readIds} onLookItem={onLookItem} onLookAnnouncement={onLookAnnouncement} />}
          {!data && <p className="text-xs" style={{ color: MUTED }}>Loading this class&apos;s categories…</p>}
          {data?.error && <p className="text-xs" style={{ color: "var(--red-fg)" }}>Couldn&apos;t load this class&apos;s categories from Canvas.</p>}
          {breakdown && <CategoryTable cats={cats} weighted={breakdown.weighted} />}
          {breakdown && <GoalLine course={course} breakdown={breakdown} goal={g.goal} />}
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => onCalculator(g.goal)} className="btn btn-course h-[34px] rounded-[10px] px-3 text-[13px]">
              <CalcIcon />
              Open grade calculator
            </button>
            <button
              onClick={() => setGoalOpen(!goalOpen)}
              aria-expanded={goalOpen}
              aria-controls={goalPanelId}
              className="btn btn-soft h-[34px] rounded-[10px] px-2.5 text-[13px]"
            >
              {g.goal === null ? "Set a goal" : "Change goal"}
            </button>
            {/* The two Canvas links stay together; on narrow rows they move to their own line. */}
            <span className="ml-auto flex shrink-0 gap-1.5">
              <a href={course.homeUrl} target="_blank" rel="noreferrer" className="btn btn-soft h-[34px] rounded-[10px] px-2.5 text-[13px]">
                Open in Canvas
                <OutArrow />
              </a>
              <a href={course.gradesUrl} target="_blank" rel="noreferrer" className="btn btn-soft h-[34px] rounded-[10px] px-2.5 text-[13px]">
                Grades in Canvas
                <OutArrow />
              </a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE = {
  red: { background: "var(--red-bg)", color: "var(--red-fg)" },
  amber: { background: "var(--amber-bg)", color: "var(--amber-fg)" },
  calm: { background: "var(--blue-bg)", color: "var(--blue-fg)" },
};

function OutArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[10px] w-[10px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

// "Tue 10/6, 11:59 PM"
function dueWhen(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function postedAgo(iso, now) {
  if (!iso) return "";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Who teaches the class (CLASS-9), as a quiet line under an open row's name: "Taught by Dr. Smith ·
// Message in Canvas". More than two teachers: "+N more", with every name on hover.
function TaughtBy({ teachers, messageUrl }) {
  if (!teachers.length && !messageUrl) return null;
  const shown = teachers.slice(0, 2).map((t) => t.name).join(", ");
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: MUTED }}>
      {teachers.length > 0 && (
        <span className="min-w-0 truncate" title={teachers.map((t) => t.name).join("\n")}>
          Taught by <span className="font-bold" style={{ color: "var(--ink-soft)" }}>{shown}</span>
          {teachers.length > 2 && ` +${teachers.length - 2} more`}
        </span>
      )}
      {teachers.length > 0 && messageUrl && <span aria-hidden="true">·</span>}
      {messageUrl && (
        <a href={messageUrl} target="_blank" rel="noreferrer" className="text-link flex shrink-0 items-center gap-1 font-bold" style={{ color: "var(--ink-soft)" }}>
          Message in Canvas
          <OutArrow />
        </a>
      )}
    </div>
  );
}

// One goal sentence for an open row (CLASS-11), from the same plan as the grade calculator:
// "To finish with 90% (A-), you'd need about 94% on the rest."
function GoalLine({ course, breakdown, goal }) {
  const s = goalSentence(breakdown, goal, course.score === null || course.score === undefined ? null : Number(course.score));
  return (
    <div className="flex items-center gap-3.5 rounded-[14px] bg-[var(--surface-2)] px-3.5 py-3">
      <span className="c-tint c-text grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13.5px] font-bold leading-[1.35]" style={{ color: INK }}>
          {s.line}
        </span>
        <span className="text-xs leading-[1.35]" style={{ color: MUTED }}>
          {s.sub}
        </span>
      </div>
    </div>
  );
}

function CalcIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01" />
    </svg>
  );
}

// "Class at a glance" (CLASS-9), at the top of an open class row: the next 3 things due and the
// newest announcement (both open in Quick look; opening an announcement marks it read, as
// everywhere). Who teaches it sits under the class name (TaughtBy); the Canvas links sit with the
// row's buttons.
function ClassGlance({ glance, now, readIds, onLookItem, onLookAnnouncement }) {
  const label = "text-[10.5px] font-extrabold uppercase tracking-[0.07em]";
  const a = glance.announcement;
  const unread = a && !readIds?.has(a.id);
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--chip)] pb-2.5">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`${label} px-1.5`} style={{ color: MUTED }}>
            Due next
          </span>
          {glance.next.length === 0 && (
            <p className="px-1.5 py-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              Nothing left to do in Canvas right now.
            </p>
          )}
          {glance.next.map((i) => {
            const pill = dueCountdown(new Date(i.dueAt).getTime(), now);
            const body = (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-bold" style={{ color: INK }}>
                    {i.title}
                  </span>
                  <span className="truncate text-[11px] font-semibold" style={{ color: MUTED }}>
                    {dueWhen(i.dueAt)}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold" style={TONE[pill.tone]}>
                  {pill.text}
                </span>
              </>
            );
            const cls = "flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1";
            return i.url ? (
              <a key={i.key} href={i.url} target="_blank" rel="noreferrer" onClick={(e) => onLookItem(e, i)} className={`${cls} row-hover`} title={i.title}>
                {body}
              </a>
            ) : (
              <div key={i.key} className={cls} title={i.title}>
                {body}
              </div>
            );
          })}
          {glance.more > 0 && (
            <span className="px-1.5 text-[11px] font-bold" style={{ color: MUTED }}>
              +{glance.more} more this term
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`${label} px-1.5`} style={{ color: MUTED }}>
            Latest announcement
          </span>
          {a ? (
            <a href={a.url} target="_blank" rel="noreferrer" onClick={(e) => onLookAnnouncement(e, a)} className="row-hover flex min-w-0 flex-col gap-px rounded-lg px-1.5 py-1" title={a.title}>
              <span className="flex min-w-0 items-center gap-1.5">
                {unread && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--brand)]" title="Unread" />}
                <span className="truncate text-[12.5px] font-bold" style={{ color: INK }}>
                  {a.title}
                </span>
              </span>
              <span className="text-[11px] font-semibold" style={{ color: MUTED }}>
                {postedAgo(a.postedAt, now)}
              </span>
              {a.preview && (
                <span className="truncate text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                  {a.preview}
                </span>
              )}
            </a>
          ) : (
            <p className="px-1.5 py-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              No announcements lately.
            </p>
          )}
        </div>
      </div>

    </div>
  );
}

function CategoryBar({ cats, total, weighted, state }) {
  if (state === "loading") return <div className="settings-skeleton h-2 rounded-[3px] bg-[var(--surface-2)]" aria-hidden="true" />;
  if (state === "error" || !cats.length) {
    return (
      <p className="text-[11.5px] leading-none" style={{ color: MUTED }}>
        {state === "error" ? "Categories didn't load" : "No graded categories in Canvas yet"}
      </p>
    );
  }
  return (
    <div className="flex h-2 gap-0.5" role="img" aria-label={cats.map((c) => `${c.name}${weighted ? ` ${c.weight}%` : ""}: ${c.gradedCount} of ${c.count} graded`).join(", ")}>
      {cats.map((c) => (
        <span
          key={c.id}
          className="tocome flex h-2 min-w-[6px] overflow-hidden rounded-[3px]"
          style={{ flex: `${total > 0 ? c.basis : 1} 1 0` }}
          title={`${c.name}${weighted ? ` · ${c.weight}% of grade` : ` · ${Math.round(c.total)} pts`} · ${c.gradedCount} of ${c.count} graded`}
        >
          <span className="c-dot h-full" style={{ width: `${Math.round(c.share * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function CategoryTable({ cats, weighted }) {
  if (!cats.length) return <p className="text-xs" style={{ color: MUTED }}>This class has no graded categories in Canvas yet.</p>;
  const cols = weighted ? "grid-cols-[minmax(0,1fr)_54px_110px_92px]" : "grid-cols-[minmax(0,1fr)_110px_92px]";
  const head = "text-[10.5px] font-extrabold uppercase tracking-[0.07em]";
  return (
    <div className={`grid ${cols} items-center gap-x-2.5 gap-y-[5px] text-[12.5px]`}>
      <span className={head} style={{ color: MUTED }}>Category</span>
      {weighted && <span className={head} style={{ color: MUTED }}>Weight</span>}
      <span className={head} style={{ color: MUTED }}>Graded</span>
      <span className={`${head} text-right`} style={{ color: MUTED }}>Your score</span>
      {cats.map((c) => (
        <CategoryLine key={c.id} c={c} weighted={weighted} />
      ))}
    </div>
  );
}

function CategoryLine({ c, weighted }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-[7px] font-bold" style={{ color: INK }}>
        <span className="tocome flex h-2.5 w-2.5 shrink-0 overflow-hidden rounded-[3px]" aria-hidden="true">
          <span className="c-dot h-full" style={{ width: `${Math.round(c.share * 100)}%` }} />
        </span>
        <span className="truncate" title={c.name}>{c.name}</span>
      </span>
      {weighted && <span style={{ color: "var(--ink-soft)" }}>{fmtPct(c.weight, Number.isInteger(c.weight) ? 0 : 1)}</span>}
      <span style={{ color: c.count ? "var(--ink-soft)" : MUTED }}>{c.count ? `${c.gradedCount} of ${c.count}` : "Not posted yet"}</span>
      <span className="text-right font-extrabold" style={{ color: INK }}>
        {c.percent === null ? "–" : fmtPct(c.percent, Number.isInteger(Math.round(c.percent * 10) / 10) ? 0 : 1)}
      </span>
    </>
  );
}
