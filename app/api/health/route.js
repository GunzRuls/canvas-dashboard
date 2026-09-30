// Lets the launcher tell whether whatever is answering on a port is this School Dashboard
// (and which copy), instead of assuming any open port 3000 is us. Reveals nothing private.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    app: "school-dashboard",
    root: process.env.DASHBOARD_INSTALL_DIR || process.cwd(),
  });
}
