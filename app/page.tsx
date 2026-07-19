import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import Countdown from "./Countdown";
import OrderTickets from "./OrderTickets";

export const dynamic = "force-dynamic";

const widgetH2: React.CSSProperties = { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: 0 };
const widgetLink: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--color-brand)", textDecoration: "none", fontWeight: 600 };
const CHANGELOG_LABEL: Record<string, string> = { name: "Nombre", price: "Precio", promotionalPrice: "Precio promocional", published: "Visibilidad", tags: "Etiquetas", categories: "Colecciones", sku: "SKU", stock: "Stock" };
function relTime(iso: Date | string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default async function HomePage() {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 60);

  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // All seven product tallies in ONE pass over the table. As separate counts
  // this page scanned Product seven times per load — with force-dynamic and the
  // pull-on-navigation pattern, that was a major driver of the Turso read quota.
  // DateTimes are stored as ISO text with a +00:00 suffix, so the boundary is
  // bound in that exact format for a correct lexicographic comparison.
  const staleIso = staleDate.toISOString().replace("Z", "+00:00");
  const [productTallies, ordersCount, activeCampaigns, upcomingCampaigns, recentActivity, mtd, lastMonthAgg] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, number | bigint>>>`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE syncStatus = 'modified')                       AS modified,
        COUNT(*) FILTER (WHERE syncStatus = 'error')                          AS errors,
        COUNT(*) FILTER (WHERE imageUrl IS NULL)                              AS noImage,
        COUNT(*) FILTER (WHERE categoryName IS NULL)                          AS noCategory,
        COUNT(*) FILTER (WHERE stock <= 0 AND infiniteStock = 0)              AS noStock,
        COUNT(*) FILTER (WHERE (stock > 0 OR infiniteStock = 1)
                           AND (lastSoldAt IS NULL OR lastSoldAt < ${staleIso})) AS stale
      FROM Product`,
    prisma.order.count(),
    prisma.campaign.findMany({ where: { status: "active" }, orderBy: { endDate: "asc" }, select: { id: true, name: true, endDate: true, _count: { select: { items: true } } }, take: 5 }),
    prisma.campaign.findMany({ where: { status: "draft", startDate: { gt: now } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, startDate: true }, take: 5 }),
    prisma.changelog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { product: { select: { name: true, imageUrl: true } } } }),
    prisma.order.aggregate({ where: { status: { not: "cancelled" }, orderedAt: { gte: startThisMonth } }, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { status: { not: "cancelled" }, orderedAt: { gte: startLastMonth, lt: startThisMonth } }, _sum: { total: true }, _count: true }),
  ]);
  const t = productTallies[0] ?? {};
  const n = (k: string) => Number(t[k] ?? 0); // libsql returns counts as BigInt
  const total = n("total"), modified = n("modified"), errors = n("errors"),
    noImage = n("noImage"), noCategory = n("noCategory"), noStock = n("noStock"), stale = n("stale");
  const hasSales = ordersCount > 0;

  // KPIs: mes en curso vs mes anterior.
  const revNow = mtd._sum.total ?? 0, revPrev = lastMonthAgg._sum.total ?? 0;
  const cntNow = mtd._count, cntPrev = lastMonthAgg._count;
  const ticketNow = cntNow ? revNow / cntNow : 0, ticketPrev = cntPrev ? revPrev / cntPrev : 0;
  const trend = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const kpis = [
    { label: "Facturación del mes", value: `$${Math.round(revNow).toLocaleString("es-AR")}`, delta: trend(revNow, revPrev) },
    { label: "Ventas del mes", value: cntNow.toLocaleString("es-AR"), delta: trend(cntNow, cntPrev) },
    { label: "Ticket promedio", value: `$${Math.round(ticketNow).toLocaleString("es-AR")}`, delta: trend(ticketNow, ticketPrev) },
  ];

  if (total === 0) {
    return (
      <div style={{ padding: "80px 48px", maxWidth: 480 }}>
        <div className="anim-up">
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: "var(--color-brand)",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px" }}>
            Importá tu catálogo
          </h1>
          <p style={{ color: "var(--color-muted)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tus credenciales están configuradas. Importá tus productos para empezar a gestionarlos.
          </p>
          <Link href="/settings" className="btn-primary" style={{ padding: "10px 20px", fontSize: "0.9375rem", textDecoration: "none" }}>
            Ir a importar
          </Link>
        </div>
      </div>
    );
  }

  // Operations alerts — only the ones that need attention, sorted by severity.
  const alerts = [
    {
      key: "modified", count: modified, flag: "modified",
      label: modified === 1 ? "cambio sin sincronizar" : "cambios sin sincronizar",
      tone: "warning" as const, icon: "⟳",
    },
    {
      key: "error", count: errors, flag: "error", asStatus: true,
      label: errors === 1 ? "producto con error de sync" : "productos con error de sync",
      tone: "danger" as const, icon: "✕",
    },
    {
      key: "no-stock", count: noStock, flag: "no-stock",
      label: noStock === 1 ? "producto con stock agotado" : "productos con stock agotado",
      tone: "danger" as const, icon: "▢",
    },
    {
      key: "no-image", count: noImage, flag: "no-image",
      label: noImage === 1 ? "producto sin imagen" : "productos sin imagen",
      tone: "warning" as const, icon: "▣",
    },
    {
      key: "no-category", count: noCategory, flag: "no-category",
      label: noCategory === 1 ? "producto sin categoría" : "productos sin categoría",
      tone: "warning" as const, icon: "◫",
    },
    // Only surface "dead stock" once sales have been imported.
    ...(hasSales ? [{
      key: "stale", count: stale, flag: "stale",
      label: stale === 1 ? "producto sin vender en 60 días" : "productos sin vender en 60 días",
      tone: "warning" as const, icon: "↓",
    }] : []),
  ].filter((a) => a.count > 0);

  const toneColor = (t: "warning" | "danger") =>
    t === "danger" ? "var(--color-danger)" : "var(--color-warning)";
  const toneBg = (t: "warning" | "danger") =>
    t === "danger" ? "var(--color-danger-bg)" : "var(--color-warning-bg)";

  return (
    <div style={{ padding: "48px 48px 80px", overflowY: "auto", height: "100dvh" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* Header */}
        <div className="anim-up" style={{ marginBottom: 36, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 4px" }}>
              Tienda Nube · {settings.storeId}
            </p>
            <h1 style={{
              fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em",
              margin: 0, color: "var(--color-ink)", lineHeight: 1.1,
            }}>
              Centro de operaciones
            </h1>
          </div>
          <span style={{ fontSize: "0.875rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>
            {total.toLocaleString("es-AR")} productos
          </span>
        </div>

        {/* Pending manual orders — the working surface, above the read-only dashboard */}
        <OrderTickets />

        {/* KPIs — mes en curso vs mes anterior */}
        {hasSales && (
          <div className="anim-up delay-1" style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: "0 0 12px" }}>
              Rendimiento del mes
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {kpis.map((k) => (
                <div key={k.label} className="card" style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {k.value}
                    </span>
                    {k.delta != null && (
                      <span style={{
                        fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                        color: k.delta > 0 ? "var(--color-success)" : k.delta < 0 ? "var(--color-danger)" : "var(--color-subtle)",
                        display: "inline-flex", alignItems: "center", gap: 2,
                      }}>
                        {k.delta > 0 ? "▲" : k.delta < 0 ? "▼" : "→"} {Math.abs(k.delta)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--color-faint)", marginTop: 4 }}>vs. mes anterior</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operations alerts */}
        <div className="anim-up delay-1" style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: "0 0 12px" }}>
            Requiere atención
          </h2>

          {alerts.length === 0 ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "22px 24px", borderRadius: "var(--radius-card)",
              background: "var(--color-success-bg)", border: "1px solid var(--color-success)",
              boxShadow: "var(--shadow-card)",
            }}>
              <span style={{ fontSize: "1.125rem", color: "var(--color-success)" }}>✓</span>
              <div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)" }}>
                  Todo en orden
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: 1 }}>
                  No hay productos que requieran atención ahora mismo.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {alerts.map((a) => (
                <Link
                  key={a.key}
                  href={a.asStatus ? `/catalog?status=${a.flag}` : `/catalog?flag=${a.flag}`}
                  className="alert-card"
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "20px 22px", borderRadius: "var(--radius-card)", textDecoration: "none",
                    background: "var(--color-surface)", border: "1px solid var(--color-border)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: toneBg(a.tone), color: toneColor(a.tone),
                    fontSize: "1rem",
                  }}>
                    {a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--color-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {a.count.toLocaleString("es-AR")}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: 3, lineHeight: 1.3 }}>
                      {a.label}
                    </div>
                  </div>
                  <span style={{ color: "var(--color-faint)", flexShrink: 0 }}>→</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Widgets: campaigns + recent activity */}
        <div className="anim-up delay-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          {/* Campaigns */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={widgetH2}>Campañas</h2>
              <Link href="/campaigns" style={widgetLink}>Ver todas →</Link>
            </div>
            <div className="card-float" style={{ overflow: "hidden", minHeight: 96 }}>
              {activeCampaigns.length === 0 && upcomingCampaigns.length === 0 ? (
                <div style={{ padding: "28px 18px", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>No hay campañas activas ni programadas.</div>
              ) : (
                [
                  ...activeCampaigns.map((c) => ({ id: c.id, name: c.name, dot: "var(--color-success)", note: "Activa", countdownTo: c.endDate as Date | null, cdPrefix: "· termina en", extra: `${c._count.items} prod.` })),
                  ...upcomingCampaigns.map((c) => ({ id: c.id, name: c.name, dot: "var(--color-brand)", note: "Programada", countdownTo: c.startDate as Date | null, cdPrefix: "· empieza en", extra: "" })),
                ].map((c, i) => (
                  <Link key={`${c.id}-${i}`} href="/campaigns" style={{ textDecoration: "none", display: "block" }} className="product-row-link">
                    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: c.dot }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>
                          {c.note}{c.countdownTo && <> <Countdown to={c.countdownTo} prefix={c.cdPrefix} /></>}
                        </div>
                      </div>
                      {c.extra && <span style={{ fontSize: "0.75rem", color: "var(--color-faint)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{c.extra}</span>}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={widgetH2}>Actividad reciente</h2>
              <Link href="/changes" style={widgetLink}>Ver todo →</Link>
            </div>
            <div className="card-float" style={{ overflow: "hidden", minHeight: 96 }}>
              {recentActivity.length === 0 ? (
                <div style={{ padding: "28px 18px", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Todavía no hay actividad.</div>
              ) : recentActivity.map((l, i) => (
                <Link key={l.id} href={`/catalog?edit=${l.productId}`} style={{ textDecoration: "none", display: "block" }} className="product-row-link">
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "var(--color-surface-2)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {l.product.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={l.product.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.product.name}</div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", marginTop: 1 }}>{CHANGELOG_LABEL[l.field] || l.field} actualizado</div>
                    </div>
                    <span style={{ fontSize: "0.6875rem", color: "var(--color-faint)", flexShrink: 0, whiteSpace: "nowrap" }}>{relTime(l.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="anim-up delay-3" style={{ display: "flex", gap: 10, marginTop: 32 }}>
          <Link href="/catalog" className="btn-primary" style={{ padding: "10px 22px", fontSize: "0.9375rem", textDecoration: "none" }}>
            Abrir catálogo
          </Link>
          <Link href="/settings" className="btn-secondary" style={{ padding: "10px 20px", fontSize: "0.9375rem", textDecoration: "none" }}>
            Actualizar importación
          </Link>
        </div>
      </div>
    </div>
  );
}
