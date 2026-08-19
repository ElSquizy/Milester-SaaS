import { Prisma } from "@prisma/client";

/**
 * Segmentación de clientes (RFM simplificado) sobre las stats denormalizadas
 * (totalSpent, orderCount, lastOrderAt — ver Fase 0). Umbrales parametrizados:
 * cambiá estas constantes para ajustar los cortes al negocio.
 */
/** Umbrales editables por el usuario (persistidos en Settings.segmentConfig). */
export type SegmentConfig = { dormantDays: number; vipMinSpent: number; vipMinOrders: number };
export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = { dormantDays: 90, vipMinSpent: 200000, vipMinOrders: 5 };

/** Parsea + saneala config desde el JSON de Settings (merge con defaults, valores válidos). */
export function parseSegmentConfig(json: string | null | undefined): SegmentConfig {
  let raw: Partial<SegmentConfig> = {};
  try { raw = JSON.parse(json || "{}"); } catch { /* usa defaults */ }
  const num = (v: unknown, def: number, min: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? Math.round(n) : def;
  };
  return {
    dormantDays: num(raw.dormantDays, DEFAULT_SEGMENT_CONFIG.dormantDays, 1),
    vipMinSpent: num(raw.vipMinSpent, DEFAULT_SEGMENT_CONFIG.vipMinSpent, 0),
    vipMinOrders: num(raw.vipMinOrders, DEFAULT_SEGMENT_CONFIG.vipMinOrders, 1),
  };
}

export const SEGMENTS = ["vip", "recurrente", "nuevo", "dormido", "sin_compras"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  vip: "VIP",
  recurrente: "Recurrente",
  nuevo: "Nuevo",
  dormido: "Dormido",
  sin_compras: "Sin compras",
};

/** Color por segmento (tokens del sistema), para chips y badges. */
export const SEGMENT_TONE: Record<Segment, { fg: string; bg: string }> = {
  vip: { fg: "var(--color-brand)", bg: "var(--color-brand-light)" },
  recurrente: { fg: "var(--color-success)", bg: "var(--color-success-bg)" },
  nuevo: { fg: "var(--color-info)", bg: "var(--color-info-bg)" },
  dormido: { fg: "var(--color-warning)", bg: "var(--color-warning-bg)" },
  sin_compras: { fg: "var(--color-subtle)", bg: "var(--color-surface-2)" },
};

/** Instante de corte para "dormido" (ahora − dormantDays). */
export function dormantCutoff(cfg: SegmentConfig, now = new Date()): Date {
  return new Date(now.getTime() - cfg.dormantDays * 24 * 60 * 60 * 1000);
}

/** Where-clause SQL de un segmento (mutuamente excluyentes). */
export function segmentWhere(seg: Segment, cutoff: Date, cfg: SegmentConfig): Prisma.CustomerWhereInput {
  switch (seg) {
    case "sin_compras":
      return { orderCount: 0 };
    case "dormido":
      return { orderCount: { gte: 1 }, lastOrderAt: { lt: cutoff } };
    case "vip":
      return {
        lastOrderAt: { gte: cutoff },
        OR: [{ totalSpent: { gte: cfg.vipMinSpent } }, { orderCount: { gte: cfg.vipMinOrders } }],
      };
    case "recurrente":
      return {
        lastOrderAt: { gte: cutoff },
        orderCount: { gte: 2, lt: cfg.vipMinOrders },
        totalSpent: { lt: cfg.vipMinSpent },
      };
    case "nuevo":
      return {
        lastOrderAt: { gte: cutoff },
        orderCount: 1,
        totalSpent: { lt: cfg.vipMinSpent },
      };
  }
}

/** Clasifica un cliente (mismo criterio que segmentWhere, para el badge de la fila). */
export function segmentOf(c: { orderCount: number; totalSpent: number; lastOrderAt: Date | null }, cutoff: Date, cfg: SegmentConfig): Segment {
  if (c.orderCount === 0) return "sin_compras";
  const active = c.lastOrderAt != null && c.lastOrderAt.getTime() >= cutoff.getTime();
  if (!active) return "dormido";
  if (c.totalSpent >= cfg.vipMinSpent || c.orderCount >= cfg.vipMinOrders) return "vip";
  if (c.orderCount >= 2) return "recurrente";
  return "nuevo";
}
