import SetupForm from "../components/SetupForm";
import Onboarding from "../components/Onboarding";
import { isConfigured } from "@/lib/config";
import { settingsProps } from "./settingsProps";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · School Dashboard" };

// First launch: the step-by-step onboarding. Afterwards: the Settings page.
// `?fix=token` comes from the "Your Canvas token stopped working" screen.
// The Settings button on the dashboard doesn't come here: it opens the same form as a pop-up
// (app/@modal/(.)setup). This full page is for direct visits, reloads, and plain /setup links.
export default async function SetupPage({ searchParams }) {
  if (!isConfigured()) return <Onboarding />;
  const { fix } = await searchParams;
  return <SetupForm {...await settingsProps(fix)} />;
}
