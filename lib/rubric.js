// Rubrics in Quick look (DASH-12). Pure (no imports) so tests can run it directly.
// Canvas puts `rubric` (the criteria) and `rubric_settings` on an assignment that has one, and
// `rubric_assessment` on a graded submission (asked for with include[]=rubric_assessment).
// Only plain text leaves the server: any HTML in a description is turned into text.

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function points(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) ? n : null;
}

// `assignment`: Canvas's assignment record. `assessment`: the submission's rubric_assessment
// (an object keyed by criterion id), or null. Returns null when there is no rubric.
export function shapeRubric(assignment, assessment = null) {
  const criteria = Array.isArray(assignment?.rubric) ? assignment.rubric : [];
  if (!criteria.length) return null;
  const settings = assignment.rubric_settings || {};
  const hidePoints = Boolean(settings.hide_points);
  const scored = assessment && typeof assessment === "object" ? assessment : null;

  const rows = criteria.map((c, i) => {
    const got = scored?.[c.id] || null;
    const ratings = (Array.isArray(c.ratings) ? c.ratings : []).map((r, j) => ({
      id: String(r.id ?? `${i}-${j}`),
      name: text(r.description),
      details: text(r.long_description),
      points: hidePoints ? null : points(r.points),
    }));
    // The rating you got: by id when Canvas says, else the one worth exactly your points.
    let achieved = null;
    if (got) {
      if (got.rating_id && ratings.some((r) => r.id === String(got.rating_id))) achieved = String(got.rating_id);
      else if (!hidePoints && points(got.points) !== null) {
        const match = ratings.find((r) => r.points === points(got.points));
        achieved = match ? match.id : null;
      }
    }
    return {
      id: String(c.id ?? i),
      name: text(c.description) || `Criterion ${i + 1}`,
      details: text(c.long_description),
      points: hidePoints ? null : points(c.points),
      ratings,
      assessment: got
        ? {
            points: hidePoints ? null : points(got.points),
            ratingId: achieved,
            comment: text(got.comments),
          }
        : null,
    };
  });

  const assessed = rows.some((r) => r.assessment);
  const total = hidePoints ? null : points(settings.points_possible) ?? sum(rows.map((r) => r.points));
  const earned = !hidePoints && assessed ? sum(rows.map((r) => r.assessment?.points)) : null;
  return {
    title: text(settings.title) || "Rubric",
    total,
    earned,
    hidePoints,
    assessed,
    criteria: rows,
  };
}

// Sum of the numbers, null when there are none.
function sum(list) {
  const nums = list.filter((n) => n !== null && n !== undefined);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}
