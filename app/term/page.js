import DashboardPage from "../dashboardPage";

export const dynamic = "force-dynamic";

export const metadata = { title: "This term · School Dashboard" };

// This term (DASH-16): the next 3 weeks on a calendar, exams, and every class's grade categories.
export default function Term() {
  return <DashboardPage view="term" />;
}
