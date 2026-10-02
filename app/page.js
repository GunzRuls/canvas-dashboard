import { redirect } from "next/navigation";
import Dashboard from "./components/Dashboard";
import { loadDashboard } from "@/lib/loadDashboard";
import { calendarEnabled } from "@/lib/calendar";
import { digestEnabled } from "@/lib/digest";
import { isConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

// What to show when Canvas doesn't load, by the kind of problem (see CanvasError in lib/canvas.js).
const PROBLEMS = {
  token: {
    title: "Your Canvas token stopped working",
    body: "Tokens stop working when they expire or get deleted in Canvas. Make a new one and paste it in Settings. It takes about a minute.",
    action: { href: "/setup?fix=token", label: "Paste a new token" },
  },
  offline: {
    title: "Can't reach Canvas",
    body: "Check that you're connected to the internet, then try again. If it keeps happening, check your Canvas address in Settings.",
    action: { href: "/", label: "Try again" },
  },
  down: {
    title: "Canvas is having trouble",
    body: "This is on Canvas's end, not yours. Try again in a few minutes.",
    action: { href: "/", label: "Try again" },
  },
};

export default async function Home() {
  // First launch: nothing to show until Canvas is connected.
  if (!isConfigured()) redirect("/setup");

  let data;
  try {
    data = await loadDashboard({ withChanges: true });
  } catch (error) {
    const problem = PROBLEMS[error.kind] || {
      title: "Canvas didn't load",
      body: error.message,
      action: { href: "/", label: "Try again" },
    };
    return <CanvasProblem {...problem} />;
  }

  return (
    <Dashboard
      courses={data.courses}
      allCourses={data.allCourses}
      items={data.items}
      announcements={data.announcements}
      events={data.calendar.events}
      calendarEnabled={calendarEnabled()}
      calendarError={data.calendar.error}
      hiddenEvents={data.calendar.hidden}
      digestEnabled={digestEnabled()}
      newGrades={data.newGrades}
      sessions={data.sessions}
      account={data.account}
      whatsNew={data.whatsNew}
      loadedAt={Date.now()}
    />
  );
}

function CanvasProblem({ title, body, action }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <div className="w-full rounded-2xl p-6" style={{ background: "var(--surface)" }}>
        <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {body}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <a
            href={action.href}
            className="btn btn-primary px-4 py-2 text-sm"
          >
            {action.label}
          </a>
          {action.href !== "/setup" && !action.href.startsWith("/setup?") && (
            <a
              href="/setup"
              className="btn btn-secondary px-4 py-2 text-sm"
            >
              Settings
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
