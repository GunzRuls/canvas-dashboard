// Dev tool (not part of the app): marks up screenshots for review.
// Draws numbered highlight boxes with short notes on a screenshot, or puts several screenshots
// side by side (e.g. Before / After), then saves one PNG using headless Microsoft Edge.
//
//   node tools/annotate-screenshot.mjs spec.json
//
// spec.json:
// { "out": "C:/path/result.png",
//   "title": "DASH-19 Remove the 7-day strip",          (optional heading)
//   "panels": [
//     { "src": "C:/path/before.png", "label": "Before",
//       "boxes": [ { "x": 356, "y": 70, "w": 1160, "h": 62, "note": "7-day strip" } ] },
//     { "src": "C:/path/after.png", "label": "After", "boxes": [] } ] }
// Box coordinates are in the screenshot's own pixels.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// Width and height straight from the file header (PNG or JPEG), so no image library is needed.
function size(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("Unknown image format");
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const panels = spec.panels.map((p) => {
  const buf = fs.readFileSync(p.src);
  const { w, h } = size(buf);
  const mime = buf.readUInt32BE(0) === 0x89504e47 ? "image/png" : "image/jpeg";
  return { ...p, w, h, data: `data:${mime};base64,${buf.toString("base64")}` };
});

// Panels share one row; each is scaled to the same height so Before/After line up.
const rowH = Math.min(...panels.map((p) => p.h));
const gap = 24, pad = 24, headH = spec.title ? 56 : 0, labelH = 34;
const scaled = panels.map((p) => ({ ...p, s: rowH / p.h, sw: Math.round(p.w * (rowH / p.h)) }));
const width = pad * 2 + scaled.reduce((a, p) => a + p.sw, 0) + gap * (scaled.length - 1);
const height = pad * 2 + headH + labelH + rowH;

let n = 0;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#F6F3EC;font:600 15px "Segoe UI",system-ui,sans-serif;color:#1B1A2E}
.wrap{padding:${pad}px}
h1{margin:0 0 ${headH ? 16 : 0}px;font:800 26px "Segoe UI",system-ui,sans-serif;height:${headH ? 40 : 0}px}
.row{display:flex;gap:${gap}px}
.label{height:${labelH}px;font-weight:800;font-size:16px;text-transform:uppercase;letter-spacing:.06em}
.label.before{color:#8A879C}.label.after{color:#2A45D6}
.shot{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px #E3DDD0,0 6px 18px rgba(27,26,46,.12)}
.shot img{display:block}
.box{position:absolute;border:4px solid #FF2D55;border-radius:10px;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 0 0 9999px rgba(20,19,31,.18)}
.tag{position:absolute;left:-4px;top:-38px;background:#FF2D55;color:#fff;font:800 14px "Segoe UI",system-ui,sans-serif;padding:5px 10px;border-radius:8px;white-space:nowrap}
.tag.below{top:auto;bottom:-38px}
.tag.right{left:auto;right:-4px}
</style><div class="wrap">${spec.title ? `<h1>${esc(spec.title)}</h1>` : ""}<div class="row">${scaled
  .map((p) => {
    const lab = p.label ? `<div class="label ${/before/i.test(p.label) ? "before" : "after"}">${esc(p.label)}</div>` : `<div class="label"></div>`;
    const boxes = (p.boxes || [])
      .map((b) => {
        n += 1;
        const below = b.y * p.s < 44;
        // Near the right edge the note hangs to the left so it isn't cut off.
        const right = (b.x + b.w / 2) > p.w * 0.6;
        return `<div class="box" style="left:${b.x * p.s}px;top:${b.y * p.s}px;width:${b.w * p.s}px;height:${b.h * p.s}px"><span class="tag${below ? " below" : ""}${right ? " right" : ""}">${n}. ${esc(b.note)}</span></div>`;
      })
      .join("");
    return `<div>${lab}<div class="shot" style="width:${p.sw}px;height:${rowH}px"><img src="${p.data}" width="${p.sw}" height="${rowH}">${boxes}</div></div>`;
  })
  .join("")}</div></div>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "annotate-"));
const page = path.join(tmp, "page.html");
fs.writeFileSync(page, html);
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const out = path.resolve(spec.out);
fs.rmSync(out, { force: true });
execFileSync(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${path.join(tmp, "profile")}`, `--window-size=${width},${height}`, "--virtual-time-budget=5000", `--screenshot=${out}`, "file:///" + page.replace(/\\/g, "/")], { stdio: "ignore" });
// Edge can hand off to a background process and return before the PNG is written.
for (let i = 0; i < 60 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 500));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
if (!fs.existsSync(out)) throw new Error("Edge didn't save the screenshot");
console.log(`Saved ${spec.out} (${width}x${height})`);
