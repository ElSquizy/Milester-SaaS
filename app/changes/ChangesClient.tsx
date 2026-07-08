"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Log = {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  productSync: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  synced: boolean;
  createdAt: string;
};

const FIELD: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  name: { label: "Nombre", color: "var(--color-brand)", bg: "var(--color-brand-light)", icon: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></> },
  price: { label: "Precio base", color: "var(--color-ink)", bg: "var(--color-surface-2)", icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
  promotionalPrice: { label: "Precio promocional", color: "var(--color-success)", bg: "var(--color-success-bg)", icon: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></> },
  published: { label: "Visibilidad", color: "var(--color-muted)", bg: "var(--color-surface-2)", icon: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></> },
  tags: { label: "Etiquetas", color: "var(--color-info, #2563EB)", bg: "var(--color-brand-light)", icon: <><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></> },
  categories: { label: "Colecciones", color: "var(--color-warning)", bg: "var(--color-warning-bg)", icon: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></> },
  sku: { label: "SKU", color: "var(--color-muted)", bg: "var(--color-surface-2)", icon: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M7 8v8M11 8v8M15 8v8M18 8v8" /></> },
  stock: { label: "Stock", color: "var(--color-brand)", bg: "var(--color-brand-light)", icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></> },
};

function money(v: string | null): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isNaN(n) ? v : `$${n.toLocaleString("es-AR")}`;
}
function fmt(field: string, v: string | null): string {
  if (field === "price" || field === "promotionalPrice") return money(v);
  if (field === "published") return v === "true" ? "Publicado" : v === "false" ? "Oculto" : (v || "—");
  if (field === "stock") return v == null || v === "" ? "—" : Number(v).toLocaleString("es-AR");
  return v == null || v === "" ? "—" : v;
}

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (t === startToday) return "Hoy";
  if (t === startToday - 86400000) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export default function ChangesClient() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [date, setDate] = useState(""); // "" = recientes; "YYYY-MM-DD" = un día puntual

  const fetchLogs = useCallback(async (opts: { date?: string; before?: number; append?: boolean }) => {
    const params = new URLSearchParams();
    if (opts.date) {
      const [y, m, d] = opts.date.split("-").map(Number);
      params.set("from", new Date(y, m - 1, d, 0, 0, 0).toISOString());
      params.set("to", new Date(y, m - 1, d + 1, 0, 0, 0).toISOString());
    } else if (opts.before) {
      params.set("before", String(opts.before));
    }
    const res = await fetch(`/api/changelog?${params.toString()}`).then((r) => r.json());
    setPending(res.pending || 0);
    setHasMore(!!res.hasMore);
    setLogs((prev) => (opts.append ? [...prev, ...(res.logs || [])] : res.logs || []));
  }, []);

  const loadRecent = useCallback(async () => { setLoading(true); try { await fetchLogs({}); } finally { setLoading(false); } }, [fetchLogs]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  function pickDate(v: string) {
    if (!v) { setDate(""); loadRecent(); return; }
    setDate(v); setLoading(true);
    fetchLogs({ date: v }).finally(() => setLoading(false));
  }
  async function loadMore() {
    if (!logs.length) return;
    setLoadingMore(true);
    try { await fetchLogs({ before: logs[logs.length - 1].id, append: true }); } finally { setLoadingMore(false); }
  }

  // Group entries under day headers, preserving recency order.
  const groups: { day: string; items: Log[] }[] = [];
  for (const l of logs) {
    const day = dayLabel(l.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(l);
    else groups.push({ day, items: [l] });
  }

  return (
    <div style={{ height: "100dvh", overflowY: "auto", padding: "48px 48px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div className="anim-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 4px", lineHeight: 1.1 }}>Actividad</h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
              {date
                ? "Cambios de la fecha elegida."
                : "Los últimos cambios en toda la tienda: precios, nombres, stock, colecciones y más."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <input type="date" value={date} onChange={(e) => pickDate(e.target.value)} className="input" style={{ width: "auto", padding: "7px 10px", fontSize: "0.8125rem" }} />
            </div>
            {date && <button className="btn-secondary" onClick={() => pickDate("")} style={{ whiteSpace: "nowrap" }}>Recientes</button>}
          </div>
        </div>

        {/* Pending-sync banner */}
        {pending > 0 && (
          <Link href="/catalog" className="anim-up" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", marginBottom: 22, borderRadius: "var(--radius-card)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", boxShadow: "var(--shadow-card)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--color-warning)", fontWeight: 600 }}>
                {pending} {pending === 1 ? "producto tiene cambios" : "productos tienen cambios"} sin sincronizar con Tienda Nube
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-warning)", fontWeight: 600, whiteSpace: "nowrap" }}>Ir a sincronizar →</span>
            </div>
          </Link>
        )}

        {/* Feed */}
        {loading && logs.length === 0 ? (
          <div style={{ padding: "64px", textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Cargando actividad…</div>
        ) : logs.length === 0 ? (
          <div className="anim-up delay-1 card" style={{ padding: "56px 24px", textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>🗓️</div>
            <p style={{ fontSize: "0.9375rem", color: "var(--color-ink)", fontWeight: 600, margin: "0 0 4px" }}>{date ? "Sin cambios ese día" : "Todavía no hay actividad"}</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: 0 }}>{date ? "Probá con otra fecha o volvé a los cambios recientes." : "Cuando edites productos o sincronices la tienda, los cambios aparecerán acá."}</p>
          </div>
        ) : (
          <div className="anim-up delay-1" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {groups.map((g) => (
              <div key={g.day}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-subtle)", marginBottom: 10 }}>{g.day}</div>
                <div className="card-float" style={{ overflow: "hidden", padding: 0 }}>
                  {g.items.map((l, i) => <Row key={l.id} log={l} first={i === 0} />)}
                </div>
              </div>
            ))}
            {!date && hasMore && (
              <div style={{ textAlign: "center", paddingTop: 4 }}>
                <button className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : "Cargar más (días anteriores)"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ log, first }: { log: Log; first: boolean }) {
  const f = FIELD[log.field] || { label: log.field, color: "var(--color-muted)", bg: "var(--color-surface-2)", icon: <circle cx="12" cy="12" r="9" /> };
  return (
    <Link href={`/catalog?edit=${log.productId}`} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderTop: first ? "none" : "1px solid var(--color-divider)",
      }}>
        {/* Field icon */}
        <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: f.bg, color: f.color }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
        </span>

        {/* Product thumb */}
        {log.productImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={log.productImage} alt="" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: "var(--color-surface-2)" }} />
          : <span style={{ width: 30, height: 30, borderRadius: 7, background: "var(--color-surface-2)", flexShrink: 0 }} />}

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.productName}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 1 }}>
            <span style={{ fontWeight: 600, color: "var(--color-muted)" }}>{f.label}</span>
            <span style={{ color: "var(--color-faint)", textDecoration: "line-through" }}>{fmt(log.field, log.oldValue)}</span>
            <span style={{ color: "var(--color-faint)" }}>→</span>
            <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>{fmt(log.field, log.newValue)}</span>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: "0.6875rem", color: "var(--color-faint)", whiteSpace: "nowrap" }}>{relTime(log.createdAt)}</span>
          {log.productSync === "modified" && (
            <span className="pill pill-warning" style={{ fontSize: "0.625rem", padding: "1px 7px" }}>sin sincronizar</span>
          )}
          {log.productSync === "error" && (
            <span className="pill pill-danger" style={{ fontSize: "0.625rem", padding: "1px 7px" }}>error</span>
          )}
        </div>
      </div>
    </Link>
  );
}
