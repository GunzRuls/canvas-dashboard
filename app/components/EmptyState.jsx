"use client";

// Friendly empty states for lists (board columns, announcements): a small confetti graphic in the
// app's class colors around an icon, a short title, and one line of help. The confetti pieces are
// the same shapes as the app logo. They drift gently; the global reduced-motion rule stops that.

const PIECES = [
  // [x, y, width, height, rotation, color] in a 120x88 box; dots have width = height
  [8, 14, 12, 6, -18, "#7C5CFA"],
  [100, 10, 10, 10, 0, "#FFB020"],
  [16, 62, 8, 8, 0, "#13A3B5"],
  [96, 58, 14, 6, 24, "#EF4F8C"],
  [30, 4, 6, 6, 0, "#6DBE2E"],
  [86, 76, 7, 7, 0, "#2F6BFF"],
  [4, 40, 6, 6, 0, "#FF7A2F"],
  [108, 34, 10, 5, -30, "#13A3B5"],
];

const ICONS = {
  check: <path d="M8 12.5l2.6 2.6L16 9.5" />,
  play: <path d="M10 8.5v7l5.5-3.5z" />,
  flag: (
    <>
      <path d="M8.5 18V6.5" />
      <path d="M8.5 7h7l-1.6 2.5 1.6 2.5h-7" />
    </>
  ),
  megaphone: (
    <>
      <path d="M6.5 11v2a1 1 0 0 0 1 1h1.5l4 3V7l-4 3H7.5a1 1 0 0 0-1 1z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  chat: (
    <>
      <path d="M6.5 8.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-4l-3 2.5v-2.5h0a2 2 0 0 1-2-2z" />
      <path d="M9.5 10h5M9.5 12.5h3" />
    </>
  ),
};

const KINDS = {
  todo: { icon: "check", tone: "green", title: "All caught up!", text: "Nothing left to start. Nice work.", pieces: 8 },
  doing: { icon: "play", tone: "brand", title: "Nothing in progress", text: "Press Start on a card, or drag one here, when you begin.", pieces: 4 },
  done: { icon: "flag", tone: "brand", title: "Nothing finished yet", text: "Work you complete lands here.", pieces: 4 },
  news: { icon: "megaphone", tone: "purple", title: "You're all caught up", text: "New announcements will show up here.", pieces: 6 },
  feedback: { icon: "chat", tone: "brand", title: "No teacher comments in the last 30 days", text: "Comments teachers leave on your graded work will show up here.", pieces: 5 },
};

const TONES = {
  green: { bg: "var(--green-bg)", fg: "var(--green-fg)" },
  brand: { bg: "var(--brand-tint)", fg: "var(--brand-text)" },
  purple: { bg: "var(--purple-bg)", fg: "var(--purple-fg)" },
};

export default function EmptyState({ kind = "todo", title, text }) {
  const k = KINDS[kind] || KINDS.todo;
  const tone = TONES[k.tone];
  return (
    <div className="flex flex-col items-center px-3 py-6 text-center" role="status">
      <svg viewBox="0 0 120 88" className="h-[88px] w-[120px]" aria-hidden="true">
        {PIECES.slice(0, k.pieces).map(([x, y, w, h, r, color], i) => (
          // The drift is on the wrapper so it doesn't replace the piece's own tilt.
          <g key={i} className="empty-confetti" style={{ animationDelay: `${(i % 4) * 0.35}s` }}>
            <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill={color} transform={`rotate(${r} ${x + w / 2} ${y + h / 2})`} />
          </g>
        ))}
        <circle cx="60" cy="44" r="24" style={{ fill: tone.bg }} />
        <g
          transform="translate(48 32)"
          fill="none"
          stroke={tone.fg}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ stroke: tone.fg }}
        >
          {ICONS[k.icon]}
        </g>
      </svg>
      <p className="font-display mt-2 text-base font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
        {title || k.title}
      </p>
      <p className="mt-0.5 max-w-[22rem] text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {text || k.text}
      </p>
    </div>
  );
}
