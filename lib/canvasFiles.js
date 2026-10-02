// Canvas files in Quick look: finding the files a teacher linked inside instructions or a message,
// naming their type and size. Pure (no server-only imports), so tests and the browser can use it.

import { sameOrigin } from "./safeUrl.js";

export const MAX_FILES = 20;

// Canvas file addresses: /courses/1/files/2, /courses/1/files/2/download?..., /files/2/...,
// /users/3/files/2, /groups/4/files/2, and the API forms /api/v1/courses/1/files/2 or /api/v1/files/2.
// A folder listing (/courses/1/files or /courses/1/files/folder/...) has no file id and isn't matched.
const FILE_PATH = /^(?:\/api\/v1)?(?:\/(courses|users|groups)\/(\d{1,20}))?\/files\/(\d{1,20})(?:\/|$)/;

function decode(text) {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : "";
}

// { fileId, courseId } for a Canvas file address on `base`'s site, else null.
export function fileRef(href, base) {
  if (!href || !base) return null;
  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (!sameOrigin(url.href, base)) return null;
  const m = url.pathname.match(FILE_PATH);
  if (!m) return null;
  return { fileId: m[3], courseId: m[1] === "courses" ? m[2] : null };
}

// Every Canvas file linked in `html` (only links on your Canvas site), once each, in page order,
// at most MAX_FILES. Reads the link's address and Canvas's own data-api-endpoint, and the link's
// text (or title) as a fallback name.
export function fileLinksIn(html, base) {
  if (!html || typeof html !== "string") return [];
  const out = [];
  const seen = new Set();
  const links = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const [, attrs, inner] of links) {
    const tag = ` ${attrs}`;
    const ref = fileRef(attr(tag, "href"), base) || fileRef(attr(tag, "data-api-endpoint"), base);
    if (!ref || seen.has(ref.fileId)) continue;
    seen.add(ref.fileId);
    const text = decode(inner.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    out.push({ ...ref, name: text || attr(tag, "title").trim() || "" });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

// pdf | doc | slides | sheet | image | video | zip | other, from the file's type (or its name).
export function fileKind(mime, name = "", mimeClass = "") {
  const m = String(mime || "").toLowerCase();
  const c = String(mimeClass || "").toLowerCase();
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || "";
  if (m === "application/pdf" || c === "pdf" || ext === "pdf") return "pdf";
  if (/presentation|powerpoint/.test(m) || c === "ppt" || ["ppt", "pptx", "key", "odp"].includes(ext)) return "slides";
  if (/spreadsheet|excel|text\/csv/.test(m) || c === "xls" || ["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return "sheet";
  if (/msword|wordprocessing|opendocument\.text|rtf/.test(m) || c === "doc" || ["doc", "docx", "odt", "rtf", "pages"].includes(ext)) return "doc";
  if (m.startsWith("image/") || c === "image" || ["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "image";
  if (m.startsWith("video/") || m.startsWith("audio/") || c === "video" || c === "audio" || ["mp4", "mov", "webm", "mp3", "wav", "m4a"].includes(ext)) return "video";
  if (/zip|compressed|x-7z|x-rar|x-tar|gzip/.test(m) || c === "zip" || ["zip", "7z", "rar", "tar", "gz"].includes(ext)) return "zip";
  return "other";
}

// 2516582 → "2.4 MB" (1024-based, like Windows File Explorer). Unknown → "".
export function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0 || bytes === null || bytes === "") return "";
  if (n < 1024) return `${n} byte${n === 1 ? "" : "s"}`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = i === 0 || v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[i]}`;
}
