import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyCourseName, tidyCourseCode } from "../lib/courseNames.js";

// Real names and codes from Canvas at Florida Poly.
test("drops the term and section in parentheses", () => {
  assert.equal(tidyCourseName("Software Design and Architecture (Fall 2026-1 CEN4065-0)"), "Software Design and Architecture");
  assert.equal(tidyCourseName("Algorithm Design & Analysis (Fall 2026-1 COP4531-0)"), "Algorithm Design & Analysis");
  assert.equal(tidyCourseName("Chemistry 1 Laboratory(SP 2025_CHM2045L.01 GENS)"), "Chemistry 1 Laboratory");
});

test("drops a trailing term like FA 26", () => {
  assert.equal(tidyCourseName("Capstone 1 FA 26"), "Capstone 1");
  assert.equal(tidyCourseName("Student Success - Fall 2026"), "Student Success");
});

test("keeps names that have nothing to trim", () => {
  assert.equal(tidyCourseName("Career Services"), "Career Services");
  assert.equal(tidyCourseName("CS Students"), "CS Students");
  assert.equal(tidyCourseName("Calculus (Honors)"), "Calculus (Honors)");
});

test("never returns an empty name", () => {
  assert.equal(tidyCourseName("(Fall 2026)"), "(Fall 2026)");
  assert.equal(tidyCourseName(""), "");
});

test("course code: real code from the code or the name", () => {
  assert.equal(tidyCourseCode("80250.202680", "Algorithm Design & Analysis (Fall 2026-1 COP4531-0)"), "COP4531");
  assert.equal(tidyCourseCode("CHM2045L.01GENS", "Chemistry 1 Laboratory(SP 2025_CHM2045L.01 GENS)"), "CHM2045L");
  assert.equal(tidyCourseCode("COP 4610", "Operating Systems"), "COP4610");
});

test("course code: keeps Canvas's code when there's no real one", () => {
  assert.equal(tidyCourseCode("Capstone1_FA2026", "Capstone 1 FA 26"), "Capstone1_FA2026");
  assert.equal(tidyCourseCode("Career Services", "Career Services"), "Career Services");
});
