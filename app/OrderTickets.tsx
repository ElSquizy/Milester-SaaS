"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/useIsMobile";

type Item = { id?: number; productId: number | null; name: string; quantity: number; price: number; imageUrl?: string | null };
type Ticket = {
  id: number;
  total: number;
  customerName: string | null;
  customer: { id: number; name: string; email: string | null; phone: string | null } | null;
  fulfillmentState: string | null;
  paymentReference: string | null;
  exchangeRate: number | null;
  channel: string | null;
  number: number | null;
  ownerNote: string | null;
  orderedAt: string;
  items: Item[];
};
type Match = { id: number; name: string; email: string | null; phone: string | null; orderCount: number; strength: "exact" | "weak" };
type FoundProduct = { id: number; name: string; sku: string | null; price: number; promotionalPrice: number | null; imageUrl: string | null };

const money = (n: number) => `$${n.toLocaleString("es-AR")}`;

const STATE_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending_payment: { label: "Falta pagar", bg: "var(--color-warning)", fg: "#fff" },
  paid: { label: "Pagado", bg: "var(--color-info)", fg: "#fff" },
  delivered: { label: "Entregado", bg: "var(--color-success)", fg: "#fff" },
};
const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", presencial: "Presencial", otro: "Otro" };

/**
 * Pending manual orders, at the top of Inicio — the "bar ticket" board.
 *
 * These are the sales taken over WhatsApp/Instagram/in person that Tienda Nube
 * never sees. Kept compact on purpose: the dashboard below is still the point of
 * this page, so the strip shows what's open and gets out of the way.
 */
