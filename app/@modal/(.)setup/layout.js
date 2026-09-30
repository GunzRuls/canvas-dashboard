import SettingsModal from "../../components/SettingsModal";

// The Settings pop-up frame. It lives in the layout (not the page) so it appears the moment you
// click Settings, holds the small loading skeleton (loading.js) and then the form, and never
// flashes closed in between.
export default function SettingsModalLayout({ children }) {
  return <SettingsModal>{children}</SettingsModal>;
}
