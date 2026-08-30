"use client";
import { useEffect, useMemo, useState } from "react";
import { priceMoments, type Change, type Moment } from "@/lib/priceSeries";

type Current = { price: number; promotionalPrice: number | null; costUsd: number | null; costUsdPromo: number | null };

const META: Record<string, { label: string; unit: "ars" | "usd" }> = {
  price: { label: "Base", unit: "ars" },
  promotionalPrice: { label: "Promo", unit: "ars" },
  costUsd: { label: "Costo USD", unit: "usd" },
  costUsdPromo: { label: "Costo promo", unit: "usd" },
};
const fmtVal = (v: number | null, unit: "ars" | "usd") =>
  v == null ? "—" : unit === "usd" ? `US$${v.toLocaleString("es-AR")}` : `$${Math.round(v).toLocaleString("es-AR")}`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

export default function PriceHistoryTable({ productId, current, fields, limit, onSeeAll }: {
  productId: number; current: Current; fields: readonly string[]; limit?: number; onSeeAll?: () => void;
}) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/changelog?productId=${productId}`).then((r) => r.json())
      .then((d: { logs?: Change[] }) => { if (alive) setChanges(d.logs || []); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);

  const moments = useMemo(() => priceMoments(changes, current as unknown as Record<string, number | null>), [changes, current]);
  const totalChanges = moments.length - 1; // todos los momentos de precio (sin la fila "Ahora")
  // En el panel (pocas columnas) mostramos solo los momentos donde cambió una
  // columna visible; los que tocaron otros precios se ven en la vista completa.
  const visible = useMemo(() => moments.filter((m) => m.now || fields.some((f) => !!m.changed[f])), [moments, fields]);
  const shown = limit ? visible.slice(0, limit) : visible;
  const shownChanges = shown.filter((m) => !m.now).length;
  const hasMore = totalChanges > shownChanges;

  const cols = `minmax(58px, auto) repeat(${fields.length}, 1fr)`;

  if (loading) return <div style={{ padding: "24px 0", textAlign: "center", fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Cargando historial…</div>;

  return (
    <div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Encabezado */}
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--color-divider)", background: "var(--color-surface-2)" }}>
          <HeadCell>Fecha</HeadCell>
          {fields.map((f) => <HeadCell key={f} right>{META[f].label}</HeadCell>)}
        </div>
        {shown.map((m, i) => (
          <Row key={m.now ? "now" : m.t} m={m} fields={fields} first={i === 0} cols={cols} />
        ))}
      </div>

      {totalChanges === 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", margin: "8px 2px 0" }}>Sin cambios de precio registrados aún. Cada cambio que hagas se irá apilando acá.</p>
      )}
      {onSeeAll && hasMore && (
        <button onClick={onSeeAll} className="btn-secondary" style={{ marginTop: 10, width: "100%", fontSize: "0.8125rem" }}>
          Ver historial completo ({totalChanges} {totalChanges === 1 ? "cambio" : "cambios"}) →
        </button>
      )}
    </div>
  );
}

function Row({ m, fields, first, cols }: { m: Moment; fields: readonly string[]; first: boolean; cols: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 12px", alignItems: "baseline",
      borderTop: first ? "none" : "1px solid var(--color-divider)", background: m.now ? "color-mix(in srgb, var(--color-brand) 4%, transparent)" : "transparent" }}>
      <span style={{ fontSize: "0.75rem", fontWeight: m.now ? 700 : 500, color: m.now ? "var(--color-brand)" : "var(--color-muted)", whiteSpace: "nowrap" }}>
        {m.now ? "Ahora" : fmtDate(m.t)}
      </span>
      {fields.map((f) => {
        const meta = META[f];
        const v = m.values[f];
        const ch = m.changed[f];
        const changed = !m.now && !!ch;
        return (
          <span key={f} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: changed || m.now ? 600 : 400, color: changed || m.now ? "var(--color-ink)" : "var(--color-subtle)" }}>
              {fmtVal(v, meta.unit)}
            </span>
            {changed && <Delta ch={ch!} />}
          </span>
        );
      })}
    </div>
  );
}

function Delta({ ch }: { ch: { from: number | null; to: number | null; pct: number | null } }) {
  let label: string;
  if (ch.to == null) label = "quitado";
  else if (ch.from == null) label = "nuevo";
  else if (ch.pct == null) label = "";
  else label = `${ch.pct > 0 ? "▲" : "▼"} ${Math.abs(ch.pct)}%`;
  if (!label) return null;
  return <span style={{ display: "block", fontSize: "0.625rem", fontWeight: 600, color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{label}</span>;
}

function HeadCell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <span style={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)", textAlign: right ? "right" : "left" }}>{children}</span>;
}
