// Shown right away while the dashboard fetches your classes from Canvas (a few seconds).
export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" width={72} height={72} className="loading-float rounded-2xl" />
        <p className="mt-5 text-lg font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
          School Dashboard
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Getting your classes from Canvas…
        </p>
        <div className="mt-5 h-1.5 w-48 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div className="loading-bar h-full w-1/3 rounded-full" style={{ background: "var(--focus)" }} />
        </div>
      </div>
    </main>
  );
}
