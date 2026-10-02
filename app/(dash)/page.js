export const dynamic = "force-dynamic";

// Today ("/"). The dashboard itself lives in the shared layout (app/(dash)/layout.js), so
// switching between Today and This term never reloads it; Dashboard.jsx picks the tab from the URL.
export default function Today() {
  return null;
}
