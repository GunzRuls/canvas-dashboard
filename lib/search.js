// Search (DASH-11): matching and ranking for the Ctrl+K search box. Pure (no imports), so the
// browser and tests can both use it.
//
// Rules: every word you type must match somewhere (title, class, or text). A match in the title
// beats one in the class name, which beats one in the text. A whole word beats the start of a word,
// which beats the middle of one. Case and accents don't matter ("resume" finds "Résumé").
// On a tie, upcoming things come first (soonest first), then past ones (newest first).

// ---------- folding text ----------

// One character, lowercased and without accents. Letters and digits stay, the rest become spaces.
function foldChar(ch) {
  const plain = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!plain) return ""; // a lone accent mark belongs to the letter before it
  return /^[\p{L}\p{N}]+$/u.test(plain) ? plain : " ";
}

// The folded text plus, for each folded character, where it came from in the original, so
// highlights land on the right letters even when a letter changes length when folded.
function foldWithMap(text) {
  const src = String(text ?? "");
  let out = "";
  const map = [];
  let i = 0;
  for (const ch of src) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) {
      out += f[k];
      map.push(i);
    }
    i += ch.length;
  }
  map.push(i); // the end
  return { text: out, map };
}

export function fold(text) {
  return foldWithMap(text).text;
}

// "  Lab-Report, résumé " -> ["lab", "report", "resume"] (once each)
export function queryWords(query) {
  return [...new Set(fold(query).split(" ").filter(Boolean))];
}

// ---------- matching one word ----------

const isWordChar = (c) => c !== undefined && c !== " ";

// 3 = a whole word, 2 = the start of a word, 1 = inside a word, 0 = not there. `folded` is fold(text).
export function matchLevel(folded, word) {
  if (!word || !folded) return 0;
  let best = 0;
  let at = folded.indexOf(word);
  while (at !== -1 && best < 3) {
    const startsWord = !isWordChar(folded[at - 1]);
    const endsWord = !isWordChar(folded[at + word.length]);
    best = Math.max(best, startsWord ? (endsWord ? 3 : 2) : 1);
    at = folded.indexOf(word, at + 1);
  }
  return best;
}

// Points per match level, by where the word was found.
const POINTS = {
  title: [0, 10, 20, 30],
  meta: [0, 4, 8, 12],
  body: [0, 2, 4, 6],
};

// ---------- ranking ----------

// `entries`: [{ title, meta?, body?, date?, boost?, ... }]. `meta` is the class name and code,
// `body` is extra text (an announcement's message). `date` is an ISO date used for ties; `boost`
// nudges an entry up or down (Done work is nudged down). Returns the matching entries, best first,
// each with a `score`. An empty query matches nothing.
export function rankEntries(entries, query, now = Date.now()) {
  const words = queryWords(query);
  if (!words.length) return [];
  const phrase = words.join(" ");
  const out = [];
  for (const entry of entries) {
    const title = fold(entry.title);
    const meta = fold(entry.meta);
    const body = fold(entry.body);
    let score = 0;
    let all = true;
    for (const w of words) {
      const best = Math.max(
        POINTS.title[matchLevel(title, w)],
        POINTS.meta[matchLevel(meta, w)],
        POINTS.body[matchLevel(body, w)]
      );
      if (!best) {
        all = false;
        break;
      }
      score += best;
    }
    if (!all) continue;
    // The words together, in order, in the title: a bonus, and more when the title starts with them.
    const squashed = title.replace(/ +/g, " ").trim();
    if (words.length > 1 && squashed.includes(phrase)) score += 15;
    if (squashed.startsWith(phrase)) score += 10;
    score += entry.boost || 0;
    out.push({ ...entry, score });
  }
  return out.sort((a, b) => b.score - a.score || byWhen(a, b, now));
}

// Upcoming first (soonest first), then past (newest first), then no date.
export function byWhen(a, b, now) {
  const ta = a.date ? new Date(a.date).getTime() : NaN;
  const tb = b.date ? new Date(b.date).getTime() : NaN;
  const rank = (t) => (Number.isNaN(t) ? 2 : t >= now ? 0 : 1);
  const ra = rank(ta);
  const rb = rank(tb);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return ta - tb;
  if (ra === 1) return tb - ta;
  return 0;
}

// ---------- showing matches ----------

// Splits `text` into pieces, marking the parts that match the query's words, for <mark>.
// [{ text: "Lab ", match: false }, { text: "Report", match: true }]
export function highlight(text, query) {
  const src = String(text ?? "");
  const words = queryWords(query);
  if (!src || !words.length) return src ? [{ text: src, match: false }] : [];
  const { text: folded, map } = foldWithMap(src);
  const marked = new Array(folded.length).fill(false);
  for (const w of words) {
    let at = folded.indexOf(w);
    while (at !== -1) {
      for (let k = at; k < at + w.length; k++) marked[k] = true;
      at = folded.indexOf(w, at + 1);
    }
  }
  const pieces = [];
  let k = 0;
  while (k < folded.length) {
    const match = marked[k];
    let end = k;
    while (end < folded.length && marked[end] === match) end++;
    const from = map[k];
    const to = map[end];
    if (to > from) {
      const last = pieces[pieces.length - 1];
      if (last && last.match === match) last.text += src.slice(from, to);
      else pieces.push({ text: src.slice(from, to), match });
    }
    k = end;
  }
  return pieces;
}

// A short piece of `text` around its first match ("…the lab report is due…"), so a match inside
// an announcement's message shows why it came up. "" when nothing matches.
export function snippet(text, query, length = 90) {
  const src = String(text ?? "").replace(/\s+/g, " ").trim();
  const words = queryWords(query);
  if (!src || !words.length) return "";
  const { text: folded, map } = foldWithMap(src);
  let first = -1;
  for (const w of words) {
    const at = folded.indexOf(w);
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  if (first === -1) return "";
  const hit = map[first];
  let start = Math.max(0, hit - Math.floor(length / 3));
  // Start at a word boundary so the snippet doesn't begin mid-word.
  if (start > 0) {
    const space = src.indexOf(" ", start);
    start = space !== -1 && space < hit ? space + 1 : start;
  }
  const end = Math.min(src.length, start + length);
  return `${start > 0 ? "…" : ""}${src.slice(start, end).trim()}${end < src.length ? "…" : ""}`;
}

// ---------- "Jump to" (empty search box) ----------

// The next `count` things due that aren't done (soonest first). `isDone(item)` says if it's done.
export function nextDue(items, now, isDone = () => false, count = 5) {
  return items
    .filter((i) => i.dueAt && new Date(i.dueAt).getTime() >= now && !isDone(i))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, count);
}

// The newest `count` announcements.
export function newestAnnouncements(announcements, count = 3) {
  return [...announcements]
    .filter((a) => a.postedAt)
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, count);
}

// For the file search on the server: the longest word (Canvas matches the text as one piece, so
// one word finds more; the rest are checked here). "" when no word is at least 2 letters.
export function fileSearchTerm(query) {
  const words = String(query ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 2);
  return words.sort((a, b) => b.length - a.length)[0] || "";
}
