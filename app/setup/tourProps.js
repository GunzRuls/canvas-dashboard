import { getAccount, getCourses } from "@/lib/canvas";

// For the setup walkthrough (/setup?tour=1): the name and class count the Connect step shows,
// taken from the account that's already connected. Read-only; nothing is saved.
export async function tourProps() {
  const [account, courses] = await Promise.all([getAccount().catch(() => null), getCourses().catch(() => null)]);
  return {
    name: account?.shortName || account?.name || "",
    classes: Array.isArray(courses) ? courses.length : null,
  };
}
