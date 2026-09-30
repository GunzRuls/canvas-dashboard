// Friendlier class names and codes than Canvas gives. Canvas names carry the term and section,
// like "Software Design and Architecture (Fall 2026-1 CEN4065-0)", and some course codes are
// internal numbers like "80250.202680". Names the student sets in Manage classes always win.

const TERM = "(?:fall|spring|summer|winter|fa|sp|su|wi)";
// A course code like CEN4065, COP 4531, CHM2045L.
const CODE = /\b([A-Z]{2,4})\s?(\d{4}[A-Z]?)\b/;

// "Software Design and Architecture (Fall 2026-1 CEN4065-0)" -> "Software Design and Architecture"
// "Chemistry 1 Laboratory(SP 2025_CHM2045L.01 GENS)" -> "Chemistry 1 Laboratory"
// "Capstone 1 FA 26" -> "Capstone 1"
export function tidyCourseName(name) {
  const original = String(name || "").trim();
  let text = original;
  // A trailing "(...)" that holds a term or a course code.
  text = text.replace(/\s*\(([^()]*)\)\s*$/, (whole, inside) =>
    new RegExp(`\\b${TERM}\\b|\\d{4}`, "i").test(inside) || CODE.test(inside) ? "" : whole
  );
  // A trailing term like "FA 26", "Fall 2026", "SP2025".
  text = text.replace(new RegExp(`[\\s_-]+${TERM}\\s*'?\\d{2,4}\\s*$`, "i"), "");
  text = text.trim();
  return text || original;
}

// The short code to show next to a class: a real code from Canvas's code or name, else Canvas's code.
export function tidyCourseCode(code, name) {
  const raw = String(code || "").trim();
  const fromCode = raw.match(CODE);
  if (fromCode) return fromCode[1] + fromCode[2];
  const fromName = String(name || "").match(CODE);
  if (fromName) return fromName[1] + fromName[2];
  return raw;
}

// The code to show under a class name, spaced for reading: "CEN4065" -> "CEN 4065" (thin space).
// Only real codes; a fallback like "Capstone1_FA2026" shows nothing rather than junk.
export function displayCode(course) {
  const code = String((course && course.code) || "").trim();
  const m = code.match(/^([A-Z]{2,4})(\d{4}[A-Z]?)$/);
  return m ? `${m[1]} ${m[2]}` : "";
}
