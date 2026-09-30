import { publicConfig } from "@/lib/config";
import { currentVersion } from "@/lib/updates";
import { digestEnabled } from "@/lib/digest";
import { nextDigestRun } from "@/lib/schedule";
import { getAccount } from "@/lib/canvas";

// Everything the Settings form needs. Shared by the full /setup page and the Settings pop-up
// (app/@modal/(.)setup), so both always show the same thing.
export async function settingsProps(fix) {
  const fixToken = fix === "token";
  const [nextEmail, account] = await Promise.all([
    nextDigestRun(),
    fixToken ? null : getAccount().catch(() => null),
  ]);
  return {
    saved: publicConfig(),
    firstRun: false,
    installed: Boolean(process.env.DASHBOARD_INSTALL_DIR),
    version: currentVersion(),
    fixToken,
    emailOn: digestEnabled(),
    nextEmail,
    account,
  };
}
