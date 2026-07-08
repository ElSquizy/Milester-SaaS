"use client";
import { useState } from "react";
import { useToast } from "./Toast";

interface Props { selectedIds: number[]; onClear: () => void; onDone: () => void }

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.75rem", fontWeight: 500,
  color: "var(--color-muted)", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--color-border)", borderRadius: 8,
  padding: "7px 10px", fontSize: "0.875rem", color: "var(--color-ink)",
  background: "var(--color-surface)", outline: "none",
  boxShadow: "0 1px 2px oklch(0.16 0.01 252 / 0.04)",
};
const btnPrimary: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 8,
  background: "var(--color-brand)", color: "white",
  fontSize: "0.875rem", fontWeight: 500, border: "none", cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 8,
  background: "transparent", color: "var(--color-muted)",
  fontSize: "0.875rem", border: "1px solid var(--color-border)", cursor: "pointer",
};

export default function BulkBar({ selectedIds, onClear, onDone }: Props) {
  const toast = useToast();
  const [modal, setModal] = useState<"price" | "promo" | null>(null);
  const [priceType, setPriceType] = useState<"pct" | "fixed">("pct");
  const [priceVal, setPriceVal] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  async function bulk(action: string, value?: unknown) {
    setLoading(true);
    const res = await fetch("/api/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, action, value }),
    });
    const data = await res.json();
    setLoading(false);
    setModal(null);
    if (data.ok) { toast(`${selectedIds.length} productos actualizados`, "success"); onDone(); onClear(); }
    else toast(data.error || "Error al actualizar", "error");
  }

  return (
    <>
      {/* Floating bar */}
      <div
        className="animate-slide-up"
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "oklch(0.16 0.015 252 / 0.92)",
          backdropFilter: "blur(20px) saturate(1.8)",
          WebkitBackdropFilter: "blur(20px) saturate(1.8)",
          border: "0.5px solid oklch(1 0 0 / 0.12)",
          borderRadius: 14, padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 8px 40px oklch(0.10 0.02 252 / 0.55), 0 1px 0 oklch(1 0 0 / 0.08) inset",
          zIndex: 40, whiteSpace: "nowrap",
        }}
      >
        <span style={{
          background: "var(--color-brand)", color: "white",
          borderRadius: 6, padding: "2px 8px",
          fontSize: "0.75rem", fontWeight: 600,
        }}>{selectedIds.length}</span>

        <span style={{ fontSize: "0.8125rem", color: "oklch(0.75 0.01 252)" }}>seleccionados</span>

        <div style={{ width: 1, height: 16, background: "oklch(1 0 0 / 0.12)", margin: "0 4px" }} />

        {[
          { label: "Cambiar precio", action: () => setModal("price") },
          { label: "Agregar promo", action: () => setModal("promo") },
          { label: "Sincronizar", action: () => bulk("sync") },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.action}
            disabled={loading}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "0.8125rem", color: "oklch(0.88 0.01 252)",
              padding: "4px 6px", borderRadius: 6,
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            {b.label}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: "oklch(1 0 0 / 0.12)", margin: "0 4px" }} />

        <button
          onClick={onClear}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "0.75rem", color: "oklch(0.55 0.01 252)", padding: "4px 6px",
          }}
        >✕</button>
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="anim-fade"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "oklch(0.16 0.01 252 / 0.35)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            className="anim-modal panel"
            style={{ width: 360, padding: "24px" }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 600, color: "var(--color-ink)" }}>
              {modal === "price" ? "Cambiar precio" : "Agregar promoción"}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
              {selectedIds.length} productos seleccionados
            </p>

            {modal === "price" && (
              <>
                <div style={{
                  display: "flex", background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)", borderRadius: 9, padding: 3, gap: 3, marginBottom: 14,
                }}>
                  {(["pct", "fixed"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setPriceType(t)}
                      style={{
                        flex: 1, padding: "5px", border: "none", borderRadius: 7, cursor: "pointer",
                        fontSize: "0.8125rem", fontWeight: 500, transition: "all 0.12s",
                        background: priceType === t ? "var(--color-surface)" : "transparent",
                        color: priceType === t ? "var(--color-ink)" : "var(--color-muted)",
                        boxShadow: priceType === t ? "0 1px 3px oklch(0.16 0.01 252 / 0.1)" : "none",
                      }}
                    >
                      {t === "pct" ? "Porcentaje" : "Valor fijo"}
                    </button>
                  ))}
                </div>
                <input
                  type="number" step="0.01" value={priceVal}
                  onChange={(e) => setPriceVal(e.target.value)}
                  placeholder={priceType === "pct" ? "Ej: -10 para bajar 10%" : "Nuevo precio"}
                  style={{ ...inputStyle, marginBottom: 18 }}
                />
              </>
            )}

            {modal === "promo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Precio promocional</label>
                  <input type="number" step="0.01" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Inicio</label>
                    <input type="date" value={promoStart} onChange={(e) => setPromoStart(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fin</label>
                    <input type="date" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModal(null)} style={btnSecondary}>Cancelar</button>
              <button
                onClick={() =>
                  modal === "price"
                    ? bulk("price", { type: priceType, value: parseFloat(priceVal) })
                    : bulk("promo", { promoPrice: parseFloat(promoPrice), startDate: promoStart, endDate: promoEnd })
                }
                disabled={loading || (modal === "price" ? !priceVal : !promoPrice || !promoStart || !promoEnd)}
                style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}
              >
                {loading ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
