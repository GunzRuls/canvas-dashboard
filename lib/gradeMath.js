// Grade math for the what-if calculator. Works like Canvas's "current grade":
// only graded (or what-if) work counts, and in weighted courses, only groups
// that have something graded count toward the total.

function scoreFor(assignment, whatIf) {
  if (assignment.excused) return null;
  const hypothetical = whatIf[assignment.id];
  if (hypothetical !== undefined && hypothetical !== "") return Number(hypothetical);
  return assignment.graded ? assignment.score : null;
}

export function groupTotals(group, whatIf = {}) {
  let earned = 0;
  let possible = 0;
  for (const a of group.assignments) {
    const s = scoreFor(a, whatIf);
    if (s === null || Number.isNaN(s)) continue;
    earned += s;
    possible += a.points;
  }
  return { earned, possible, percent: possible > 0 ? (earned / possible) * 100 : null };
}

export function computeGrade(breakdown, whatIf = {}) {
  if (!breakdown) return null;
  const totals = breakdown.groups.map((g) => ({ weight: g.weight, ...groupTotals(g, whatIf) }));

  if (breakdown.weighted) {
    let sum = 0;
    let weightUsed = 0;
    for (const t of totals) {
      if (t.possible > 0 && t.weight > 0) {
        sum += t.weight * (t.earned / t.possible);
        weightUsed += t.weight;
      }
    }
    return weightUsed > 0 ? (sum / weightUsed) * 100 : null;
  }

  let earned = 0;
  let possible = 0;
  for (const t of totals) {
    earned += t.earned;
    possible += t.possible;
  }
  return possible > 0 ? (earned / possible) * 100 : null;
}

// "What do I need on this assignment to reach my target?"
// The grade changes in a straight line as that one score goes from 0 to full points,
// so we check both ends and solve for the target in between.
export function scoreNeeded(breakdown, whatIf, assignment, target) {
  const atZero = computeGrade(breakdown, { ...whatIf, [assignment.id]: 0 });
  const atFull = computeGrade(breakdown, { ...whatIf, [assignment.id]: assignment.points });
  if (atZero === null || atFull === null) return { kind: "unknown" };
  if (atZero >= target) return { kind: "locked", atZero };
  if (atFull < target) return { kind: "impossible", atFull };
  const needed = ((target - atZero) / (atFull - atZero)) * assignment.points;
  return { kind: "needed", score: needed, percent: (needed / assignment.points) * 100 };
}

// "What average do I need on everything that's left to reach my target?"
// Every ungraded assignment gets the same percentage. Any score you've already typed in
// as a what-if stays as you entered it.
export function remainingAssignments(breakdown, whatIf = {}) {
  if (!breakdown) return [];
  return breakdown.groups
    .flatMap((g) => g.assignments)
    .filter(
      (a) => !a.graded && !a.excused && a.points > 0 && (whatIf[a.id] === undefined || whatIf[a.id] === "")
    );
}

export function averageNeeded(breakdown, whatIf, target) {
  const remaining = remainingAssignments(breakdown, whatIf);
  if (!remaining.length) return { kind: "none" };
  const fillAt = (fraction) => ({
    ...whatIf,
    ...Object.fromEntries(remaining.map((a) => [a.id, Math.round(a.points * fraction * 100) / 100])),
  });
  const atZero = computeGrade(breakdown, fillAt(0));
  const atFull = computeGrade(breakdown, fillAt(1));
  if (atZero === null || atFull === null) return { kind: "unknown" };
  const base = { count: remaining.length };
  if (atZero >= target) return { ...base, kind: "locked", atZero };
  if (atFull < target) return { ...base, kind: "impossible", atFull };
  const percent = ((target - atZero) / (atFull - atZero)) * 100;
  return { ...base, kind: "needed", percent, fill: fillAt(percent / 100) };
}
