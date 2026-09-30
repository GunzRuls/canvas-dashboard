import SetupForm from "../../components/SetupForm";
import { OpenFullSetup } from "../../components/SettingsModal";
import { isConfigured } from "@/lib/config";
import { settingsProps } from "../../setup/settingsProps";

export const dynamic = "force-dynamic";

// The Settings button on the dashboard lands here: the same form as the full /setup page, shown
// in a pop-up over the dashboard. A reload or a plain /setup link shows app/setup/page.js instead.
export default async function SettingsPopup({ searchParams }) {
  if (!isConfigured()) return <OpenFullSetup />;
  const { fix } = await searchParams;
  return <SetupForm {...await settingsProps(fix)} />;
}
