export default function MaintenancePage() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--color-bg)", textAlign: "center" }}>
      <div style={{ maxWidth: 380 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--color-brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.25rem", margin: "0 auto 18px" }}>M</div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" }}>En mantenimiento</h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-subtle)", margin: 0, lineHeight: 1.5 }}>
          Milester está temporalmente fuera de servicio. Volvé a intentar en un rato.
        </p>
      </div>
    </div>
  );
}
