// Teacher feedback (CLASS-7): comments teachers leave on your graded work. Pure (no imports), so
// lib/canvas.js, the Incoming panel and the tests share it.

export const FEEDBACK_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// Canvas comments are plain text, but some tools post HTML; keep only the words.
export function plainComment(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Whether a comment counts as feedback: written by the class's teachers or TAs (`staffIds`, a Set
// of id strings) when that list is known; otherwise by anyone named who isn't you. Anonymous
// comments (author_id null) are classmates' peer reviews, so they never count.
export function fromStaff(comment, studentId, staffIds) {
  if (comment?.author_id == null) return false;
  const author = String(comment.author_id);
  if (studentId != null && author === String(studentId)) return false;
  return staffIds ? staffIds.has(author) : true;
}

// Canvas submissions (with submission_comments + assignment) -> feedback entries, newest first.
// Keeps teacher comments (see fromStaff) from the last `days` days.
// `link(path)` turns a Canvas path or address into a safe full link ("" or null when it isn't one).
export function feedbackFromSubmissions(subs, { courseId, staffIds = null, now = Date.now(), days = FEEDBACK_DAYS, link = (u) => u } = {}) {
  const since = now - days * DAY;
  const out = [];
  for (const s of subs || []) {
    const comments = Array.isArray(s?.submission_comments) ? s.submission_comments : [];
    for (const c of comments) {
      if (!c || c.id == null) continue;
      if (!fromStaff(c, s.user_id, staffIds)) continue;
      const at = Date.parse(c.created_at);
      if (!Number.isFinite(at) || at < since || at > now + DAY) continue;
      const text = plainComment(c.comment);
      const attachments = (Array.isArray(c.attachments) ? c.attachments : [])
        .map((f) => ({ name: f?.display_name || f?.filename || "File", url: link(f?.url) || null }))
        .slice(0, 5);
      if (!text && !attachments.length && !c.media_comment) continue;
      const graded = s.score !== null && s.score !== undefined && !s.excused;
      out.push({
        id: String(c.id),
        courseId,
        assignmentId: s.assignment_id ?? s.assignment?.id ?? null,
        assignmentTitle: s.assignment?.name || "Assignment",
        score: graded ? s.score : null,
        points: s.assignment?.points_possible ?? null,
        grade: graded ? s.grade ?? null : null,
        text: text || (c.media_comment ? "Left a recorded comment. Open it in Canvas to play it." : ""),
        authorName: c.author?.display_name || c.author_name || "Your professor",
        createdAt: new Date(at).toISOString(),
        attachments,
        // Your submission's page shows the grade and the whole comment thread.
        url:
          (s.user_id != null && s.assignment_id != null
            ? link(`/courses/${courseId}/assignments/${s.assignment_id}/submissions/${s.user_id}`)
            : null) ||
          link(s.assignment?.html_url) ||
          null,
      });
    }
  }
  return newestFirst(out);
}

export function newestFirst(list) {
  return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// How many comments you haven't opened yet. `seen` is a Set of comment ids (strings).
export function unseenCount(list, seen) {
  return list.filter((f) => !seen.has(String(f.id))).length;
}

// The Feedback tab's list: leaves out comments you marked Done (`done`, a Set of id strings).
// Quick look's "Teacher comments" still shows them; it's the assignment's history.
export function withoutDone(list, done) {
  return (list || []).filter((f) => !done.has(String(f.id)));
}

// Everything the Feedback tab needs from one list: what it shows, how many of those are new, and
// whether comments exist that you've all marked Done ("all caught up" instead of "no comments").
export function feedbackView(list, { seen, done }) {
  const shown = withoutDone(list, done);
  return { shown, unseen: unseenCount(shown, seen), allDone: shown.length === 0 && (list || []).length > 0 };
}

// "7/10", "B+ · 88/100", "Complete" or "" when there's no grade.
export function scoreText(f) {
  const n = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
  if (f.score === null || f.score === undefined) return "";
  const pts = f.points ? `${n(f.score)}/${n(f.points)}` : n(f.score);
  const letter = f.grade && !/^-?\d+(\.\d+)?%?$/.test(String(f.grade)) ? String(f.grade) : "";
  if (letter === "complete" || letter === "incomplete") return letter === "complete" ? "Complete" : "Incomplete";
  return letter ? `${letter} · ${pts}` : pts;
}
