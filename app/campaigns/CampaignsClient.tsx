"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Campaign } from "./page";
import { ItemsPanel } from "./CampaignExtras";
import CampaignWizard from "./CampaignWizard";

interface Props {
  campaigns: Campaign[];
  categories: string[];
  pendingCount: number;
}

type Analytics = {
  from: string; to: string; active: boolean;
  totalUnits: number; totalRevenue: number; withoutSales: number; productCount: number;
  products: { productId: number; name: string; imageUrl: string | null; campaignPrice: number; units: number; revenue: number }[];
} | null;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : null;

export default function CampaignsClient({ campaigns, categories, pendingCount }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<Campaign | null>(null);
  const [itemsFor, setItemsFor] = useState<number | null>(null);

  return (
    <div style={{ height: "100dvh", overflowY: "auto", padding: "48px 48px 80px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div className="anim-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 4px", lineHeight: 1.1 }}>
              Campañas
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
              Descuentos programados que se activan y terminan solos.
            </p>
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)} style={{ whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nueva campaña
          </button>
        </div>

        {/* Pending-sync hint */}
        {pendingCount > 0 && (
          <div className="anim-up" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", marginBottom: 24, borderRadius: "var(--radius-card)",
            background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)",
            boxShadow: "var(--shadow-card)",
          }}>
            <span style={{ fontSize: "0.875rem", color: "var(--color-warning)", fontWeight: 500 }}>
              ⚠ Hay {pendingCount} {pendingCount === 1 ? "cambio" : "cambios"} de precio sin sincronizar con Tienda Nube.
            </span>
            <Link href="/catalog" style={{ fontSize: "0.8125rem", color: "var(--color-warning)", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              Ir a sincronizar →
            </Link>
          </div>
        )}

        {/* Campaign list */}
        {campaigns.length === 0 ? (
          <div className="anim-up delay-1 card" style={{ padding: "56px 24px", textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: 10 }}>🎯</div>
            <p style={{ fontSize: "0.9375rem", color: "var(--color-ink)", fontWeight: 600, margin: "0 0 4px" }}>
              Todavía no hay campañas
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 18px" }}>
              Creá una con fechas y se activa y termina sola.
            </p>
            <button className="btn-primary" onClick={() => setCreating(true)}>Crear campaña</button>
          </div>
        ) : (
          <div className="anim-up delay-1" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {campaigns.map((c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                busy={busyId === c.id}
                onAnalytics={() => setAnalyticsFor(c)}
                onReview={() => setItemsFor(c.id)}
                onAction={async (action) => {
                  setBusyId(c.id);
                  try {
                    if (action === "delete") {
                      const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
                      if (!res.ok) { const d = await res.json(); alert(d.error || "Error"); }
                    } else {
                      const res = await fetch(`/api/campaigns/${c.id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action }),
                      });
                      if (!res.ok) { const d = await res.json(); alert(d.error || "Error"); }
                    }
                    router.refresh();
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <CampaignWizard
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh(); }}
        />
      )}

      {analyticsFor && (
        <AnalyticsPanel campaign={analyticsFor} onClose={() => setAnalyticsFor(null)} />
      )}

      {itemsFor != null && (
        <ItemsPanel
          campaignId={itemsFor}
          status={campaigns.find((c) => c.id === itemsFor)?.status || "draft"}
          categories={categories}
          onClose={() => setItemsFor(null)}
          onApplied={() => { setItemsFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CampaignRow({ campaign: c, busy, onAction, onAnalytics, onReview }: {
  campaign: Campaign; busy: boolean;
  onAction: (a: "apply" | "end" | "delete") => void;
  onAnalytics: () => void;
  onReview: () => void;
}) {
  const [hover, setHover] = useState(false);
  const scheduled = c.status === "draft" && c.startDate && new Date(c.startDate) > new Date();
  const discountLabel = c.discountType === "pct" ? `−${c.discountValue}%` : `−$${c.discountValue.toLocaleString("es-AR")}`;
  const scopeLabel = c.scope === "all" ? "Todo el catálogo" : c.scope === "category" ? `Categoría: ${c.scopeValue}` : `Etiqueta: ${c.scopeValue}`;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "20px 22px",
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        boxShadow: hover ? "var(--shadow-float)" : "var(--shadow-card)",
        transition: "box-shadow 0.16s",
      }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--color-brand-light)", color: "var(--color-brand)",
        fontWeight: 700, fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums",
      }}>
        {discountLabel}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.name}
          </span>
          {c.status === "active" && (
            <span className="pill pill-success"><span className="pill-dot" />Activa{c.endDate && ` · termina ${fmtDate(c.endDate)}`}</span>
          )}
          {scheduled && (
            <span className="pill pill-info"><span className="pill-dot" />Programada · empieza {fmtDate(c.startDate)}</span>
          )}
          {c.status === "draft" && !scheduled && (
            <span className="pill pill-neutral">Borrador</span>
          )}
          {c.status === "ended" && (
            <span className="pill pill-neutral">Terminada{c.endedAt && ` · ${fmtDate(c.endedAt)}`}</span>
          )}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>
          {scopeLabel}
          {c._count.items > 0 && ` · ${c._count.items} productos`}
          {c.addTag && ` · etiqueta "${c.addTag}"`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {(c.status === "active" || c.status === "ended") && (
          <button className="btn-secondary" onClick={onAnalytics} style={{ padding: "7px 14px", fontSize: "0.8125rem" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>
            Analíticas
          </button>
        )}
        {c.status === "draft" && (
          <>
            <button className="btn-primary" onClick={onReview} disabled={busy} style={{ padding: "7px 16px", fontSize: "0.8125rem" }}>
              Revisar precios
            </button>
            <button className="btn-secondary" onClick={() => onAction("delete")} disabled={busy} style={{ padding: "7px 14px", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
              Eliminar
            </button>
          </>
        )}
        {c.status === "active" && (
          <>
            <button className="btn-primary" onClick={onReview} disabled={busy} style={{ padding: "7px 16px", fontSize: "0.8125rem" }}>
              Editar productos
            </button>
            <button onClick={() => onAction("end")} disabled={busy} style={{
              padding: "7px 16px", borderRadius: "var(--radius-control)",
              border: "1px solid var(--color-danger)", background: "transparent",
              color: "var(--color-danger)", fontSize: "0.8125rem", fontWeight: 600,
              cursor: busy ? "default" : "pointer",
            }}>
              {busy ? "..." : "Terminar"}
            </button>
          </>
        )}
        {c.status === "ended" && (
          <button className="btn-secondary" onClick={() => onAction("delete")} disabled={busy} style={{ padding: "7px 14px", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

function AnalyticsPanel({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [data, setData] = useState<Analytics>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/campaigns/${campaign.id}/analytics`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Error");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [campaign.id]);

  return (
    <>
      <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.16)", zIndex: 40 }} />
      <div className="anim-panel" style={{
        position: "fixed", top: 14, right: 14, bottom: 14,
        width: 440, maxWidth: "calc(100vw - 28px)",
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-float)",
        display: "flex", flexDirection: "column", zIndex: 50, overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Analíticas · {campaign.name}</div>
            {data && (
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>
                {fmtDate(data.from)} → {data.active ? "en curso" : fmtDate(data.to)}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {error && <p style={{ fontSize: "0.875rem", color: "var(--color-danger)" }}>{error}</p>}
          {!data && !error && <p style={{ fontSize: "0.875rem", color: "var(--color-subtle)" }}>Cargando...</p>}
          {data && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Stat label="Unidades vendidas" value={data.totalUnits.toLocaleString("es-AR")} />
                <Stat label="Facturación" value={`$${data.totalRevenue.toLocaleString("es-AR")}`} />
                <Stat label="Productos en campaña" value={String(data.productCount)} />
                <Stat label="Sin ventas" value={String(data.withoutSales)} warn={data.withoutSales > 0} />
              </div>

              {/* Product ranking */}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", marginBottom: 10 }}>
                  Rendimiento por producto
                </div>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", overflow: "hidden" }}>
                  {data.products.slice(0, 30).map((p, i) => (
                    <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                      {p.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imageUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--color-surface-2)", flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: p.units > 0 ? "var(--color-ink)" : "var(--color-faint)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {p.units} u.
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", flexShrink: 0, width: 74, textAlign: "right" }}>
                        ${p.revenue.toLocaleString("es-AR")}
                      </span>
                    </div>
                  ))}
                  {data.products.length > 30 && (
                    <div style={{ padding: "8px 12px", fontSize: "0.75rem", color: "var(--color-subtle)", borderTop: "1px solid var(--color-divider)" }}>
                      ... y {data.products.length - 30} productos más
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-control)", background: "var(--color-surface-2)" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: warn ? "var(--color-warning)" : "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

