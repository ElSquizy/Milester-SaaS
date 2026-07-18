"use client";
import { useState } from "react";

interface Props {
  count: number;
  ids: number[];
  categories: string[];
  onClear: () => void;
  onDone: () => void;
}

type Mode = null | "price" | "category" | "visibility";

export default function BulkBar({ count, ids, categories, onClear, onDone }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [priceType, setPriceType] = useState<"pct" | "fixed">("pct");
  const [priceValue, setPriceValue] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [visibility, setVisibility] = useState<"published" | "hidden">("published");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function apply(action: string, value: unknown) {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      const n = data.updated ?? count;
      const verb = action === "duplicate" ? "duplicados"
        : action === "stage-delete" ? "marcados para eliminar"
        : "actualizados";
      setResult(`✓ ${n} productos ${verb}`);
      setTimeout(() => { setResult(""); setMode(null); onDone(); }, 1500);
    } catch (e: unknown) {
      setResult(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bulkbar-wrap" style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 60,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    }}>
      {/* Expanded action panel */}
      {mode === "price" && (
        <div className="anim-modal" style={panel}>
          <span style={panelLabel}>Cambiar precio</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={priceType} onChange={(e) => setPriceType(e.target.value as "pct" | "fixed")} style={miniSelect}>
              <option value="pct">% variación</option>
              <option value="fixed">$ nuevo precio</option>
            </select>
            <input
              autoFocus
              type="number"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder={priceType === "pct" ? "+10 o -5" : "1500"}
              style={miniInput}
            />
            <button
              onClick={() => apply("price", { type: priceType, value: parseFloat(priceValue) })}
              disabled={loading || !priceValue}
              style={applyBtn}
            >
              {loading ? "..." : "Aplicar"}
            </button>
          </div>
          {result && <span style={resultStyle}>{result}</span>}
        </div>
      )}

      {mode === "category" && (
        <div className="anim-modal" style={panel}>
          <span style={panelLabel}>Cambiar categoría</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ ...miniSelect, flex: 1 }}>
              <option value="">Seleccionar...</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => apply("category", newCategory)}
              disabled={loading || !newCategory}
              style={applyBtn}
            >
              {loading ? "..." : "Aplicar"}
            </button>
          </div>
          {result && <span style={resultStyle}>{result}</span>}
        </div>
      )}

      {mode === "visibility" && (
        <div className="anim-modal" style={panel}>
          <span style={panelLabel}>Cambiar visibilidad</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "published" | "hidden")} style={miniSelect}>
              <option value="published">Publicar</option>
              <option value="hidden">Ocultar</option>
            </select>
            <button
              onClick={() => apply("visibility", visibility === "published")}
              disabled={loading}
              style={applyBtn}
            >
              {loading ? "..." : "Aplicar"}
            </button>
          </div>
          {result && <span style={resultStyle}>{result}</span>}
        </div>
      )}

      {/* Main bar */}
      <div className="anim-modal bulkbar-main" style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "10px 16px",
        background: "var(--color-ink)", borderRadius: 16,
        boxShadow: "0 12px 32px -8px rgba(17,24,39,0.35)",
        color: "#F9FAFB",
      }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 500, paddingRight: 8, borderRight: "1px solid oklch(0.30 0.006 265)", marginRight: 4, whiteSpace: "nowrap" }}>
          {count} seleccionados
        </span>

        <BulkBtn active={mode === "price"} onClick={() => setMode(mode === "price" ? null : "price")}>
          Cambiar precio
        </BulkBtn>
        <BulkBtn active={mode === "category"} onClick={() => setMode(mode === "category" ? null : "category")}>
          Categoría
        </BulkBtn>
        <BulkBtn active={mode === "visibility"} onClick={() => setMode(mode === "visibility" ? null : "visibility")}>
          Visibilidad
        </BulkBtn>

        <div style={{ width: 1, height: 20, background: "oklch(0.30 0.006 265)", marginLeft: 4 }} />

        <BulkBtn active={false} onClick={() => apply("duplicate", null)}>
          Duplicar
        </BulkBtn>
        <button
          onClick={() => apply("stage-delete", null)}
          disabled={loading}
          style={{
            padding: "5px 12px", borderRadius: 7, border: "none",
            background: "transparent", color: "oklch(0.70 0.14 22)",
            fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          Eliminar
        </button>

        <div style={{ width: 1, height: 20, background: "oklch(0.30 0.006 265)", marginLeft: 4 }} />

        <button
          onClick={onClear}
          style={{
            padding: "5px 10px", borderRadius: 7, border: "none",
            background: "transparent", color: "oklch(0.60 0.006 265)",
            fontSize: "0.8125rem", cursor: "pointer",
          }}
        >
          Deseleccionar
        </button>
      </div>
    </div>
  );
}

function BulkBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 7, border: "none",
        background: active ? "oklch(0.30 0.01 265)" : "transparent",
        color: active ? "oklch(0.96 0.003 265)" : "oklch(0.70 0.005 265)",
        fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

const panel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start",
  padding: "16px 18px",
  background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)",
  boxShadow: "var(--shadow-float)",
  minWidth: 320,
};

const panelLabel: React.CSSProperties = {
  fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)",
};

const miniInput: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: 8,
  background: "var(--color-surface-2)", fontSize: "0.875rem",
  color: "var(--color-ink)", outline: "none", width: 120,
};

const miniSelect: React.CSSProperties = {
  padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: 8,
  background: "var(--color-surface-2)", fontSize: "0.875rem",
  color: "var(--color-ink)", outline: "none", cursor: "pointer",
};

const applyBtn: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 8, border: "none",
  background: "var(--color-brand)", color: "var(--color-brand-ink)",
  fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
};

const resultStyle: React.CSSProperties = {
  fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 500,
};
