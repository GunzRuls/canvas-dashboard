import { redirect } from "next/navigation";
import Dashboard from "./components/Dashboard";
import { loadDashboard } from "@/lib/loadDashboard";
import { calendarEnabled } from "@/lib/calendar";
import { digestEnabled } from "@/lib/digest";
import { isConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  // First launch: nothing to show until Canvas is connected.
  if (!isConfigured()) redirect("/setup");

  let data;
  try {
    data = await loadDashboard();
  } catch (error) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>Canvas didn&apos;t load</h1>
        <p className="mt-3" style={{ color: "var(--ink-soft)" }}>{error.message}</p>
        <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
          Check your Canvas address and token in{" "}
          <a href="/setup" className="font-bold underline">
            Settings
          </a>
          .
        </p>
      </main>
    );
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
      digestEnabled={digestEnabled()}
      newGrades={data.newGrades}
      sessions={data.sessions}
    />
  );
}