export default function OrderTickets() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [composing, setComposing] = useState<Ticket | "new" | null>(null);

  const load = useCallback(() => {
    fetch("/api/orders/local").then((r) => r.json()).then(setTickets).catch(() => setTickets([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setState(t: Ticket, next: string) {
    await fetch(`/api/orders/local/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fulfillmentState: next }),
    });
    load();
    if (next === "delivered") router.refresh(); // it leaves the board and counts as a sale
  }

  const pendingTotal = (tickets || []).filter((t) => t.fulfillmentState === "pending_payment").reduce((s, t) => s + t.total, 0);

  return (
    <div className="anim-up" style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
        <h2 style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: 0 }}>
          Pedidos pendientes
          {tickets && tickets.length > 0 && <span style={{ marginLeft: 8, color: "var(--color-ink)" }}>{tickets.length}</span>}
          {pendingTotal > 0 && <span style={{ marginLeft: 8, color: "var(--color-warning)", textTransform: "none", letterSpacing: 0 }}>· {money(pendingTotal)} por cobrar</span>}
        </h2>
        <button className="btn-primary" onClick={() => setComposing("new")} style={{ padding: "7px 14px", fontSize: "0.8125rem", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Nuevo pedido
        </button>
      </div>

      {tickets === null ? (
        <div style={{ padding: 20, fontSize: "0.875rem", color: "var(--color-subtle)" }}>Cargando…</div>
      ) : tickets.length === 0 ? (
        <div className="card" style={{ padding: "22px 20px", borderStyle: "dashed", textAlign: "center" }}>
          <p style={{ margin: "0 0 3px", fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)" }}>No hay pedidos abiertos</p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-muted)" }}>
            Anotá acá las ventas por WhatsApp o Instagram: suman a tus métricas igual que las de la web.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {tickets.map((t) => {
            const st = STATE_META[t.fulfillmentState || "pending_payment"];
            return (
              <div key={t.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.customer?.name || t.customerName || "Sin cliente"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>
                      {t.channel ? CHANNEL_LABEL[t.channel] ?? t.channel : "Manual"}
                      {t.number ? ` · web #${t.number}` : ""}
                    </div>
                  </div>
                  <span className="pill" style={{ background: st.bg, color: st.fg, fontWeight: 600, flexShrink: 0 }}>{st.label}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {t.items.slice(0, 3).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.8125rem" }}>
                      <span style={{ color: "var(--color-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.quantity > 1 && <b style={{ color: "var(--color-ink)" }}>{it.quantity}× </b>}{it.name}
                      </span>
                      <span style={{ color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{money(it.price * it.quantity)}</span>
                    </div>
                  ))}
                  {t.items.length > 3 && <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>+{t.items.length - 3} más</div>}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-divider)", paddingTop: 9 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{money(t.total)}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-secondary" onClick={() => setComposing(t)} style={{ padding: "5px 10px", fontSize: "0.75rem" }}>Editar</button>
                    {t.fulfillmentState === "pending_payment" ? (
                      <button className="btn-primary" onClick={() => setState(t, "paid")} style={{ padding: "5px 10px", fontSize: "0.75rem" }}>Cobré</button>
                    ) : (
                      <button className="btn-primary" onClick={() => setState(t, "delivered")} style={{ padding: "5px 10px", fontSize: "0.75rem" }}>Entregué</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {composing && (
        <TicketComposer
          ticket={composing === "new" ? null : composing}
          isMobile={isMobile}
          onClose={() => setComposing(null)}
          onSaved={() => { setComposing(null); load(); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ── Composer ─────────────────────────────────────────── */

function TicketComposer({ ticket, isMobile, onClose, onSaved }: {
  ticket: Ticket | null; isMobile: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [items, setItems] = useState<Item[]>(ticket?.items.map((i) => ({ ...i })) ?? []);
  const [name, setName] = useState(ticket?.customer?.name ?? ticket?.customerName ?? "");
  const [email, setEmail] = useState(ticket?.customer?.email ?? "");
  const [phone, setPhone] = useState(ticket?.customer?.phone ?? "");
  const [customerId, setCustomerId] = useState<number | null>(ticket?.customer?.id ?? null);
  const [paymentReference, setPaymentReference] = useState(ticket?.paymentReference ?? "");
  const [exchangeRate, setExchangeRate] = useState(ticket?.exchangeRate != null ? String(ticket.exchangeRate) : "");
  const [channel, setChannel] = useState(ticket?.channel ?? "whatsapp");
  const [linkedOrderNumber, setLinkedOrderNumber] = useState(ticket?.number != null ? String(ticket.number) : "");
  const [ownerNote, setOwnerNote] = useState(ticket?.ownerNote ?? "");
  const [matches, setMatches] = useState<Match[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Product search
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundProduct[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((d) => setFound((d.products || []).slice(0, 6))).catch(() => setFound([]));
    }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  // Customer dedup: look for the person as soon as there's something to match on.
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (customerId) { setMatches([]); return; }
    if (!name.trim() && !email.trim() && !phone.trim()) { setMatches([]); return; }
    if (matchTimer.current) clearTimeout(matchTimer.current);
    matchTimer.current = setTimeout(() => {
      fetch("/api/customers/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, phone }) })
        .then((r) => r.json()).then(setMatches).catch(() => setMatches([]));
    }, 350);
    return () => { if (matchTimer.current) clearTimeout(matchTimer.current); };
  }, [name, email, phone, customerId]);

  function addProduct(p: FoundProduct) {
    setItems((prev) => {
      const hit = prev.findIndex((i) => i.productId === p.id);
      if (hit >= 0) {
        const next = [...prev];
        next[hit] = { ...next[hit], quantity: next[hit].quantity + 1 };
        return next;
      }
      return [...prev, { productId: p.id, name: p.name, quantity: 1, price: p.promotionalPrice ?? p.price, imageUrl: p.imageUrl }];
    });
    setQ(""); setFound([]);
  }
  function addFreeItem() {
    setItems((prev) => [...prev, { productId: null, name: "", quantity: 1, price: 0 }]);
  }
  const patchItem = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);

  async function save() {
    setSaving(true); setError("");
    try {
      const payload = {
        customer: { id: customerId, name, email, phone },
        items: items.map((i) => ({ productId: i.productId, name: i.name, quantity: Number(i.quantity) || 1, price: Number(i.price) || 0 })),
        paymentReference, channel, ownerNote,
        exchangeRate: exchangeRate.trim() === "" ? null : Number(exchangeRate.replace(",", ".")),
        linkedOrderNumber: linkedOrderNumber.trim() === "" ? null : Number(linkedOrderNumber),
      };
      const res = await fetch(ticket ? `/api/orders/local/${ticket.id}` : "/api/orders/local", {
        method: ticket ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo guardar");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!ticket || !confirm("¿Borrar este pedido?")) return;
    await fetch(`/api/orders/local/${ticket.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div onClick={onClose} className="anim-in" style={{
      position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "40px 24px",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{
        width: "100%", maxWidth: isMobile ? "none" : 620,
        height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "calc(100dvh - 80px)",
        background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)",
        boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 16px" : "18px 22px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>{ticket ? "Editar pedido" : "Nuevo pedido"}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Products */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={sectionLabel}>Productos</span>
            <div style={{ position: "relative" }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por nombre o SKU…" />
              {found.length > 0 && (
                <div className="menu anim-in" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, maxHeight: 240, overflowY: "auto" }}>
                  {found.map((p) => (
                    <div key={p.id} className="menu-item" onClick={() => addProduct(p)}>
                      {p.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imageUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                        : <span style={{ width: 26, height: 26, borderRadius: 6, background: "var(--color-surface-2)", flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{money(p.promotionalPrice ?? p.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Buscá arriba para agregar, o cargá un ítem suelto.</p>
            ) : (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
                {items.map((it, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: i > 0 ? "1px solid var(--color-divider)" : "none" }}>
                    <input
                      value={it.name}
                      onChange={(e) => patchItem(i, { name: e.target.value })}
                      placeholder="Nombre del ítem"
                      style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: "0.8125rem", color: "var(--color-ink)" }}
                    />
                    <input
                      value={it.quantity} onChange={(e) => patchItem(i, { quantity: Number(e.target.value) || 1 })}
                      inputMode="numeric" aria-label="Cantidad" title="Cantidad"
                      style={{ width: 46, textAlign: "center", border: "1px solid var(--color-border)", borderRadius: 7, padding: "4px 4px", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}
                    />
                    <input
                      value={it.price} onChange={(e) => patchItem(i, { price: Number(e.target.value) || 0 })}
                      inputMode="decimal" aria-label="Precio" title="Precio unitario"
                      style={{ width: 92, textAlign: "right", border: "1px solid var(--color-border)", borderRadius: 7, padding: "4px 8px", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                    />
                    <button onClick={() => setItems((prev) => prev.filter((_, x) => x !== i))} aria-label="Quitar ítem" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", padding: 4, flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addFreeItem} style={{ alignSelf: "flex-start", border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "5px 11px", fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
              + Ítem suelto
            </button>
          </section>

          {/* Customer */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={sectionLabel}>Cliente</span>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); setCustomerId(null); }} placeholder="Nombre" />
              <input className="input" value={phone} onChange={(e) => { setPhone(e.target.value); setCustomerId(null); }} placeholder="Teléfono" inputMode="tel" />
              <input className="input" value={email} onChange={(e) => { setEmail(e.target.value); setCustomerId(null); }} placeholder="Email" inputMode="email" style={{ gridColumn: isMobile ? undefined : "1 / -1" }} />
            </div>

            {customerId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: "var(--color-success)" }}>
                <span>✓ Vinculado a un cliente existente</span>
                <button onClick={() => setCustomerId(null)} style={{ border: "none", background: "transparent", color: "var(--color-subtle)", textDecoration: "underline", cursor: "pointer", fontSize: "0.75rem" }}>desvincular</button>
              </div>
            ) : matches.length > 0 && (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
                <div style={{ padding: "6px 10px", fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-subtle)", background: "var(--color-surface-2)" }}>
                  ¿Es alguno de estos? — evita duplicar el cliente
                </div>
                {matches.map((m) => (
                  <button key={m.id} onClick={() => { setCustomerId(m.id); setName(m.name); setEmail(m.email ?? ""); setPhone(m.phone ?? ""); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", borderTop: "1px solid var(--color-divider)", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-subtle)" }}>{[m.phone, m.email].filter(Boolean).join(" · ") || "sin contacto"} · {m.orderCount} pedidos</span>
                    </span>
                    {m.strength === "exact" && <span className="pill pill-success" style={{ flexShrink: 0 }}>coincide</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Payment & origin */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={sectionLabel}>Pago y origen</span>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
              <label style={fieldLabel}>Nº de operación
                <input className="input" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Comprobante / transferencia" />
              </label>
              <label style={fieldLabel}>Canal
                <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="presencial">Presencial</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
              <label style={fieldLabel}>Dólar del día
                <input className="input" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ej: 1450" inputMode="decimal" />
              </label>
              <label style={fieldLabel}>Nº de pedido web <span style={{ fontWeight: 400, color: "var(--color-faint)" }}>(si compró online)</span>
                <input className="input" value={linkedOrderNumber} onChange={(e) => setLinkedOrderNumber(e.target.value)} placeholder="Opcional" inputMode="numeric" />
              </label>
            </div>
            <label style={fieldLabel}>Nota
              <input className="input" value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} placeholder="Para vos: cuenta entregada, detalles…" />
            </label>
          </section>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 16px" : "14px 22px", borderTop: "1px solid var(--color-divider)", flexShrink: 0 }}>
          {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span> : (
            <span style={{ flex: 1, fontSize: "0.9375rem", fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              Total {money(total)}
            </span>
          )}
          {ticket && <button className="btn-secondary" onClick={remove} style={{ color: "var(--color-danger)" }}>Borrar</button>}
          <button className="btn-primary" onClick={save} disabled={saving || items.length === 0}>
            {saving ? "Guardando…" : ticket ? "Guardar" : "Crear pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em",
  textTransform: "uppercase", color: "var(--color-subtle)",
};
const fieldLabel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
  fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)",
};
