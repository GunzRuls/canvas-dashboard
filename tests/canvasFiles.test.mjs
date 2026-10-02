// Tests for lib/canvasFiles.js: finding Canvas files linked in teacher HTML for Quick look's
// Files list, and naming their type and size. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fileLinksIn, fileRef, fileKind, formatSize, MAX_FILES } from "../lib/canvasFiles.js";

const CANVAS = "https://floridapoly.instructure.com";

test("relative and absolute Canvas file links are found", () => {
  const html = `
    <p>Read <a href="/courses/11/files/101?wrap=1">Syllabus.pdf</a> first.</p>
    <a class="instructure_file_link" href="https://floridapoly.instructure.com/courses/11/files/102/download?download_frd=1">Lab <b>2</b> handout</a>
    <a href="/files/103/download?verifier=abc&amp;wrap=1" title="notes.docx"></a>
    <a href="/users/5/files/104/preview">Template</a>`;
  assert.deepEqual(fileLinksIn(html, CANVAS), [
    { fileId: "101", courseId: "11", name: "Syllabus.pdf" },
    { fileId: "102", courseId: "11", name: "Lab 2 handout" },
    { fileId: "103", courseId: null, name: "notes.docx" },
    { fileId: "104", courseId: null, name: "Template" },
  ]);
});

test("Canvas's data-api-endpoint is used when the link itself isn't a file address", () => {
  const html = `<a href="#" data-api-endpoint="https://floridapoly.instructure.com/api/v1/courses/11/files/205" data-api-returntype="File">Rubric</a>
    <a href='/api/v1/files/206'>API link</a>`;
  assert.deepEqual(fileLinksIn(html, CANVAS), [
    { fileId: "205", courseId: "11", name: "Rubric" },
    { fileId: "206", courseId: null, name: "API link" },
  ]);
});

test("links on other sites, folders and non-file pages are ignored", () => {
  const html = `
    <a href="https://evil.example/courses/11/files/300">Fake</a>
    <a href="http://floridapoly.instructure.com/courses/11/files/301">Wrong scheme</a>
    <a href="https://floridapoly.instructure.com.evil.example/files/302">Look-alike</a>
    <a href="https://evil.example/x" data-api-endpoint="https://evil.example/api/v1/files/303">Fake endpoint</a>
    <a href="/courses/11/files">All files</a>
    <a href="/courses/11/files/folder/Week%201">Folder</a>
    <a href="/courses/11/assignments/5">Assignment</a>
    <a href="javascript:alert(1)">Bad</a>
    <img src="/courses/11/files/304/preview">`;
  assert.deepEqual(fileLinksIn(html, CANVAS), []);
});

test("the same file linked twice shows once, and the list is capped", () => {
  const html = `<a href="/courses/1/files/7">Slides</a> <a href="/courses/1/files/7/download">Download slides</a>`;
  assert.deepEqual(fileLinksIn(html, CANVAS), [{ fileId: "7", courseId: "1", name: "Slides" }]);
  const many = Array.from({ length: 30 }, (_, i) => `<a href="/files/${i + 1}">f${i}</a>`).join("");
  assert.equal(fileLinksIn(many, CANVAS).length, MAX_FILES);
  assert.deepEqual(fileLinksIn("", CANVAS), []);
  assert.deepEqual(fileLinksIn(null, CANVAS), []);
});

test("fileRef only accepts your Canvas site", () => {
  assert.deepEqual(fileRef("/courses/2/files/9/download?wrap=1", CANVAS), { fileId: "9", courseId: "2" });
  assert.equal(fileRef("https://other.instructure.com/files/9", CANVAS), null);
  assert.equal(fileRef("/courses/2/files/abc", CANVAS), null);
  assert.equal(fileRef("", CANVAS), null);
});

test("file kind comes from the type, then Canvas's class, then the name", () => {
  assert.equal(fileKind("application/pdf"), "pdf");
  assert.equal(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "doc");
  assert.equal(fileKind("application/msword"), "doc");
  assert.equal(fileKind("application/vnd.openxmlformats-officedocument.presentationml.presentation"), "slides");
  assert.equal(fileKind("application/vnd.ms-powerpoint"), "slides");
  assert.equal(fileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "sheet");
  assert.equal(fileKind("text/csv"), "sheet");
  assert.equal(fileKind("image/png"), "image");
  assert.equal(fileKind("video/mp4"), "video");
  assert.equal(fileKind("audio/mpeg"), "video");
  assert.equal(fileKind("application/zip"), "zip");
  assert.equal(fileKind("application/x-zip-compressed"), "zip");
  assert.equal(fileKind("", "", "ppt"), "slides");
  assert.equal(fileKind("application/octet-stream", "Week 3.XLSX"), "sheet");
  assert.equal(fileKind("text/plain", "readme.txt"), "other");
  assert.equal(fileKind(undefined), "other");
});

test("sizes read like File Explorer", () => {
  assert.equal(formatSize(0), "0 bytes");
  assert.equal(formatSize(1), "1 byte");
  assert.equal(formatSize(1023), "1023 bytes");
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(839680), "820 KB");
  assert.equal(formatSize(2516582), "2.4 MB");
  assert.equal(formatSize(1048576), "1 MB");
  assert.equal(formatSize(15 * 1048576 + 300000), "15 MB");
  assert.equal(formatSize(3 * 1073741824), "3 GB");
  assert.equal(formatSize(null), "");
  assert.equal(formatSize(undefined), "");
  assert.equal(formatSize("abc"), "");
});
