// Full /setup page (reload or a plain /setup link): the page's own outline with placeholder
// boxes while settings load, instead of the dashboard's "Getting your classes" screen.
export default function Loading() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-10" role="status" aria-label="Loading settings">
      <div className="mb-4 h-[68px]" />
      <div className="settings-skeleton h-9 w-40 rounded-lg" style={{ background: "var(--surface-2)" }} />
      <div className="settings-skeleton mt-3 h-4 w-4/5 rounded" style={{ background: "var(--surface-2)" }} />
      <div className="mt-6 flex flex-col gap-4">
        {[104, 64, 64, 64].map((height, i) => (
          <div key={i} className="settings-skeleton rounded-2xl" style={{ height, background: "var(--surface)" }} />
        ))}
      </div>
    </main>
  );
}
