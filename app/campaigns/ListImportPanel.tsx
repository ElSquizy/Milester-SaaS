"use client";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { MatchResult, MatchCandidate } from "@/lib/listMatch";

export type ImportItem = { id: number; name: string; imageUrl: string | null; price: number };

/**
 * Importar campaña desde una lista pegada. Recall-first: por cada línea muestra
 * los candidatos más parecidos y el usuario tilda el/los correctos. Los de alta
 * confianza vienen pre-tildados para colocar la mayoría sola.
 *
 * Se renderiza por PORTAL a document.body: el modal del wizard usa transform y
 * backdrop-filter, que atrapan a un `position: fixed` anidado (se veía recortado).
 *
 * La selección se guarda por LÍNEA+candidato (no por id de producto), así el
 * mismo producto que aparece como candidato en dos líneas se marca por separado.
 */
export default function ListImportPanel({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (items: ImportItem[]) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  const key = (line: number, id: number) => `${line}:${id}`;

  async function run() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/products/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo procesar la lista");
      const rs: MatchResult[] = d.results ?? [];
      setResults(rs);
      // Pre-tildar el mejor candidato de cada línea si es de alta confianza.
      const pre = new Set<string>();
      rs.forEach((r, li) => {
        const top = r.candidates[0];
        if (top && top.confidence === "alta") pre.add(key(li, top.id));
      });
      setChecked(pre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  function toggle(k: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  function checkAllHigh() {
    setChecked((prev) => {
      const n = new Set(prev);
      (results ?? []).forEach((r, li) => r.candidates.forEach((c) => { if (c.confidence === "alta") n.add(key(li, c.id)); }));
      return n;
    });
  }

  const stats = useMemo(() => {
    if (!results) return null;
    const withMatch = results.filter((r) => r.candidates.length > 0).length;
    return { lines: results.length, withMatch, none: results.length - withMatch };
  }, [results]);

  // Productos elegidos (dedupe por id — a la campaña un producto entra una vez).
  const chosen = useMemo(() => {
    if (!results) return [] as ImportItem[];
    const byId = new Map<number, ImportItem>();
    results.forEach((r, li) => r.candidates.forEach((c) => {
      if (checked.has(key(li, c.id)) && !byId.has(c.id)) byId.set(c.id, { id: c.id, name: c.name, imageUrl: c.imageUrl, price: c.price });
    }));
    return [...byId.values()];
  }, [results, checked]);

  if (!mounted) return null;

  const panel = (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 720, maxHeight: "calc(100dvh - 48px)", background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>Importar desde lista</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 24px" }}>
          {!results ? (
            <>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Pegá tu lista (un producto por línea). Reconoce el nombre, <code>[PS5,PS4]</code> y el precio.
                Después elegís los correctos de los candidatos que sugiera.
              </p>
              <textarea
                value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"● Mortal Kombat 11 Ultimate [PS5,PS4] —  $5.99\n● Far Cry 4 [PS4] —  $2.99\n…"}
                style={{ width: "100%", minHeight: 220, resize: "vertical", padding: "12px 14px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.8125rem", fontFamily: "var(--font-mono), monospace", lineHeight: 1.5, color: "var(--color-ink)" }}
              />
              {error && <div style={{ fontSize: "0.8125rem", color: "var(--color-danger)", marginTop: 8 }}>{error}</div>}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                  {stats!.lines} líneas · <b style={{ color: "var(--color-ink)" }}>{stats!.withMatch}</b> con candidatos · {stats!.none} sin match
                </span>
                <button onClick={checkAllHigh} className="btn-secondary" style={{ padding: "5px 11px", fontSize: "0.75rem" }}>Tildar todos los de alta confianza</button>
                <button onClick={() => { setResults(null); setChecked(new Set()); }} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-brand)" }}>← Editar lista</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {results.map((r, li) => (
                  <div key={li} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", background: "var(--color-surface-2)", display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.line.title}</span>
                      {r.line.platforms.length > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>[{r.line.platforms.join(", ")}]</span>}
                      {r.line.usd != null && <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>US${r.line.usd}</span>}
                    </div>
                    {r.candidates.length === 0 ? (
                      <div style={{ padding: "10px 12px", fontSize: "0.75rem", color: "var(--color-subtle)" }}>Sin candidatos en el catálogo.</div>
                    ) : r.candidates.map((c) => {
                      const k = key(li, c.id);
                      return <CandidateRow key={k} c={c} on={checked.has(k)} onToggle={() => toggle(k)} />;
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-subtle)" }}>
            {results ? `${chosen.length} productos elegidos` : ""}
          </span>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          {!results
            ? <button className="btn-primary" onClick={run} disabled={loading || !text.trim()}>{loading ? "Buscando…" : "Buscar coincidencias"}</button>
            : <button className="btn-primary" onClick={() => { onAdd(chosen); onClose(); }} disabled={chosen.length === 0}>Agregar {chosen.length || ""} productos</button>}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function CandidateRow({ c, on, onToggle }: { c: MatchCandidate; on: boolean; onToggle: () => void }) {
  const badge = c.confidence === "alta" ? { bg: "var(--color-success-bg)", fg: "var(--color-success)" }
    : c.confidence === "media" ? { bg: "var(--color-warning-bg)", fg: "var(--color-warning)" }
    : { bg: "var(--color-surface-2)", fg: "var(--color-subtle)" };
  return (
    <button onClick={onToggle} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid var(--color-divider)", background: on ? "var(--color-brand-light)" : "transparent", cursor: "pointer", border: "none" }}>
      <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, border: `1.5px solid ${on ? "var(--color-brand)" : "var(--color-border)"}`, background: on ? "var(--color-brand)" : "var(--color-surface)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6875rem", fontWeight: 700 }}>{on ? "✓" : ""}</span>
      {c.imageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c.imageUrl} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
        : <span style={{ width: 30, height: 30, borderRadius: 6, background: "var(--color-surface-2)", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>
          {c.platform !== "?" && <>{c.platform} · </>}{c.acct !== "—" && <>{c.acct} · </>}${c.price.toLocaleString("es-AR")}
        </div>
      </div>
      <span style={{ flexShrink: 0, fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", padding: "2px 7px", borderRadius: "var(--radius-pill)", background: badge.bg, color: badge.fg }}>{c.confidence}</span>
    </button>
  );
}
