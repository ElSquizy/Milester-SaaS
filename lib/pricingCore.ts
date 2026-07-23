/**
 * Núcleo PURO del módulo de precios (sin Prisma — lo importan cliente y server).
 *
 * El negocio precifica por franjas de costo de a 5 USD: todo juego cuya
 * compra cae en la franja se vende al precio de la franja. El precio se
 * calcula con GROSS-UP: primero se define cuánto tiene que quedar limpio
 * (costo ARS + ganancia fija de la franja + costos fijos) y se divide por
 * (1 − tasa efectiva) para que, tras comisiones e impuestos, quede eso.
 * Sumar los % "para adelante" deja ganando menos de lo que se cree — ese es
 * el error silencioso del sheet que este módulo reemplaza.
 */

export type TaxComponent = {
  id: string;
  name: string;
  value: number;              // % (pctPrice/pctOnCommissions) o ARS (fixed)
  type: "pctPrice" | "pctOnCommissions" | "fixed";
  commission?: boolean;       // pctPrice: participa de la base de "sobre comisiones"
  enabled: boolean;
};

export type Tier = {
  maxUsd: number;             // tope de la franja (la 10–15 tiene maxUsd 15)
  gain: number;               // ganancia fija ARS deseada (primaria)
  gainSec: number;            // ganancia fija ARS deseada (secundaria)
  overridePrimary: number | null; // precio de lista pisado a mano (null = manda la fórmula)
  overrideSec: number | null;
};

export type InstallmentPlan = { label: string; coefPct: number; enabled: boolean };

export type PricingConfig = {
  dollar: number;
  dollarUpdatedAt: string | null;
  tierSize: number;           // ancho de franja en USD
  maxUsd: number;             // última franja generada
  tiers: Tier[];
  taxes: TaxComponent[];
  installments: InstallmentPlan[];
  roundMultiple: number;      // redondeo comercial, SIEMPRE hacia arriba
  secondaryMatch: string;     // "SECUNDARIA" — detección por nombre
};

export const DEFAULT_PRICING: PricingConfig = {
  dollar: 0,
  dollarUpdatedAt: null,
  tierSize: 5,
  maxUsd: 100,
  tiers: [],
  taxes: [
    { id: "tn", name: "Comisión TN", value: 2, type: "pctPrice", commission: true, enabled: true },
    { id: "mp", name: "Comisión MP", value: 6.3, type: "pctPrice", commission: true, enabled: true },
    { id: "iva", name: "IVA", value: 21, type: "pctOnCommissions", enabled: true },
  ],
  installments: [],
  roundMultiple: 500,
  secondaryMatch: "SECUNDARIA",
};

export function parsePricingConfig(json: string): PricingConfig {
  let raw: Partial<PricingConfig> = {};
  try { raw = JSON.parse(json || "{}"); } catch { raw = {}; }
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING,
    ...raw,
    tiers: Array.isArray(raw.tiers) ? raw.tiers : [],
    taxes: Array.isArray(raw.taxes) && raw.taxes.length ? raw.taxes : DEFAULT_PRICING.taxes,
    installments: Array.isArray(raw.installments) ? raw.installments : [],
  };
  return normalizeTiers(cfg);
}

/** Genera/completa las franjas (0–tierSize … maxUsd) preservando las existentes. */
export function normalizeTiers(cfg: PricingConfig): PricingConfig {
  const size = cfg.tierSize > 0 ? cfg.tierSize : 5;
  const max = cfg.maxUsd > 0 ? cfg.maxUsd : 100;
  const byMax = new Map(cfg.tiers.map((t) => [t.maxUsd, t]));
  const tiers: Tier[] = [];
  for (let top = size; top <= max; top += size) {
    tiers.push(byMax.get(top) ?? { maxUsd: top, gain: 0, gainSec: 0, overridePrimary: null, overrideSec: null });
  }
  return { ...cfg, tierSize: size, maxUsd: max, tiers };
}

/**
 * Tasa efectiva total que se descuenta del precio de venta:
 * Σ %-sobre-precio + (cada %-sobre-comisiones × Σ de los % marcados comisión).
 * Ej: TN 2% + MP 6,3% (comisiones) + IVA 21% s/comisiones + IIBB 3,5%
 *   = 2 + 6,3 + 3,5 + 21%×(2+6,3) = 13,543%.
 */
export function effectiveRate(taxes: TaxComponent[]): number {
  const on = taxes.filter((t) => t.enabled);
  const pctPrice = on.filter((t) => t.type === "pctPrice");
  const sumPct = pctPrice.reduce((s, t) => s + t.value, 0);
  const sumCommissions = pctPrice.filter((t) => t.commission).reduce((s, t) => s + t.value, 0);
  const overCommissions = on.filter((t) => t.type === "pctOnCommissions").reduce((s, t) => s + t.value, 0);
  return (sumPct + (overCommissions / 100) * sumCommissions) / 100;
}

export function fixedCosts(taxes: TaxComponent[]): number {
  return taxes.filter((t) => t.enabled && t.type === "fixed").reduce((s, t) => s + t.value, 0);
}

/** Redondeo comercial: SIEMPRE hacia arriba (para abajo se come la ganancia). */
export function roundUp(price: number, multiple: number): number {
  const m = multiple > 0 ? multiple : 500;
  return Math.ceil(price / m) * m;
}

/** Precio de lista para una franja: gross-up con el TOPE de la franja. */
export function computeTierPrice(tier: Tier, kind: "primary" | "secondary", cfg: PricingConfig): number {
  const rate = effectiveRate(cfg.taxes);
  if (rate >= 1) return 0; // pila inválida (>100%) — la UI lo señala
  const gain = kind === "primary" ? tier.gain : tier.gainSec;
  const net = tier.maxUsd * cfg.dollar + gain + fixedCosts(cfg.taxes);
  return roundUp(net / (1 - rate), cfg.roundMultiple);
}

export function tierFor(usd: number, cfg: PricingConfig): Tier | null {
  return cfg.tiers.find((t) => usd <= t.maxUsd) ?? null;
}

/** Precio vigente para un costo USD: override manual de la franja o el calculado. */
export function priceForUsd(usd: number, kind: "primary" | "secondary", cfg: PricingConfig): number | null {
  if (!(usd > 0) || !(cfg.dollar > 0)) return null;
  const tier = tierFor(usd, cfg);
  if (!tier) return null; // fuera de rango — "sin posicionar"
  const override = kind === "primary" ? tier.overridePrimary : tier.overrideSec;
  return override ?? computeTierPrice(tier, kind, cfg);
}

export function isSecondary(name: string, cfg: PricingConfig): boolean {
  const m = (cfg.secondaryMatch || "").trim().toUpperCase();
  return !!m && name.toUpperCase().includes(m);
}

/**
 * Vista de cuotas: vendiendo a `price` en este plan y absorbiendo el coeficiente,
 * cuánto queda limpio después de la pila (para comparar contra la ganancia
 * objetivo de la franja). costArs = tope de franja × dólar.
 */
export function installmentNet(price: number, coefPct: number, costArs: number, cfg: PricingConfig): number {
  const rate = effectiveRate(cfg.taxes);
  return Math.round(price * (1 - rate - coefPct / 100) - fixedCosts(cfg.taxes) - costArs);
}
