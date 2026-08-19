import { Prisma } from "@prisma/client";

/**
 * Segmentación de clientes (RFM simplificado) sobre las stats denormalizadas
 * (totalSpent, orderCount, lastOrderAt — ver Fase 0). Umbrales parametrizados:
 * cambiá estas constantes para ajustar los cortes al negocio.
 */
export const DORMANT_DAYS = 90;     // sin comprar hace N días → dormido / en riesgo
export const VIP_MIN_SPENT = 200000; // gasto total ≥ → VIP
export const VIP_MIN_ORDERS = 5;     // o cantidad de compras ≥ → VIP

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

/** Instante de corte para "dormido" (ahora − DORMANT_DAYS). */
export function dormantCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
}

/** Where-clause SQL de un segmento (mutuamente excluyentes). */
export function segmentWhere(seg: Segment, cutoff: Date): Prisma.CustomerWhereInput {
  switch (seg) {
    case "sin_compras":
      return { orderCount: 0 };
    case "dormido":
      return { orderCount: { gte: 1 }, lastOrderAt: { lt: cutoff } };
    case "vip":
      return {
        lastOrderAt: { gte: cutoff },
        OR: [{ totalSpent: { gte: VIP_MIN_SPENT } }, { orderCount: { gte: VIP_MIN_ORDERS } }],
      };
    case "recurrente":
      return {
        lastOrderAt: { gte: cutoff },
        orderCount: { gte: 2, lt: VIP_MIN_ORDERS },
        totalSpent: { lt: VIP_MIN_SPENT },
      };
    case "nuevo":
      return {
        lastOrderAt: { gte: cutoff },
        orderCount: 1,
        totalSpent: { lt: VIP_MIN_SPENT },
      };
  }
}

/** Clasifica un cliente (mismo criterio que segmentWhere, para el badge de la fila). */
export function segmentOf(c: { orderCount: number; totalSpent: number; lastOrderAt: Date | null }, cutoff: Date): Segment {
  if (c.orderCount === 0) return "sin_compras";
  const active = c.lastOrderAt != null && c.lastOrderAt.getTime() >= cutoff.getTime();
  if (!active) return "dormido";
  if (c.totalSpent >= VIP_MIN_SPENT || c.orderCount >= VIP_MIN_ORDERS) return "vip";
  if (c.orderCount >= 2) return "recurrente";
  return "nuevo";
}
