// Shown instantly while a route's server component loads (masks slow first loads
// and cold starts). The sidebar stays; only the content area shows this.
export default function Loading() {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Top progress bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--color-surface-2)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", background: "var(--color-brand)", borderRadius: 2, animation: "loadingBar 1.1s ease-in-out infinite" }} />
      </div>

      {/* Centered brand spinner */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" className="anim-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontWeight: 500 }}>Cargando…</span>
      </div>
    </div>
  );
}
