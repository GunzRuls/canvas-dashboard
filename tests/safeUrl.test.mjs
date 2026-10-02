// Tests for lib/safeUrl.js: links built from Canvas, calendars, GitHub or the settings file
// may only be real web links, and the Canvas token only goes to the saved Canvas site.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { safeUrl, sameOrigin, canvasId } from "../lib/safeUrl.js";
import { cleanSettings } from "../lib/settingsData.js";

const CANVAS = "https://floridapoly.instructure.com";

test("web links pass through", () => {
  assert.equal(safeUrl("https://floridapoly.instructure.com/courses/1"), "https://floridapoly.instructure.com/courses/1");
  assert.equal(safeUrl("http://example.com/a?b=1"), "http://example.com/a?b=1");
});

test("links that could run code become no link", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///C:/Windows/System32",
    "",
    null,
    undefined,
    42,
    "not a link",
  ]) {
    assert.equal(safeUrl(bad), "", String(bad));
  }
});

test("relative Canvas paths resolve against the Canvas address", () => {
  assert.equal(safeUrl("/courses/1/assignments/2", CANVAS), `${CANVAS}/courses/1/assignments/2`);
  assert.equal(safeUrl("javascript:alert(1)", CANVAS), "");
  // A path can't change which site it points to by smuggling in a user name.
  assert.equal(new URL(safeUrl("/@evil.example/x", CANVAS)).host, "floridapoly.instructure.com");
});

test("the token only goes to the saved Canvas site", () => {
  assert.equal(sameOrigin(`${CANVAS}/api/v1/courses?page=2`, CANVAS), true);
  assert.equal(sameOrigin("https://evil.example/api/v1/courses?page=2", CANVAS), false);
  assert.equal(sameOrigin(`${CANVAS}@evil.example/api`, CANVAS), false);
  assert.equal(sameOrigin("http://floridapoly.instructure.com/api", CANVAS), false);
  assert.equal(sameOrigin("https://floridapoly.instructure.com:8443/api", CANVAS), false);
  assert.equal(sameOrigin("not a link", CANVAS), false);
});

test("Canvas ids must be whole numbers", () => {
  assert.equal(canvasId(123), "123");
  assert.equal(canvasId("456"), "456");
  for (const bad of ["1/../../users/self", "12?x=1", "", null, undefined, "-1", "1.5", "abc"]) {
    assert.throws(() => canvasId(bad), String(bad));
  }
});

test("saved attendance links must be web links", () => {
  const out = cleanSettings({
    attendance: {
      1: " https://example.com/checkin ",
      2: "javascript:alert(1)",
      3: "data:text/html,hi",
      4: "https://",
    },
  });
  assert.deepEqual(out.attendance, { 1: "https://example.com/checkin" });
});

test("saved colors must be colors", () => {
  const out = cleanSettings({ colors: { 1: "#7C5CFA", 2: "red;background:url(https://evil.example)", 3: "#12345" } });
  assert.deepEqual(out.colors, { 1: "#7C5CFA" });
});
