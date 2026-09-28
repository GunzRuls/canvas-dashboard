// Runs once when the server starts. The desktop launcher sets DASHBOARD_AUTO_STOP so the
// server shuts down after its window is closed; `npm run dev` and `npm run start` keep running.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DASHBOARD_AUTO_STOP === "1") {
    const { startAutoStop } = await import("./lib/autoStop");
    startAutoStop();
  }
}
