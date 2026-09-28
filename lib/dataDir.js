import fs from "fs";
import path from "path";

// Where your personal files (config, settings, dismissed) are saved.
// The installed app sets DASHBOARD_DATA_DIR to %APPDATA%\School Dashboard so updates and
// uninstalls don't touch them. Running from the project folder keeps them in the folder.
export function dataFile(name) {
  const dir = process.env.DASHBOARD_DATA_DIR || process.cwd();
  fs.mkdirSync(dir, { recursive: true });
  // The ignore comment stops the build from copying the whole project (including these
  // personal files) into the installer package.
  return path.join(/*turbopackIgnore: true*/ dir, name);
}
