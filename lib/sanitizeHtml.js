import sanitize from "sanitize-html";
import { safeUrl } from "./safeUrl.js";

// Teacher-written HTML from Canvas (assignment instructions, discussion and announcement messages)
// is cleaned here, on the server, before Quick look shows it. Only plain formatting survives:
// text styles, lists, tables, headings, links and pictures. Scripts, styles, frames, forms and
// every on...= handler are removed, and every link and picture goes through safeUrl() (resolved
// against your Canvas address), so nothing in it can run code in the dashboard.
//
// sanitize-html (a parser-based allowlist cleaner) is used instead of hand-written regexes,
// which miss tricky markup like broken tags or encoded "javascript:" links.

const TAGS = [
  "p", "br", "hr", "div", "span", "b", "strong", "i", "em", "u", "s", "strike", "del", "ins",
  "sub", "sup", "small", "mark", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption",
];

export function cleanHtml(html, base) {
  if (!html || typeof html !== "string") return "";
  return sanitize(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      ol: ["start"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    // These lose their contents too, not just the tag.
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "form", "select", "button", "svg", "math", "template"],
    transformTags: {
      // The pop-up's own title is the big heading, so the teacher's headings start one step down.
      h1: "h3",
      h2: "h3",
      a: (tagName, attribs) => {
        const href = safeUrl(attribs.href, base);
        const out = attribs.title ? { title: attribs.title } : {};
        if (href) Object.assign(out, { href, target: "_blank", rel: "noreferrer" });
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: safeUrl(attribs.src, base) },
      }),
    },
    // A picture whose address wasn't a real web link is dropped entirely.
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  }).trim();
}
