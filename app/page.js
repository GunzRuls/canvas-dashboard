import DashboardPage from "./dashboardPage";

export const dynamic = "force-dynamic";

// Today: the board, Next class, Grades and Incoming.
export default function Home() {
  return <DashboardPage view="today" />;
}
