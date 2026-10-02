import { canvasFetch, absoluteUrl, CanvasError } from "@/lib/canvas";
import { getConfig } from "@/lib/config";
import { canvasId, safeUrl } from "@/lib/safeUrl";
import { fileKind } from "@/lib/canvasFiles";

// Search (DASH-11): files whose name contains `q` in your classes (`courses`, comma-separated
// ids the dashboard shows). Read-only. Each class is searched in parallel, at most PER_COURSE
// files each. Many classes turn off their Files page: Canvas answers those with 401/403/404,
// which just means "no files here". Only what the search list shows is sent to the browser.

const PER_COURSE = 8;
const MAX_COURSES = 25;

function fileResult(f, courseId) {
  const name = f.display_name || f.filename || "File";
  const fileId = canvasId(f.id);
  return {
    id: fileId,
    name,
    size: Number.isFinite(f.size) ? f.size : null,
    kind: fileKind(f["content-type"] || f.content_type, name, f.mime_class),
    course: Number(courseId),
    updatedAt: f.updated_at || f.created_at || null,
    openUrl: absoluteUrl(`/courses/${courseId}/files/${fileId}`),
    // Locked files (not available yet) get no Download.
    downloadUrl: f.locked_for_user ? null : safeUrl(f.url, getConfig().canvasBaseUrl) || null,
  };
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const q = String(params.get("q") || "").trim();
    // Canvas needs at least 2 characters to search.
    if (q.length < 2 || q.length > 100) return Response.json({ ok: true, files: [], skipped: 0 });
    const courseIds = [...new Set(String(params.get("courses") || "").split(",").filter(Boolean))]
      .slice(0, MAX_COURSES)
      .map(canvasId);

    let skipped = 0; // classes Canvas couldn't answer for (offline, down, token)
    const perCourse = await Promise.all(
      courseIds.map(async (courseId) => {
        try {
          const res = await canvasFetch(
            `/api/v1/courses/${courseId}/files?search_term=${encodeURIComponent(q)}&per_page=${PER_COURSE}&sort=updated_at&order=desc`
          );
          const list = await res.json();
          return (Array.isArray(list) ? list : [])
            .filter((f) => f && !f.hidden_for_user)
            .slice(0, PER_COURSE)
            .flatMap((f) => {
              try {
                return [fileResult(f, courseId)];
              } catch {
                return []; // a file with a strange id is skipped
              }
            });
        } catch (error) {
          // No Files page (401/403/404) is normal. Anything else is worth a note in the list.
          if (error instanceof CanvasError) skipped++;
          return [];
        }
      })
    );
    return Response.json({ ok: true, files: perCourse.flat(), skipped });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
