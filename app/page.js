import Dashboard from "./components/Dashboard";
import { loadDashboard } from "@/lib/loadDashboard";
import { calendarEnabled } from "@/lib/calendar";
import { digestEnabled } from "@/lib/digest";

export const dynamic = "force-dynamic";

export default async function Home() {
  let data;
  try {
    data = await loadDashboard();
  } catch (error) {
    return (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-2xl font-bold text-[#1C1A2E]">Canvas didn't load</h1>
        <p className="mt-3 text-[#4A4760]">{error.message}</p>
        <p className="mt-3 text-[#4A4760]">
          Check CANVAS_TOKEN and CANVAS_BASE_URL in .env.local, then restart the server.
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
