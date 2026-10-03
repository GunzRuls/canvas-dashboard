// Tests for lib/rubric.js: the rubric Quick look shows (DASH-12). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { shapeRubric } from "../lib/rubric.js";

const assignment = {
  rubric_settings: { title: "Essay rubric", points_possible: 20, hide_points: false },
  rubric: [
    {
      id: "_1",
      description: "Thesis",
      long_description: "<p>A clear <b>claim</b> &amp; reasons</p>",
      points: 10,
      ratings: [
        { id: "r1", description: "Strong", long_description: "Clear and arguable", points: 10 },
        { id: "r2", description: "Weak", long_description: "", points: 4 },
        { id: "r3", description: "Missing", points: 0 },
      ],
    },
    {
      id: "_2",
      description: "Grammar",
      points: 10,
      ratings: [
        { id: "g1", description: "Few errors", points: 10 },
        { id: "g2", description: "Many errors", points: 5 },
      ],
    },
  ],
};

test("no rubric gives null", () => {
  assert.equal(shapeRubric({}), null);
  assert.equal(shapeRubric({ rubric: [] }), null);
  assert.equal(shapeRubric(null), null);
});

test("rubric without an assessment", () => {
  const r = shapeRubric(assignment);
  assert.equal(r.title, "Essay rubric");
  assert.equal(r.total, 20);
  assert.equal(r.earned, null);
  assert.equal(r.assessed, false);
  assert.equal(r.criteria.length, 2);
  assert.deepEqual(r.criteria[0].ratings.map((x) => [x.name, x.points]), [["Strong", 10], ["Weak", 4], ["Missing", 0]]);
  assert.equal(r.criteria[0].assessment, null);
});

test("HTML in descriptions becomes plain text", () => {
  const r = shapeRubric(assignment);
  assert.equal(r.criteria[0].details, "A clear claim & reasons");
});

test("an assessment marks your level, points and comment", () => {
  const r = shapeRubric(assignment, {
    _1: { rating_id: "r2", points: 4, comments: "Needs a <i>sharper</i> claim" },
    _2: { points: 10 }, // no rating id: matched by points
  });
  assert.equal(r.assessed, true);
  assert.equal(r.earned, 14);
  assert.equal(r.criteria[0].assessment.ratingId, "r2");
  assert.equal(r.criteria[0].assessment.comment, "Needs a sharper claim");
  assert.equal(r.criteria[1].assessment.ratingId, "g1");
  assert.equal(r.criteria[1].assessment.comment, "");
});

test("hide_points hides every number", () => {
  const r = shapeRubric(
    { ...assignment, rubric_settings: { ...assignment.rubric_settings, hide_points: true } },
    { _1: { rating_id: "r1", points: 10 } }
  );
  assert.equal(r.hidePoints, true);
  assert.equal(r.total, null);
  assert.equal(r.earned, null);
  assert.equal(r.criteria[0].points, null);
  assert.ok(r.criteria[0].ratings.every((x) => x.points === null));
  assert.equal(r.criteria[0].assessment.points, null);
  assert.equal(r.criteria[0].assessment.ratingId, "r1");
});

test("total falls back to the criteria's points", () => {
  const r = shapeRubric({ rubric: assignment.rubric });
  assert.equal(r.total, 20);
  assert.equal(r.title, "Rubric");
});
