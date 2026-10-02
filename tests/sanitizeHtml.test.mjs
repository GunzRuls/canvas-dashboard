// Tests for lib/sanitizeHtml.js: teacher-written HTML from Canvas is cleaned before Quick look
// shows it, so nothing in it can run code in the dashboard. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cleanHtml } from "../lib/sanitizeHtml.js";

const CANVAS = "https://floridapoly.instructure.com";

test("script and style tags are removed with their contents", () => {
  const out = cleanHtml("<p>Read this</p><script>alert(1)</script><style>p{color:red}</style>", CANVAS);
  assert.equal(out, "<p>Read this</p>");
});

test("event handlers like onerror are removed", () => {
  const out = cleanHtml('<img src="/courses/1/files/2/preview" onerror="alert(1)" alt="Chart"><p onclick="x()">Hi</p>', CANVAS);
  assert.ok(!/onerror|onclick|alert/.test(out), out);
  assert.match(out, /<img src="https:\/\/floridapoly\.instructure\.com\/courses\/1\/files\/2\/preview" alt="Chart" \/>/);
  assert.match(out, /<p>Hi<\/p>/);
});

test("javascript: and data: links lose their href but keep their text", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java&#x09;script:alert(1)", "data:text/html,<b>x</b>"]) {
    const out = cleanHtml(`<a href="${bad}">Click</a>`, CANVAS);
    assert.ok(!/href/.test(out), `${bad} -> ${out}`);
    assert.match(out, /Click/);
  }
});

test("a picture with an unsafe address is dropped", () => {
  assert.equal(cleanHtml('<img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA">', CANVAS), "");
});

test("relative Canvas links become full links that open outside the dashboard", () => {
  const out = cleanHtml('<a href="/courses/5/files/9/download">Rubric.pdf</a>', CANVAS);
  assert.equal(
    out,
    '<a href="https://floridapoly.instructure.com/courses/5/files/9/download" target="_blank" rel="noreferrer">Rubric.pdf</a>'
  );
});

test("frames, forms, inline styles and classes are removed", () => {
  const out = cleanHtml(
    '<iframe src="https://evil.example">x</iframe><form action="/x"><input name="a"><button>Go</button></form><p style="position:fixed" class="x" id="y">Text</p>',
    CANVAS
  );
  assert.equal(out, "<p>Text</p>");
});

test("formatting, lists, tables and headings survive (big headings step down)", () => {
  const html =
    '<h1>Title</h1><h2>Part</h2><h4>Small</h4><ul><li><strong>Bold</strong> and <em>em</em></li></ul><table><tr><td colspan="2">Cell</td></tr></table>';
  const out = cleanHtml(html, CANVAS);
  assert.match(out, /<h3>Title<\/h3><h3>Part<\/h3><h4>Small<\/h4>/);
  assert.match(out, /<li><strong>Bold<\/strong> and <em>em<\/em><\/li>/);
  assert.match(out, /<td colspan="2">Cell<\/td>/);
});

test("empty or missing HTML gives an empty string", () => {
  assert.equal(cleanHtml(null, CANVAS), "");
  assert.equal(cleanHtml("", CANVAS), "");
});
