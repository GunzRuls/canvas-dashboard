import { SettingsSkeleton } from "../../components/SettingsModal";

// Inside the pop-up while your settings load: a few placeholder boxes, not a full loading screen.
export default function Loading() {
  return <SettingsSkeleton />;
}
