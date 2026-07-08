"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Order, OpenOrder } from "./page";
import SalesSyncButton from "@/components/SalesSyncButton";

interface Props {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
  currentQ: string;
  currentStatus: string;
  openOrder: OpenOrder | null;
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open:      { label: "Abierta", color: "var(--color-warning)", bg: "var(--color-warning-bg)" },
  closed:    { label: "Cerrada", color: "var(--color-success)", bg: "var(--color-success-bg)" },
  cancelled: { label: "Cancelada", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
};

export default function SalesClient({ orders, total, page, totalPages, currentQ, currentStatus, openOrder }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQ, setLocalQ] = useState(currentQ);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    if (key !== "page") p.delete("page");
    p.delete("order");
    router.push(`${pathname}?${p.toString()}`);
  }
  function openOrderPanel(id: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("order", String(id));
    router.push(`${pathname}?${p.toString()}`);
  }
  function closePanel() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("order");
    router.push(`${pathname}?${p.toString()}`);
  }
  function pageUrl(n: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(n)); p.delete("order");
    return `${pathname}?${p.toString()}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.03em" }}>Ventas</h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {total.toLocaleString("es-AR")} {total === 1 ? "venta" : "ventas"}
            </p>
          </div>
          <SalesSyncButton />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", localQ); }}
            onBlur={() => { if (localQ !== currentQ) setParam("q", localQ); }}
            placeholder="Buscar por cliente..."
            style={{ flex: 1, maxWidth: 300, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.875rem", color: "var(--color-ink)", outline: "none" }}
          />
          <select value={currentStatus} onChange={(e) => setParam("status", e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.875rem", color: "var(--color-ink)", cursor: "pointer" }}>
            <option value="">Todos los estados</option>
            <option value="open">Abiertas</option>
            <option value="closed">Cerradas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ ...th, paddingLeft: 24, minWidth: 70 }}>Orden</th>
                <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Cliente</th>
                <th style={{ ...th, textAlign: "left", minWidth: 120 }}>Fecha</th>
                <th style={{ ...th, textAlign: "right", minWidth: 60 }}>Ítems</th>
                <th style={{ ...th, textAlign: "right", minWidth: 100 }}>Total</th>
                <th style={{ ...th, textAlign: "left", minWidth: 100 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const s = STATUS[o.status] || { label: o.status, color: "var(--color-subtle)", bg: "var(--color-surface-2)" };
                return (
                  <tr key={o.id} onClick={() => openOrderPanel(o.id)}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-divider)", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...td, paddingLeft: 24, fontWeight: 600, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>
                      #{o.number ?? o.id}
                      {o.source === "local" && <span style={{ marginLeft: 6, fontSize: "0.625rem", color: "var(--color-info)", fontWeight: 600 }}>LOCAL</span>}
                    </td>
                    <td style={{ ...td, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {o.customerName || <span style={{ color: "var(--color-faint)" }}>—</span>}
                    </td>
                    <td style={{ ...td, color: "var(--color-subtle)", whiteSpace: "nowrap" }}>{fmtDate(o.orderedAt)}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{o._count.items}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>${o.total.toLocaleString("es-AR")}</td>
                    <td style={{ ...td, paddingRight: 20 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color, fontSize: "0.75rem", fontWeight: 500, whiteSpace: "nowrap" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {orders.length === 0 && (
            <div style={{ padding: "80px 24px", textAlign: "center", color: "var(--color-muted)", fontSize: "0.875rem" }}>
              Sin ventas para este filtro
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid var(--color-divider)" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>Página {page} de {totalPages}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {page > 1 && <a href={pageUrl(page - 1)} style={pageBtn(false)}>← Ant.</a>}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  return start + i;
                }).filter((n) => n <= totalPages).map((n) => <a key={n} href={pageUrl(n)} style={pageBtn(n === page)}>{n}</a>)}
                {page < totalPages && <a href={pageUrl(page + 1)} style={pageBtn(false)}>Sig. →</a>}
              </div>
            </div>
          )}
        </div>

        {openOrder && <OrderPanel order={openOrder} onClose={closePanel} />}
      </div>
    </div>
  );
}

function OrderPanel({ order, onClose }: { order: OpenOrder; onClose: () => void }) {
  const s = STATUS[order.status] || { label: order.status, color: "var(--color-subtle)", bg: "var(--color-surface-2)" };
  return (
    <>
      <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.12)", zIndex: 40 }} />
      <div className="anim-panel" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: "var(--color-surface)", borderLeft: "1px solid var(--color-border)", display: "flex", flexDirection: "column", zIndex: 50, boxShadow: "-8px 0 32px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-ink)" }}>Orden #{order.number ?? order.id}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>{fmtDate(order.orderedAt)}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Customer */}
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-subtle)", marginBottom: 8 }}>Cliente</div>
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--color-surface-2)", border: "1px solid var(--color-divider)" }}>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)" }}>{order.customerName || order.customer?.name || "—"}</div>
              {order.customer?.email && <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: 3 }}>{order.customer.email}</div>}
              {order.customer?.phone && <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: 1 }}>{order.customer.phone}</div>}
              {order.customer?.identification && <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: 1 }}>DNI/CUIT: {order.customer.identification}</div>}
            </div>
          </div>

          {/* Items */}
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-subtle)", marginBottom: 8 }}>Productos</div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
              {order.items.map((it, i) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                  {it.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", border: "1px solid var(--color-divider)", flexShrink: 0 }} />
                    : <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0, width: 28, textAlign: "center" }}>{it.quantity}×</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>
                      {it.imageUrl && `${it.quantity} × `}{it.variantName ? it.variantName : ""}{it.sku ? `${it.variantName ? " · " : ""}SKU ${it.sku}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>${(it.price * it.quantity).toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment */}
          <Section title="Pago">
            {order.paymentMethod && <Line label="Medio" value={order.paymentMethod} />}
            <Line label="Estado de pago" value={payLabel(order.paymentStatus)} />
            {order.subtotal != null && <Line label="Subtotal" value={`$${order.subtotal.toLocaleString("es-AR")}`} />}
            {order.discount != null && order.discount > 0 && <Line label="Descuento" value={`−$${order.discount.toLocaleString("es-AR")}`} accent="var(--color-success)" />}
            {order.shippingCost != null && order.shippingCost > 0 && <Line label="Envío" value={`$${order.shippingCost.toLocaleString("es-AR")}`} />}
          </Section>

          {/* Shipping */}
          {(order.shippingMethod || order.shippingAddress || order.trackingNumber || order.shippingType) && (
            <Section title="Envío">
              {order.shippingType && <Line label="Tipo" value={order.shippingType === "pickup" ? "Retiro en local" : "Envío a domicilio"} />}
              {order.shippingMethod && <Line label="Método" value={order.shippingMethod} />}
              {order.shippingCarrier && <Line label="Transportista" value={order.shippingCarrier} />}
              {order.shippingStatus && <Line label="Estado de envío" value={order.shippingStatus} />}
              {order.shippingAddress && <Line label="Dirección" value={order.shippingAddress} wrap />}
              {order.trackingNumber && (
                <Line label="Tracking" value={
                  order.trackingUrl
                    ? <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-info)", textDecoration: "none" }}>{order.trackingNumber} ↗</a>
                    : order.trackingNumber
                } />
              )}
            </Section>
          )}

          {/* Notes */}
          {(order.customerNote || order.ownerNote) && (
            <Section title="Notas">
              {order.customerNote && <div style={{ fontSize: "0.8125rem", color: "var(--color-ink)", padding: "8px 0" }}><span style={{ color: "var(--color-subtle)" }}>Cliente: </span>{order.customerNote}</div>}
              {order.ownerNote && <div style={{ fontSize: "0.8125rem", color: "var(--color-ink)", padding: "8px 0", borderTop: order.customerNote ? "1px solid var(--color-divider)" : "none" }}><span style={{ color: "var(--color-subtle)" }}>Interna: </span>{order.ownerNote}</div>}
            </Section>
          )}

          {/* Timeline */}
          <Section title="Historial">
            <Timeline order={order} />
          </Section>

          {/* Summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>Estado</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color, fontSize: "0.75rem", fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)" }}>Total</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-ink)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>${order.total.toLocaleString("es-AR")}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-subtle)", marginBottom: 8 }}>{title}</div>
      <div style={{ padding: "4px 14px", borderRadius: 10, background: "var(--color-surface-2)", border: "1px solid var(--color-divider)" }}>
        {children}
      </div>
    </div>
  );
}

function Line({ label, value, accent, wrap }: { label: string; value: React.ReactNode; accent?: string; wrap?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", alignItems: wrap ? "flex-start" : "baseline" }}>
      <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: accent || "var(--color-ink)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: wrap ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
    </div>
  );
}

function Timeline({ order }: { order: OpenOrder }) {
  const events = [
    { label: "Creada", date: order.orderedAt },
    { label: "Pagada", date: order.paidAt },
    { label: "Enviada", date: order.shippedAt },
    { label: "Completada", date: order.completedAt },
    { label: "Cancelada", date: order.cancelledAt },
    { label: "Cerrada", date: order.closedAt },
  ].filter((e) => e.date) as { label: string; date: string }[];
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return (
    <div style={{ padding: "6px 0" }}>
      {events.map((e, i) => (
        <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.label === "Cancelada" ? "var(--color-danger)" : "var(--color-brand)", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)" }}>{e.label}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{fmtDateTime(e.date)}</span>
        </div>
      ))}
    </div>
  );
}

function payLabel(s: string | null) {
  const map: Record<string, string> = { paid: "Pagado", pending: "Pendiente", authorized: "Autorizado", refunded: "Reembolsado", voided: "Anulado", abandoned: "Abandonado", partially_paid: "Pago parcial" };
  return s ? (map[s] || s) : "—";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" });
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: "0.75rem", fontWeight: 500, color: "var(--color-subtle)", whiteSpace: "nowrap", textAlign: "right" };
const td: React.CSSProperties = { padding: "11px 12px", verticalAlign: "middle" };
const pageBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 10px", borderRadius: 6, fontSize: "0.8125rem", textDecoration: "none", fontVariantNumeric: "tabular-nums",
  background: active ? "var(--color-brand)" : "var(--color-surface)", color: active ? "var(--color-brand-ink)" : "var(--color-muted)",
  border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`, fontWeight: active ? 600 : 400, display: "inline-block",
});
