import { getCourses, getFeedback } from "./canvas";
import { readSettings, applySettings } from "./settings";

// Teacher comments (CLASS-7) for your visible classes, kept in memory for 10 minutes so the
// Incoming panel can ask after every page load without asking Canvas each time.
const TTL = 10 * 60 * 1000;
const cache = (globalThis.__feedbackCache ??= { at: 0, list: null, pending: null });

export async function cachedFeedback() {
  if (cache.list && Date.now() - cache.at < TTL) return cache.list;
  // One Canvas round at a time, even when two windows ask together.
  cache.pending ??= (async () => {
    try {
      const [canvasCourses, settings] = await Promise.all([getCourses(), readSettings()]);
      const courses = applySettings(canvasCourses, settings).filter((c) => !c.hidden);
      const list = await getFeedback(courses);
      Object.assign(cache, { at: Date.now(), list });
      return list;
    } finally {
      cache.pending = null;
    }
  })();
  return cache.pending;
}
