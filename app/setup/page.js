import SetupForm from "../components/SetupForm";
import { isConfigured, publicConfig } from "@/lib/config";
import { currentVersion } from "@/lib/updates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · School Dashboard" };

// First launch: connect Canvas. Later: the Settings screen for Canvas and the optional extras.
export default function SetupPage() {
  return (
    <SetupForm
      saved={publicConfig()}
      firstRun={!isConfigured()}
      installed={Boolean(process.env.DASHBOARD_INSTALL_DIR)}
      version={currentVersion()}
    />
  );
}
