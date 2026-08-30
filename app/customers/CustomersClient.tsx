"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { CustomerRow } from "./page";
import SalesSyncButton from "@/components/SalesSyncButton";
import { SEGMENTS, SEGMENT_LABEL, SEGMENT_TONE, type Segment, type SegmentConfig } from "@/lib/customerSegments";

interface Props {
  customers: CustomerRow[];
  total: number;
  page: number;
  totalPages: number;
  currentQ: string;
  onlyDups: boolean;
  dupTotal: number;
  currentSort: string;
  currentSegment: string;
  segmentCounts: Record<Segment, number>;
  segmentConfig: SegmentConfig;
}

const SORT_OPTS: { v: string; label: string }[] = [
  { v: "name", label: "Nombre A → Z" },
  { v: "ltv", label: "Mayor gasto (LTV)" },
  { v: "recent", label: "Última compra" },
  { v: "frequency", label: "Más compras" },
];

/** Fecha relativa corta para "última compra". */
function relDate(iso: string | null): string {
  if (!iso) return "sin compras";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} d`;
  if (days < 365) return `hace ${Math.floor(days / 30)} m`;
  return `hace ${Math.floor(days / 365)} a`;
}

type Detail = {
  products: { name: string; qty: number; spent: number; lastDate: string }[];
  orders: { id: number; number: number | null; total: number; status: string; orderedAt: string }[];
};

// Soft avatar tints (bg / ink), chosen deterministically per customer.
const TINTS: [string, string][] = [
  ["#EFF6FF", "#2563EB"], ["#F0FDF4", "#16A34A"], ["#FEF3F2", "#DC2626"],
  ["#FFF7ED", "#EA580C"], ["#FAF5FF", "#9333EA"], ["#F0FDFA", "#0D9488"],
  ["#FEF2F8", "#DB2777"], ["#FEFCE8", "#CA8A04"],
];
function tintFor(s: string): [string, string] {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CustomersClient({ customers, total, page, totalPages, currentQ, onlyDups, dupTotal, currentSort, currentSegment, segmentCounts, segmentConfig }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQ, setLocalQ] = useState(currentQ);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail | "loading">>({});
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfg, setCfg] = useState<SegmentConfig>(segmentConfig);
  const [savingCfg, setSavingCfg] = useState(false);

  async function saveCfg() {
    setSavingCfg(true);
    try {
      await fetch("/api/customer-segments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      setCfgOpen(false);
      router.refresh(); // recalcula segmentos y conteos con los nuevos umbrales
    } finally { setSavingCfg(false); }
  }

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }
  function pageUrl(n: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(n));
    return `${pathname}?${p.toString()}`;
  }

  async function toggle(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!details[id]) {
      setDetails((d) => ({ ...d, [id]: "loading" }));
      const res = await fetch(`/api/customers/${id}`);
      const json = await res.json();
      setDetails((d) => ({ ...d, [id]: json }));
    }
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 18px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-divider)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: "0 0 3px", letterSpacing: "-0.03em" }}>Clientes</h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString("es-AR")} {total === 1 ? "cliente" : "clientes"}
              {dupTotal > 0 && <span style={{ color: "var(--color-warning)" }}> · {dupTotal} posibles duplicados</span>}
            </p>
          </div>
          <SalesSyncButton />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              className="input"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setParam("q", localQ); }}
              onBlur={() => { if (localQ !== currentQ) setParam("q", localQ); }}
              placeholder="Buscar cliente o email..."
              style={{ width: "100%", paddingLeft: 32 }}
            />
          </div>
          <button
            onClick={() => setParam("dups", onlyDups ? "" : "1")}
            className="pill"
            style={{
              cursor: "pointer", padding: "8px 13px", fontSize: "0.8125rem", fontWeight: 600, border: "1px solid transparent",
              background: onlyDups ? "var(--color-warning-bg)" : "var(--color-surface-2)",
              color: onlyDups ? "var(--color-warning)" : "var(--color-muted)",
              borderColor: onlyDups ? "var(--color-warning)" : "transparent",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            Solo duplicados
          </button>
          <select value={currentSort} onChange={(e) => setParam("sort", e.target.value === "name" ? "" : e.target.value)}
            style={{ marginLeft: "auto", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.8125rem", color: "var(--color-ink)", cursor: "pointer" }}>
            {SORT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>

        {/* Chips de segmento (RFM) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => setParam("segment", "")} style={segChip(currentSegment === "", null)}>Todos</button>
          {SEGMENTS.map((s) => {
            const on = currentSegment === s;
            const tone = SEGMENT_TONE[s];
            return (
              <button key={s} onClick={() => setParam("segment", on ? "" : s)} style={segChip(on, tone)}>
                {SEGMENT_LABEL[s]}
                <span style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{(segmentCounts[s] ?? 0).toLocaleString("es-AR")}</span>
              </button>
            );
          })}
          <button onClick={() => { setCfg(segmentConfig); setCfgOpen((v) => !v); }} title="Ajustar umbrales de segmentación"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--radius-pill)", border: "1px solid var(--color-border)", background: "var(--color-surface)", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
            Umbrales
          </button>
        </div>

        {/* Editor de umbrales de segmentación */}
        {cfgOpen && (
          <div style={{ marginTop: 10, padding: "14px 16px", borderRadius: "var(--radius-control)", border: "1px solid var(--color-border)", background: "var(--color-surface-2)", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <CfgField label="Dormido a los (días)" value={cfg.dormantDays} min={1} onChange={(v) => setCfg((c) => ({ ...c, dormantDays: v }))} />
            <CfgField label="VIP: gasto ≥ ($)" value={cfg.vipMinSpent} min={0} step={10000} onChange={(v) => setCfg((c) => ({ ...c, vipMinSpent: v }))} />
            <CfgField label="VIP: o compras ≥" value={cfg.vipMinOrders} min={1} onChange={(v) => setCfg((c) => ({ ...c, vipMinOrders: v }))} />
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button className="btn-secondary" onClick={() => setCfgOpen(false)} disabled={savingCfg}>Cancelar</button>
              <button className="btn-primary" onClick={saveCfg} disabled={savingCfg}>{savingCfg ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "22px 24px 80px" }}>
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>
          {customers.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--color-muted)", fontSize: "0.875rem" }}>Sin clientes para este filtro</div>
          ) : customers.map((c, i) => {
            const d = details[c.id];
            const open = expanded === c.id;
            const [bg, ink] = tintFor(c.name);
            const secondary = [c.email, c.identification ? `DNI ${c.identification}` : null, [c.city, c.province].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ");
            return (
              <div key={c.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-divider)" }}>
                <div onClick={() => toggle(c.id)} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 18px", cursor: "pointer", background: open ? "var(--color-surface-2)" : "transparent", transition: "background 0.12s" }}
                  onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--color-surface-2)"; }}
                  onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}>
                  <span aria-hidden style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: bg, color: ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {initials(c.name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      {c.customerType === "business" && <span className="pill pill-info" style={{ fontSize: "0.625rem", fontWeight: 700, padding: "2px 7px", flexShrink: 0 }}>EMPRESA</span>}
                      {c.strongDuplicate
                        ? <span className="pill pill-danger" style={{ fontSize: "0.625rem", fontWeight: 700, padding: "2px 7px", flexShrink: 0 }}>MISMO DNI</span>
                        : c.isDuplicate && <span className="pill pill-warning" style={{ fontSize: "0.625rem", fontWeight: 700, padding: "2px 7px", flexShrink: 0 }}>POSIBLE DUPLICADO</span>}
                      {c.segment !== "sin_compras" && (
                        <span style={{ fontSize: "0.625rem", fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius-pill)", flexShrink: 0, letterSpacing: "0.02em", background: SEGMENT_TONE[c.segment].bg, color: SEGMENT_TONE[c.segment].fg }}>{SEGMENT_LABEL[c.segment].toUpperCase()}</span>
                      )}
                    </div>
                    {(secondary || c.phoneE164) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, minWidth: 0 }}>
                        {secondary && <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary}</span>}
                        {c.phoneE164 && (
                          <a
                            href={`https://wa.me/${c.phoneE164.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`WhatsApp ${c.phone ?? ""}`.trim()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: "0.6875rem", fontWeight: 600, color: "#25D366", textDecoration: "none" }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.5 14.4c-.3-.15-1.7-.85-2-.95-.26-.1-.45-.15-.64.15-.19.29-.74.94-.9 1.13-.17.19-.33.21-.62.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.73-1.63-2.02-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.08-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36s-1 .98-1 2.38 1.02 2.76 1.17 2.95c.15.19 2.02 3.08 4.9 4.32.68.29 1.22.47 1.63.6.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34zM12 2a10 10 0 0 0-8.6 15.05L2 22l5.05-1.32A10 10 0 1 0 12 2z"/></svg>
                            WhatsApp
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>${c.totalSpent.toLocaleString("es-AR")}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{c.orderCount} {c.orderCount === 1 ? "compra" : "compras"}</div>
                    {c.orderCount > 0 && <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{relDate(c.lastOrderAt)}</div>}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9" /></svg>
                </div>

                {open && (
                  <div style={{ padding: "2px 18px 18px 69px", background: "var(--color-surface-2)" }}>
                    {d === "loading" || !d ? (
                      <div style={{ padding: "14px 0", fontSize: "0.8125rem", color: "var(--color-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="anim-spin"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
                        Cargando…
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: d.orders.length > 0 ? "1.4fr 1fr" : "1fr", gap: 12, alignItems: "start" }}>
                        {/* Productos comprados */}
                        <DetailCard title={`Productos comprados (${d.products.length})`}>
                          {d.products.length === 0 ? (
                            <Empty>Sin productos registrados</Empty>
                          ) : d.products.slice(0, 8).map((p, j) => (
                            <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: j > 0 ? "1px solid var(--color-divider)" : "none", fontSize: "0.8125rem" }}>
                              <span className="pill pill-neutral" style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "1px 7px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{p.qty}×</span>
                              <span style={{ flex: 1, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                              <span style={{ fontWeight: 600, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", flexShrink: 0, textAlign: "right" }}>${Math.round(p.spent).toLocaleString("es-AR")}</span>
                            </div>
                          ))}
                        </DetailCard>

                        {/* Últimas compras */}
                        {d.orders.length > 0 && (
                          <DetailCard title={`Últimas compras (${d.orders.length})`}>
                            {d.orders.slice(0, 6).map((o) => (
                              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--color-divider)", fontSize: "0.8125rem" }}>
                                <span style={{ color: "var(--color-muted)", fontWeight: 500, flexShrink: 0 }}>{o.number ? `#${o.number}` : "—"}</span>
                                <StatusDot status={o.status} />
                                <span style={{ flex: 1, color: "var(--color-subtle)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(o.orderedAt)}</span>
                                <span style={{ fontWeight: 600, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>${Math.round(o.total).toLocaleString("es-AR")}</span>
                              </div>
                            ))}
                          </DetailCard>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 18 }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>Página {page} de {totalPages}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {page > 1 && <a href={pageUrl(page - 1)} className="btn-secondary" style={{ textDecoration: "none", padding: "6px 12px", fontSize: "0.8125rem" }}>← Anterior</a>}
              {page < totalPages && <a href={pageUrl(page + 1)} className="btn-secondary" style={{ textDecoration: "none", padding: "6px 12px", fontSize: "0.8125rem" }}>Siguiente →</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CfgField({ label, value, min, step, onChange }: { label: string; value: number; min: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-muted)" }}>
      {label}
      <input type="number" className="input" value={value} min={min} step={step ?? 1}
        onChange={(e) => { const n = Number(e.target.value); onChange(Number.isFinite(n) ? Math.max(min, n) : min); }}
        style={{ width: 130, fontVariantNumeric: "tabular-nums", background: "var(--color-surface)" }} />
    </label>
  );
}

function segChip(active: boolean, tone: { fg: string; bg: string } | null): React.CSSProperties {
  return {
    cursor: "pointer", padding: "5px 11px", borderRadius: "var(--radius-pill)", fontSize: "0.75rem", fontWeight: 600,
    border: "1px solid " + (active ? (tone?.fg ?? "var(--color-brand)") : "var(--color-border)"),
    background: active ? (tone?.bg ?? "var(--color-brand-light)") : "var(--color-surface)",
    color: active ? (tone?.fg ?? "var(--color-brand)") : "var(--color-muted)",
  };
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", overflow: "hidden", background: "var(--color-surface)" }}>
      <div style={{ padding: "8px 12px", fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", borderTop: "1px solid var(--color-divider)", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>{children}</div>;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "closed" ? "var(--color-success)" : status === "cancelled" ? "var(--color-danger)" : "var(--color-warning)";
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" });
}
