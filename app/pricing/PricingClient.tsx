"use client";
import { useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/components/useIsMobile";
import { notifyPendingChanged } from "@/lib/pendingEvent";
import CollectionPicker from "../catalog/CollectionPicker";
import {
  type PricingSettings, type PricingProfile, type TaxComponent, type Tier, type GainMode,
  finalizeSettings, makeProfile, makeTier, effectiveRate, computeTierPrice, transferPrice, installmentNet,
} from "@/lib/pricingCore";

/**
 * Ventana "Precios": perfiles por colección, franjas MANUALES (cada una con su
 * costo USD y ganancia $/%), precio de lista + precio por transferencia
 * (informativo, lista − % del perfil). El dólar es global. Una franja puede
 * apuntar a colecciones propias (excepción quirúrgica dentro del perfil).
 */

type TierStat = { products: number; misaligned: number };
type Summary = {
  perProfile: Record<string, { count: number; tiers: Record<string, TierStat> }>;
  toChange: number;
  changeIds: number[];
  unpositioned: { id: number; name: string }[];
  outOfRange: { id: number; name: string }[];
  inActiveCampaign: { id: number; name: string }[];
};

const money = (n: number) => `$${n.toLocaleString("es-AR")}`;
const BATCH = 150;

export default function PricingClient({ initialSettings }: { initialSettings: PricingSettings }) {
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState<PricingSettings>(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [activeId, setActiveId] = useState<string>(initialSettings.profiles[0]?.id ?? "general");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState<{ changed: number; skipped: number } | null>(null);
  const [showUnpositioned, setShowUnpositioned] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [scopedPickerFor, setScopedPickerFor] = useState<string | null>(null);

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const profile = settings.profiles.find((p) => p.id === activeId) ?? settings.profiles[0];
  const cfg = { ...profile, dollar: settings.dollar }; // dólar global inyectado
  const rate = effectiveRate(cfg.taxes);
  const activePlans = cfg.installments.filter((p) => p.enabled);
  const profStat = summary?.perProfile[profile.id];
  const generalTiers = cfg.tiers.filter((t) => t.collectionIds.length === 0);
  const scopedTiers = cfg.tiers.filter((t) => t.collectionIds.length > 0);

  const loadSummary = useCallback(() => {
    setSummary(null);
    fetch("/api/pricing/summary").then((r) => r.json()).then(setSummary).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  /* ── Mutadores del perfil activo ── */
  const updateProfile = (fn: (p: PricingProfile) => PricingProfile) =>
    setSettings((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === profile.id ? fn(p) : p)) }));
  const patchProfile = (partial: Partial<PricingProfile>) => updateProfile((p) => ({ ...p, ...partial }));
  const patchTier = (id: string, partial: Partial<Tier>) =>
    updateProfile((p) => ({ ...p, tiers: p.tiers.map((t) => (t.id === id ? { ...t, ...partial } : t)) }));
  const addTier = (scoped: boolean) => updateProfile((p) => ({ ...p, tiers: [...p.tiers, { ...makeTier(0), collectionIds: scoped ? [-1] : [] }] }));
  const removeTier = (id: string) => updateProfile((p) => ({ ...p, tiers: p.tiers.filter((t) => t.id !== id) }));
  const setTaxes = (fn: (t: TaxComponent[]) => TaxComponent[]) => updateProfile((p) => ({ ...p, taxes: fn(p.taxes) }));
  const setInstallments = (fn: (i: typeof profile.installments) => typeof profile.installments) => updateProfile((p) => ({ ...p, installments: fn(p.installments) }));

  /* ── CRUD de perfiles ── */
  function addProfile() {
    const np = makeProfile("Nuevo perfil");
    setSettings((s) => {
      const defIdx = s.profiles.findIndex((p) => p.isDefault);
      const at = defIdx === -1 ? s.profiles.length : defIdx;
      return { ...s, profiles: [...s.profiles.slice(0, at), np, ...s.profiles.slice(at)] };
    });
    setActiveId(np.id);
    setShowCollections(true);
  }
  function deleteProfile() {
    if (profile.isDefault) return;
    const nextId = settings.profiles.find((p) => p.id !== profile.id)?.id ?? "general";
    setSettings((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== profile.id) }));
    setActiveId(nextId);
  }
  function moveProfile(dir: -1 | 1) {
    setSettings((s) => {
      const i = s.profiles.findIndex((p) => p.id === profile.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.profiles.length || s.profiles[j].isDefault) return s;
      const profiles = [...s.profiles];
      [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
      return { ...s, profiles };
    });
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/pricing/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(finalizeSettings(settings)) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      setSettings(d); setSavedSettings(d);
      if (!d.profiles.some((p: PricingProfile) => p.id === activeId)) setActiveId(d.profiles[0]?.id);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      loadSummary();
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
        const res = await fetch("/api/pricing/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: ids.slice(i, i + BATCH) }) });
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

  /* ── Fila de franja (reutilizada por generales y scoped) ── */
  function TierRow({ t, scoped }: { t: Tier; scoped: boolean }) {
    const calc = computeTierPrice(t, cfg);
    const priceP = t.overridePrice ?? calc;
    const transfer = transferPrice(priceP, cfg);
    const st = profStat?.tiers[t.id];
    const hot = st && st.misaligned > 0;
    return (
      <tr style={{ borderTop: "1px solid var(--color-divider)", background: hot ? "var(--color-warning-bg)" : undefined }}>
        <td style={td}><CostInput value={t.costUsd} onCommit={(v) => patchTier(t.id, { costUsd: v })} /></td>
        <td style={td}><GainCell mode={t.gainMode} fixed={t.gain} pct={t.gainPct} onCommit={(patch) => patchTier(t.id, patch)} /></td>
        <td style={td}><PriceCell calc={calc} override={t.overridePrice} onCommit={(v) => patchTier(t.id, { overridePrice: v != null && v !== calc ? v : null })} /></td>
        <td style={{ ...td, whiteSpace: "nowrap", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }} title={`Lista − ${cfg.transferPct || 0}%`}>{money(transfer)}</td>
        {activePlans.map((p) => {
          const net = installmentNet(priceP, p.coefPct, t.costUsd * cfg.dollar, cfg);
          const target = t.gainMode === "pct" ? t.costUsd * cfg.dollar * ((t.gainPct || 0) / 100) : t.gain;
          const ok = net >= target;
          return (
            <td key={p.label} style={{ ...td, whiteSpace: "nowrap" }} title={`Absorbiendo ${p.label}: te quedan ${money(net)} (objetivo ${money(target)})`}>
              <span style={{ fontVariantNumeric: "tabular-nums", color: ok ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>{ok ? "✓" : "▼"} {money(net)}</span>
            </td>
          );
        })}
        <td style={{ ...td, whiteSpace: "nowrap", fontSize: "0.75rem" }}>
          {!summary ? <span style={{ color: "var(--color-subtle)" }}>…</span>
            : !st ? <span style={{ color: "var(--color-subtle)" }}>—</span>
            : <><span style={{ color: "var(--color-muted)" }}>{st.products}</span>{st.misaligned > 0 && <span style={{ color: "var(--color-warning)", fontWeight: 700 }}> · {st.misaligned} ⚠</span>}</>}
        </td>
        <td style={{ ...td, textAlign: "right" }}>
          <button onClick={() => removeTier(t.id)} aria-label="Quitar franja" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)" }}>✕</button>
        </td>
      </tr>
    );
  }

  const tableHead = (
    <tr style={{ background: "var(--color-surface-2)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-subtle)" }}>
      <th style={th}>Costo USD</th>
      <th style={th}>Ganancia</th>
      <th style={th}>Precio lista</th>
      <th style={th}>Transferencia</th>
      {activePlans.map((p) => <th key={p.label} style={th}>{p.label}</th>)}
      <th style={th}>Productos</th>
      <th style={th} />
    </tr>
  );
  const colCount = 6 + activePlans.length;

  return (
    <div style={{ padding: isMobile ? "20px 16px 90px" : "28px 32px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 3px", letterSpacing: "-0.02em" }}>Precios</h1>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 22px" }}>
        Perfiles por colección con franjas manuales. Costo USD × dólar + ganancia + impuestos = precio de lista. La transferencia (lista − %) es informativa.
      </p>

      {/* ── Dólar global ── */}
      <div className="card anim-up" style={{ padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={lbl}>Dólar (global)</div>
          <div style={{ position: "relative", marginTop: 5 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", fontWeight: 600 }}>$</span>
            <input className="input" inputMode="decimal" value={settings.dollar || ""} placeholder="1450"
              onChange={(e) => setSettings((s) => ({ ...s, dollar: parseFloat(e.target.value.replace(",", ".")) || 0 }))}
              style={{ paddingLeft: 26, width: 140, fontSize: "1.125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 180, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
          {savedSettings.dollarUpdatedAt ? `Guardado el ${new Date(savedSettings.dollarUpdatedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} ${new Date(savedSettings.dollarUpdatedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Cargá la cotización con la que comprás"}
          {" — "}lo comparten todos los perfiles; nada toca el catálogo hasta «Aplicar».
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={lbl}>Descuento efectivo · {profile.name}</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: rate >= 1 ? "var(--color-danger)" : "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{(rate * 100).toFixed(2)}%</div>
        </div>
      </div>

      {/* ── Selector de perfiles ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {settings.profiles.map((p) => {
          const on = p.id === profile.id;
          const n = summary?.perProfile[p.id]?.count;
          return (
            <button key={p.id} onClick={() => { setActiveId(p.id); setShowCollections(false); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: "var(--radius-pill)", border: `1.5px solid ${on ? "var(--color-brand)" : "var(--color-border)"}`, background: on ? "var(--color-brand-light)" : "var(--color-surface)", color: on ? "var(--color-brand)" : "var(--color-muted)", cursor: "pointer", fontSize: "0.8125rem", fontWeight: on ? 700 : 500 }}>
              {p.name}{p.isDefault && <span style={{ fontSize: "0.625rem", opacity: 0.7 }}>(general)</span>}
              {n != null && <span style={{ fontSize: "0.6875rem", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>· {n}</span>}
            </button>
          );
        })}
        <button onClick={addProfile} style={{ padding: "7px 11px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--color-border)", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: "0.8125rem" }}>+ Perfil</button>
      </div>

      {/* ── Cabecera del perfil activo ── */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input className="input" value={profile.name} onChange={(e) => patchProfile({ name: e.target.value })} disabled={profile.isDefault} style={{ width: 200, fontWeight: 600 }} title={profile.isDefault ? "El perfil General no se renombra" : undefined} />
          <label style={{ display: "flex", flexDirection: "column", gap: 3, ...lbl }}>Descuento transferencia
            <div style={{ position: "relative", marginTop: 2 }}>
              <input className="input" inputMode="decimal" value={profile.transferPct || ""} placeholder="0" onChange={(e) => patchProfile({ transferPct: parseFloat(e.target.value.replace(",", ".")) || 0 })} style={{ width: 90, paddingRight: 22, textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "var(--color-subtle)", fontSize: "0.8125rem" }}>%</span>
            </div>
          </label>
          {!profile.isDefault && (
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignSelf: "flex-end" }}>
              <button className="btn-secondary" onClick={() => moveProfile(-1)} title="Subir prioridad" style={{ padding: "6px 9px" }}>↑</button>
              <button className="btn-secondary" onClick={() => moveProfile(1)} title="Bajar prioridad" style={{ padding: "6px 9px" }}>↓</button>
              <button className="btn-secondary" onClick={deleteProfile} style={{ color: "var(--color-danger)", padding: "6px 11px" }}>Eliminar perfil</button>
            </div>
          )}
        </div>
        {profile.isDefault ? (
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>Catch-all: rige los productos que no caen en ningún otro perfil. No tiene colecciones.</div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" }}>Colecciones del perfil <span style={{ fontWeight: 400, color: "var(--color-subtle)" }}>· {profile.collectionIds.length}</span></span>
              <button onClick={() => setShowCollections((v) => !v)} style={{ border: "none", background: "transparent", color: "var(--color-brand)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>{showCollections ? "Listo" : "Editar"}</button>
            </div>
            {showCollections ? (
              <div style={{ marginTop: 6 }}>
                <CollectionPicker selectedIds={new Set(profile.collectionIds)} onToggle={(id) => patchProfile({ collectionIds: profile.collectionIds.includes(id) ? profile.collectionIds.filter((c) => c !== id) : [...profile.collectionIds, id] })} />
              </div>
            ) : (
              <div style={{ fontSize: "0.72rem", color: "var(--color-subtle)", marginTop: 3 }}>{profile.collectionIds.length === 0 ? "Sin colecciones — este perfil no rige a ningún producto todavía." : "Si un producto cae en varios perfiles, gana el de más arriba."}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Pila de impuestos ── */}
      <Collapsible title={`Impuestos y comisiones · ${cfg.taxes.filter((t) => t.enabled).length} activos`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cfg.taxes.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <input type="checkbox" checked={t.enabled} onChange={(e) => setTaxes((tx) => tx.map((x) => x.id === t.id ? { ...x, enabled: e.target.checked } : x))} style={{ accentColor: "var(--color-brand)" }} title="Activo" />
              <input className="input" value={t.name} onChange={(e) => setTaxes((tx) => tx.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))} style={{ width: 170, padding: "6px 9px", fontSize: "0.8125rem", opacity: t.enabled ? 1 : 0.5 }} />
              <input className="input" inputMode="decimal" value={t.value} onChange={(e) => setTaxes((tx) => tx.map((x) => x.id === t.id ? { ...x, value: parseFloat(e.target.value.replace(",", ".")) || 0 } : x))} style={{ width: 80, padding: "6px 9px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: t.enabled ? 1 : 0.5 }} />
              <select className="input" value={t.type} onChange={(e) => setTaxes((tx) => tx.map((x) => x.id === t.id ? { ...x, type: e.target.value as TaxComponent["type"] } : x))} style={{ width: 180, padding: "6px 9px", fontSize: "0.8125rem", opacity: t.enabled ? 1 : 0.5 }}>
                <option value="pctPrice">% sobre el precio</option>
                <option value="pctOnCommissions">% sobre las comisiones</option>
                <option value="fixed">$ fijo por venta</option>
              </select>
              {t.type === "pctPrice" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!t.commission} onChange={(e) => setTaxes((tx) => tx.map((x) => x.id === t.id ? { ...x, commission: e.target.checked } : x))} style={{ accentColor: "var(--color-brand)" }} />es comisión
                </label>
              )}
              <button onClick={() => setTaxes((tx) => tx.filter((x) => x.id !== t.id))} aria-label="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", marginLeft: "auto" }}>✕</button>
            </div>
          ))}
          <button onClick={() => setTaxes((tx) => [...tx, { id: `t${Date.now()}`, name: "", value: 0, type: "pctPrice", enabled: true }])} style={{ alignSelf: "flex-start", border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>+ Agregar variable</button>
        </div>
      </Collapsible>

      {/* ── Cuotas ── */}
      <Collapsible title={`Cuotas Mercado Pago · ${activePlans.length} ${activePlans.length === 1 ? "columna" : "columnas"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-subtle)" }}>Coeficiente que te descuenta MP por absorber ese plan. La tabla muestra cuánto te queda limpio por franja.</p>
          {cfg.installments.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => setInstallments((arr) => arr.map((x, xi) => xi === i ? { ...x, enabled: e.target.checked } : x))} style={{ accentColor: "var(--color-brand)" }} />
              <input className="input" value={p.label} placeholder="3 cuotas" onChange={(e) => setInstallments((arr) => arr.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))} style={{ width: 140, padding: "6px 9px", fontSize: "0.8125rem" }} />
              <input className="input" inputMode="decimal" value={p.coefPct} onChange={(e) => setInstallments((arr) => arr.map((x, xi) => xi === i ? { ...x, coefPct: parseFloat(e.target.value.replace(",", ".")) || 0 } : x))} style={{ width: 80, padding: "6px 9px", fontSize: "0.8125rem", textAlign: "right" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>%</span>
              <button onClick={() => setInstallments((arr) => arr.filter((_, xi) => xi !== i))} aria-label="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", marginLeft: "auto" }}>✕</button>
            </div>
          ))}
          <button onClick={() => setInstallments((arr) => [...arr, { label: `${(arr.length + 1) * 3} cuotas`, coefPct: 0, enabled: true }])} style={{ alignSelf: "flex-start", border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>+ Agregar plan</button>
        </div>
      </Collapsible>

      {/* ── Ajustes de la tabla ── */}
      <Collapsible title="Ajustes de la tabla">
        <label style={{ ...lbl, display: "flex", flexDirection: "column", gap: 5 }}>Redondeo (múltiplo, hacia arriba)
          <select className="input" value={cfg.roundMultiple} onChange={(e) => patchProfile({ roundMultiple: Number(e.target.value) })} style={{ width: 130 }}>
            <option value={500}>$500</option>
            <option value={1000}>$1.000</option>
          </select>
        </label>
      </Collapsible>

      {/* ── Tabla de franjas generales ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-divider)", fontSize: "0.75rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Franjas del perfil</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 720 }}>
            <thead>{tableHead}</thead>
            <tbody>
              {generalTiers.length === 0 ? (
                <tr><td colSpan={colCount} style={{ ...td, textAlign: "center", color: "var(--color-subtle)", padding: 16 }}>Sin franjas. Agregá una para empezar a precificar este perfil.</td></tr>
              ) : generalTiers.map((t) => <TierRow key={t.id} t={t} scoped={false} />)}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 10 }}>
          <button onClick={() => addTier(false)} style={{ border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "6px 12px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>+ Franja</button>
        </div>
      </div>

      {/* ── Franjas por colección (quirúrgicas) ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ padding: "10px 14px", borderBottom: scopedTiers.length ? "1px solid var(--color-divider)" : "none", fontSize: "0.75rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Franjas por colección <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· excepciones para colecciones puntuales dentro del perfil</span>
        </div>
        {scopedTiers.map((t) => (
          <div key={t.id} style={{ borderTop: "1px solid var(--color-divider)", padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <button onClick={() => setScopedPickerFor(scopedPickerFor === t.id ? null : t.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-brand)", fontSize: "0.75rem", fontWeight: 600 }}>
                {t.collectionIds.filter((c) => c > 0).length} {t.collectionIds.filter((c) => c > 0).length === 1 ? "colección" : "colecciones"} — {scopedPickerFor === t.id ? "listo" : "editar"}
              </button>
            </div>
            {scopedPickerFor === t.id && (
              <div style={{ marginBottom: 10 }}>
                <CollectionPicker selectedIds={new Set(t.collectionIds.filter((c) => c > 0))} onToggle={(id) => {
                  const cur = t.collectionIds.filter((c) => c > 0);
                  const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
                  // Mantener el centinela -1 para que la franja siga siendo "por colección" aunque quede sin colecciones.
                  patchTier(t.id, { collectionIds: [-1, ...next] });
                }} />
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", minWidth: 720 }}>
                <thead>{tableHead}</thead>
                <tbody><TierRow t={t} scoped /></tbody>
              </table>
            </div>
          </div>
        ))}
        <div style={{ padding: 10, borderTop: scopedTiers.length ? "1px solid var(--color-divider)" : "none" }}>
          <button onClick={() => addTier(true)} style={{ border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "6px 12px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>+ Franja por colección</button>
        </div>
      </div>

      {/* ── Excluidos / sin posicionar ── */}
      {summary && (summary.unpositioned.length > 0 || summary.outOfRange.length > 0 || summary.inActiveCampaign.length > 0) && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {summary.unpositioned.length > 0 && (
            <div>
              <button onClick={() => setShowUnpositioned((v) => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-warning)", fontWeight: 600, fontSize: "0.75rem", padding: 0 }}>{summary.unpositioned.length} productos sin costo cargado (fuera de la tabla) {showUnpositioned ? "▾" : "▸"}</button>
              {showUnpositioned && (
                <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-divider)", borderRadius: 8, padding: "6px 10px" }}>
                  {summary.unpositioned.slice(0, 200).map((p) => <div key={p.id} style={{ padding: "2px 0" }}>{p.name}</div>)}
                  {summary.unpositioned.length > 200 && <div>… y {summary.unpositioned.length - 200} más</div>}
                </div>
              )}
            </div>
          )}
          {summary.outOfRange.length > 0 && <div style={{ color: "var(--color-warning)" }}>{summary.outOfRange.length} con costo mayor a la última franja de su perfil</div>}
          {summary.inActiveCampaign.length > 0 && <div>{summary.inActiveCampaign.length} en campañas de precios activas — protegidos, no se pisan</div>}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ position: "sticky", bottom: 0, background: "var(--color-bg)", borderTop: "1px solid var(--color-divider)", padding: "12px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>
          : applied ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>✓ {applied.changed} productos actualizados — subilos con «Subir cambios»</span>
          : <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>{dirty ? "Tenés cambios sin guardar — la aplicación usa la config GUARDADA." : summary ? `${summary.toChange} productos quedarían actualizados al aplicar (todos los perfiles).` : "Calculando…"}</span>}
        <button className="btn-secondary" onClick={save} disabled={saving || !dirty}>{saved ? "Guardada ✓" : saving ? "Guardando…" : "Guardar configuración"}</button>
        <button className="btn-primary" onClick={() => { setApplied(null); setConfirmOpen(true); }} disabled={!summary || summary.toChange === 0 || !!applying || dirty} title={dirty ? "Guardá la configuración primero" : undefined}>
          {applying ? `Aplicando… ${applying.done}/${applying.total}` : `Aplicar al catálogo${summary ? ` (${summary.toChange})` : ""}`}
        </button>
      </div>

      {/* ── Confirmación ── */}
      {confirmOpen && summary && (
        <div onClick={() => setConfirmOpen(false)} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="anim-modal card" style={{ maxWidth: 460, width: "100%", padding: 22 }}>
            <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 10 }}>Aplicar al catálogo</div>
            <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              <li><b style={{ color: "var(--color-ink)" }}>{summary.toChange}</b> productos van a cambiar de precio, <b>cada uno con la tabla de su perfil</b>.</li>
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

/** Costo USD de la franja (commit onBlur). */
function CostInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [d, setD] = useState(String(value || ""));
  useEffect(() => { setD(String(value || "")); }, [value]);
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-subtle)", fontSize: "0.6875rem" }}>US$</span>
      <input className="input" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} onBlur={() => onCommit(parseFloat(d.replace(",", ".")) || 0)}
        style={{ width: 86, padding: "5px 8px 5px 32px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }} />
    </div>
  );
}

/** Celda de ganancia con toggle $ (ARS fijo) / % (sobre el costo). */
function GainCell({ mode, fixed, pct, onCommit }: { mode: GainMode; fixed: number; pct: number; onCommit: (patch: { gainMode: GainMode; gain: number; gainPct: number }) => void }) {
  const isPct = mode === "pct";
  const [d, setD] = useState(String((isPct ? pct : fixed) || ""));
  useEffect(() => { setD(String((isPct ? pct : fixed) || "")); }, [isPct, fixed, pct]);
  const commit = () => {
    const n = parseFloat(d.replace(/\./g, "").replace(",", ".")) || 0;
    onCommit(isPct ? { gainMode: "pct", gain: fixed, gainPct: n } : { gainMode: "fixed", gain: n, gainPct: pct });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button onClick={() => onCommit({ gainMode: isPct ? "fixed" : "pct", gain: fixed, gainPct: pct })} title={isPct ? "% sobre el costo — clic para $ fijo" : "$ fijo — clic para % sobre el costo"} style={{ width: 22, height: 26, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-2)", cursor: "pointer", fontWeight: 700, fontSize: "0.8125rem", color: "var(--color-brand)", flexShrink: 0 }}>{isPct ? "%" : "$"}</button>
      <input className="input" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} onBlur={commit} style={{ width: 78, padding: "5px 8px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
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
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-subtle)", fontSize: "0.75rem" }}>$</span>
        <input className="input" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} onBlur={() => { const v = parseInt(d.replace(/\./g, "")); onCommit(isNaN(v) || v <= 0 ? null : v); }}
          style={{ width: 104, padding: "5px 8px 5px 18px", fontSize: "0.8125rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, borderColor: override != null ? "var(--color-info)" : undefined }} />
      </div>
      {override != null && (
        <button onClick={() => onCommit(null)} title={`Pisado a mano (fórmula: ${money(calc)}) — clic para volver a la fórmula`} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-info)", fontSize: "0.8125rem", padding: 0 }}>✎</button>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-subtle)" };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontWeight: 700 };
const td: React.CSSProperties = { padding: "7px 12px" };
