import SetupForm from "../components/SetupForm";
import { isConfigured, publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · School Dashboard" };

// First launch: connect Canvas. Later: the Settings screen for Canvas and the optional extras.
export default function SetupPage() {
  return <SetupForm saved={publicConfig()} firstRun={!isConfigured()} />;
}
