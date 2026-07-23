"use client";
import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/components/useIsMobile";
import { notifyPendingChanged } from "@/lib/pendingEvent";
import {
  type PricingConfig, type TaxComponent, type Tier,
  normalizeTiers, effectiveRate, computeTierPrice, installmentNet,
} from "@/lib/pricingCore";

/**
 * Ventana "Precios": la tabla de franjas USD que gobierna los precios del
 * catálogo. Dólar como disparador, pila de impuestos editable (gross-up),
 * ganancia fija ARS por franja (primaria/secundaria), overrides manuales,
 * columnas de cuotas y aplicación masiva staged al catálogo.
 */

type Summary = {
  perTier: Record<number, { products: number; misaligned: number }>;
  toChange: number;
  changeIds: number[];
  unpositioned: { id: number; name: string }[];
  outOfRange: { id: number; name: string }[];
  inActiveCampaign: { id: number; name: string }[];
};

const money = (n: number) => `$${n.toLocaleString("es-AR")}`;
const BATCH = 150;

export default function PricingClient({ initialConfig }: { initialConfig: PricingConfig }) {
  const isMobile = useIsMobile();
  const [cfg, setCfg] = useState<PricingConfig>(initialConfig);
  const [savedCfg, setSavedCfg] = useState(initialConfig);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState<{ changed: number; skipped: number } | null>(null);
  const [showUnpositioned, setShowUnpositioned] = useState(false);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(savedCfg);
  const rate = effectiveRate(cfg.taxes);
  const activePlans = cfg.installments.filter((p) => p.enabled);

  const loadSummary = useCallback(() => {
    setSummary(null);
    fetch("/api/pricing/summary").then((r) => r.json()).then(setSummary).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const patch = (p: Partial<PricingConfig>) => setCfg((c) => normalizeTiers({ ...c, ...p }));
  const patchTier = (maxUsd: number, p: Partial<Tier>) =>
    setCfg((c) => ({ ...c, tiers: c.tiers.map((t) => (t.maxUsd === maxUsd ? { ...t, ...p } : t)) }));
  const patchTax = (id: string, p: Partial<TaxComponent>) =>
    setCfg((c) => ({ ...c, taxes: c.taxes.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/pricing/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      setCfg(d); setSavedCfg(d);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      loadSummary(); // el diff depende de la config guardada
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  }

  async function applyAll() {
    if (!summary) return;
    setConfirmOpen(false);
    const ids = summary.changeIds;
    setApplying({ done: 0, total: ids.length });
    let changed = 0, skipped = 0;
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const res = await fetch("/api/pricing/apply", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: ids.slice(i, i + BATCH) }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Error aplicando");
        changed += d.changed; skipped += d.skipped;
        setApplying({ done: Math.min(i + BATCH, ids.length), total: ids.length });
      }
      setApplied({ changed, skipped });
      notifyPendingChanged();
      loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setApplying(null); }
  }

  return (
    <div style={{ padding: isMobile ? "20px 16px 90px" : "28px 32px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 3px", letterSpacing: "-0.02em" }}>Precios</h1>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 22px" }}>
        La tabla de franjas gobierna el catálogo: costo USD → precio base · costo USD promo → precio promocional.
      </p>

      {/* ── Dólar (el disparador) ── */}
      <div className="card anim-up" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={lbl}>Dólar</div>
          <div style={{ position: "relative", marginTop: 5 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", fontWeight: 600 }}>$</span>
            <input className="input" inputMode="decimal" value={cfg.dollar || ""} placeholder="1450"
              onChange={(e) => patch({ dollar: parseFloat(e.target.value.replace(",", ".")) || 0 })}
              style={{ paddingLeft: 26, width: 140, fontSize: "1.125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
          {savedCfg.dollarUpdatedAt ? `Guardado el ${new Date(savedCfg.dollarUpdatedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} a las ${new Date(savedCfg.dollarUpdatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Cargá la cotización con la que comprás"}
          {" — "}al cambiarlo, la tabla se recalcula en vivo; nada toca el catálogo hasta «Aplicar».
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={lbl}>Descuento efectivo de la pila</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: rate >= 1 ? "var(--color-danger)" : "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
            {(rate * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Pila de impuestos ── */}
      <Collapsible title={`Impuestos y comisiones · ${cfg.taxes.filter((t) => t.enabled).length} activos`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cfg.taxes.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input type="checkbox" checked={t.enabled} onChange={(e) => patchTax(t.id, { enabled: e.target.checked })} style={{ accentColor: "var(--color-brand)" }} title="Activo" />
              <input className="input" value={t.name} onChange={(e) => patchTax(t.id, { name: e.target.value })} style={{ width: 170, padding: "6px 9px", fontSize: "0.8125rem", opacity: t.enabled ? 1 : 0.5 }} />
              <input className="input" inputMode="decimal" value={t.value} onChange={(e) => patchTax(t.id, { value: parseFloat(e.target.value.replace(",", ".")) || 0 })} style={{ width: 80, padding: "6px 9px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: t.enabled ? 1 : 0.5 }} />
              <select className="input" value={t.type} onChange={(e) => patchTax(t.id, { type: e.target.value as TaxComponent["type"] })} style={{ width: 180, padding: "6px 9px", fontSize: "0.8125rem", opacity: t.enabled ? 1 : 0.5 }}>
                <option value="pctPrice">% sobre el precio</option>
                <option value="pctOnCommissions">% sobre las comisiones</option>
                <option value="fixed">$ fijo por venta</option>
              </select>
              {t.type === "pctPrice" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!t.commission} onChange={(e) => patchTax(t.id, { commission: e.target.checked })} style={{ accentColor: "var(--color-brand)" }} />
                  es comisión
                </label>
              )}
              <button onClick={() => setCfg((c) => ({ ...c, taxes: c.taxes.filter((x) => x.id !== t.id) }))} aria-label="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", marginLeft: "auto" }}>✕</button>
            </div>
          ))}
          <button onClick={() => setCfg((c) => ({ ...c, taxes: [...c.taxes, { id: `t${Date.now()}`, name: "", value: 0, type: "pctPrice", enabled: true }] }))}
            style={{ alignSelf: "flex-start", border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
            + Agregar variable
          </button>
        </div>
      </Collapsible>

      {/* ── Cuotas ── */}
      <Collapsible title={`Cuotas Mercado Pago · ${activePlans.length} ${activePlans.length === 1 ? "columna" : "columnas"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
            Coeficiente que te descuenta MP por absorber ese plan. La tabla muestra cuánto te queda limpio por franja.
          </p>
          {cfg.installments.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => setCfg((c) => ({ ...c, installments: c.installments.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x) }))} style={{ accentColor: "var(--color-brand)" }} />
              <input className="input" value={p.label} placeholder="3 cuotas" onChange={(e) => setCfg((c) => ({ ...c, installments: c.installments.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x) }))} style={{ width: 140, padding: "6px 9px", fontSize: "0.8125rem" }} />
              <input className="input" inputMode="decimal" value={p.coefPct} onChange={(e) => setCfg((c) => ({ ...c, installments: c.installments.map((x, xi) => xi === i ? { ...x, coefPct: parseFloat(e.target.value.replace(",", ".")) || 0 } : x) }))} style={{ width: 80, padding: "6px 9px", fontSize: "0.8125rem", textAlign: "right" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>%</span>
              <button onClick={() => setCfg((c) => ({ ...c, installments: c.installments.filter((_, xi) => xi !== i) }))} aria-label="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", marginLeft: "auto" }}>✕</button>
            </div>
          ))}
          <button onClick={() => setCfg((c) => ({ ...c, installments: [...c.installments, { label: `${(c.installments.length + 1) * 3} cuotas`, coefPct: 0, enabled: true }] }))}
            style={{ alignSelf: "flex-start", border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
            + Agregar plan
          </button>
        </div>
      </Collapsible>

      {/* ── Ajustes de la tabla ── */}
      <Collapsible title="Ajustes de la tabla">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label style={{ ...lbl, display: "flex", flexDirection: "column", gap: 5 }}>Ancho de franja (USD)
            <input className="input" inputMode="numeric" value={cfg.tierSize} onChange={(e) => patch({ tierSize: parseInt(e.target.value) || 5 })} style={{ width: 110 }} />
          </label>
          <label style={{ ...lbl, display: "flex", flexDirection: "column", gap: 5 }}>Última franja (USD)
            <input className="input" inputMode="numeric" value={cfg.maxUsd} onChange={(e) => patch({ maxUsd: parseInt(e.target.value) || 100 })} style={{ width: 110 }} />
          </label>
          <label style={{ ...lbl, display: "flex", flexDirection: "column", gap: 5 }}>Redondeo (múltiplo, hacia arriba)
            <select className="input" value={cfg.roundMultiple} onChange={(e) => patch({ roundMultiple: Number(e.target.value) })} style={{ width: 130 }}>
              <option value={500}>$500</option>
              <option value={1000}>$1.000</option>
            </select>
          </label>
          <label style={{ ...lbl, display: "flex", flexDirection: "column", gap: 5 }}>Detección de secundarias (el nombre contiene)
            <input className="input" value={cfg.secondaryMatch} onChange={(e) => patch({ secondaryMatch: e.target.value })} style={{ width: 170, fontFamily: "var(--font-mono), monospace" }} />
          </label>
        </div>
      </Collapsible>

      {/* ── Tabla de franjas ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--color-surface-2)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-subtle)" }}>
                <th style={th}>Franja USD</th>
                <th style={th}>Ganancia</th>
                <th style={th}>Precio lista</th>
                <th style={th}>Gan. secund.</th>
                <th style={th}>Precio secund.</th>
                {activePlans.map((p) => <th key={p.label} style={th}>{p.label}</th>)}
                <th style={th}>Productos</th>
              </tr>
            </thead>
            <tbody>
              {cfg.tiers.map((t) => {
                const calcP = computeTierPrice(t, "primary", cfg);
                const calcS = computeTierPrice(t, "secondary", cfg);
                const priceP = t.overridePrimary ?? calcP;
                const priceS = t.overrideSec ?? calcS;
                const st = summary?.perTier[t.maxUsd];
                return (
                  <tr key={t.maxUsd} style={{ borderTop: "1px solid var(--color-divider)" }}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{t.maxUsd - cfg.tierSize}–{t.maxUsd}</td>
                    <td style={td}><GainInput value={t.gain} onCommit={(v) => patchTier(t.maxUsd, { gain: v })} /></td>
                    <td style={td}>
                      <PriceCell calc={calcP} override={t.overridePrimary}
                        onCommit={(v) => patchTier(t.maxUsd, { overridePrimary: v != null && v !== calcP ? v : null })} />
                    </td>
                    <td style={td}><GainInput value={t.gainSec} onCommit={(v) => patchTier(t.maxUsd, { gainSec: v })} /></td>
                    <td style={td}>
                      <PriceCell calc={calcS} override={t.overrideSec}
                        onCommit={(v) => patchTier(t.maxUsd, { overrideSec: v != null && v !== calcS ? v : null })} />
                    </td>
                    {activePlans.map((p) => {
                      const net = installmentNet(priceP, p.coefPct, t.maxUsd * cfg.dollar, cfg);
                      const ok = net >= t.gain;
                      return (
                        <td key={p.label} style={{ ...td, whiteSpace: "nowrap" }} title={`Vendiendo a ${money(priceP)} y absorbiendo ${p.label}: te quedan ${money(net)} (objetivo ${money(t.gain)})`}>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: ok ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
                            {ok ? "✓" : "▼"} {money(net)}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ ...td, whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                      {!summary ? <span style={{ color: "var(--color-faint)" }}>…</span>
                        : !st ? <span style={{ color: "var(--color-faint)" }}>—</span>
                        : <>
                            <span style={{ color: "var(--color-muted)" }}>{st.products}</span>
                            {st.misaligned > 0 && <span style={{ color: "var(--color-warning)", fontWeight: 700 }}> · {st.misaligned} ⚠</span>}
                          </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Excluidos / sin posicionar ── */}
      {summary && (summary.unpositioned.length > 0 || summary.outOfRange.length > 0 || summary.inActiveCampaign.length > 0) && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {summary.unpositioned.length > 0 && (
            <div>
              <button onClick={() => setShowUnpositioned((v) => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-warning)", fontWeight: 600, fontSize: "0.75rem", padding: 0 }}>
                {summary.unpositioned.length} productos sin costo cargado (fuera de la tabla) {showUnpositioned ? "▾" : "▸"}
              </button>
              {showUnpositioned && (
                <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-divider)", borderRadius: 8, padding: "6px 10px" }}>
                  {summary.unpositioned.slice(0, 200).map((p) => <div key={p.id} style={{ padding: "2px 0" }}>{p.name}</div>)}
                  {summary.unpositioned.length > 200 && <div>… y {summary.unpositioned.length - 200} más</div>}
                </div>
              )}
            </div>
          )}
          {summary.outOfRange.length > 0 && <div style={{ color: "var(--color-warning)" }}>{summary.outOfRange.length} con costo mayor a la última franja (subí «Última franja»)</div>}
          {summary.inActiveCampaign.length > 0 && <div>{summary.inActiveCampaign.length} en campañas de precios activas — protegidos, no se pisan</div>}
        </div>
      )}

      {/* ── Footer de acciones ── */}
      <div style={{ position: "sticky", bottom: 0, background: "var(--color-bg)", borderTop: "1px solid var(--color-divider)", padding: "12px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>
          : applied ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>✓ {applied.changed} productos actualizados — subilos con «Subir cambios»</span>
          : <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
              {dirty ? "Tenés cambios sin guardar — la aplicación usa la config GUARDADA." : summary ? `${summary.toChange} productos quedarían actualizados al aplicar.` : "Calculando estado del catálogo…"}
            </span>}
        <button className="btn-secondary" onClick={save} disabled={saving || !dirty}>{saved ? "Guardada ✓" : saving ? "Guardando…" : "Guardar configuración"}</button>
        <button className="btn-primary" onClick={() => { setApplied(null); setConfirmOpen(true); }} disabled={!summary || summary.toChange === 0 || !!applying || dirty}
          title={dirty ? "Guardá la configuración primero" : undefined}>
          {applying ? `Aplicando… ${applying.done}/${applying.total}` : `Aplicar al catálogo${summary ? ` (${summary.toChange})` : ""}`}
        </button>
      </div>

      {/* ── Confirmación ── */}
      {confirmOpen && summary && (
        <div onClick={() => setConfirmOpen(false)} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="anim-modal card" style={{ maxWidth: 460, width: "100%", padding: 22 }}>
            <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 10 }}>Aplicar la tabla al catálogo</div>
            <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              <li><b style={{ color: "var(--color-ink)" }}>{summary.toChange}</b> productos van a cambiar de precio (base y/o promocional, con sus variantes).</li>
              {summary.inActiveCampaign.length > 0 && <li>{summary.inActiveCampaign.length} en campañas de precios activas quedan protegidos.</li>}
              {summary.unpositioned.length > 0 && <li>{summary.unpositioned.length} sin costo quedan afuera.</li>}
              <li>Todo queda staged: nada llega a Tienda Nube hasta «Subir cambios».</li>
            </ul>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={applyAll}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Auxiliares ───────────────────────────────────────── */

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-subtle)", transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.12s" }}><polyline points="6 9 12 15 18 9" /></svg>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)" }}>{title}</span>
      </button>
      {open && <div style={{ padding: "0 16px 16px" }}>{children}</div>}
    </div>
  );
}

/** Input de ganancia ARS con commit onBlur. */
function GainInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [d, setD] = useState(String(value || ""));
  useEffect(() => { setD(String(value || "")); }, [value]);
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-faint)", fontSize: "0.75rem" }}>$</span>
      <input className="input" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)}
        onBlur={() => onCommit(parseInt(d.replace(/\./g, "")) || 0)}
        style={{ width: 96, padding: "5px 8px 5px 18px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
    </div>
  );
}

/** Celda de precio de lista: muestra el calculado; editable → override (✎). */
function PriceCell({ calc, override, onCommit }: { calc: number; override: number | null; onCommit: (v: number | null) => void }) {
  const current = override ?? calc;
  const [d, setD] = useState(String(current || ""));
  useEffect(() => { setD(String(current || "")); }, [current]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-faint)", fontSize: "0.75rem" }}>$</span>
        <input className="input" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)}
          onBlur={() => { const v = parseInt(d.replace(/\./g, "")); onCommit(isNaN(v) || v <= 0 ? null : v); }}
          style={{ width: 104, padding: "5px 8px 5px 18px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, borderColor: override != null ? "var(--color-info)" : undefined }} />
      </div>
      {override != null && (
        <button onClick={() => onCommit(null)} title={`Pisado a mano (fórmula: ${money(calc)}) — clic para volver a la fórmula`}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-info)", fontSize: "0.8125rem", padding: 0 }}>✎</button>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-subtle)" };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontWeight: 700 };
const td: React.CSSProperties = { padding: "7px 12px" };
