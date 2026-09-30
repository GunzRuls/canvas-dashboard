import SetupForm from "../components/SetupForm";
import Onboarding from "../components/Onboarding";
import { isConfigured, publicConfig } from "@/lib/config";
import { currentVersion } from "@/lib/updates";
import { digestEnabled } from "@/lib/digest";
import { nextDigestRun } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · School Dashboard" };

// First launch: the step-by-step onboarding. Afterwards: the Settings page.
// `?fix=token` comes from the "Your Canvas token stopped working" screen.
export default async function SetupPage({ searchParams }) {
  if (!isConfigured()) return <Onboarding />;
  const { fix } = await searchParams;
  return (
    <SetupForm
      saved={publicConfig()}
      firstRun={false}
      installed={Boolean(process.env.DASHBOARD_INSTALL_DIR)}
      version={currentVersion()}
      fixToken={fix === "token"}
      emailOn={digestEnabled()}
      nextEmail={await nextDigestRun()}
    />
  );
}
