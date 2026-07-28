/**
 * Núcleo PURO del módulo de precios (sin Prisma — lo importan cliente y server).
 *
 * Modelo: PERFILES (por colección) con FRANJAS MANUALES. Cada franja define su
 * costo USD; × dólar = costo ARS; + ganancia ($ fijo o % sobre el costo) y, por
 * gross-up, + impuestos/comisiones = PRECIO DE LISTA. Sumar los % "para
 * adelante" deja ganando menos de lo que se cree — eso es lo que evita el
 * gross-up. El PRECIO POR TRANSFERENCIA (lista − % del perfil) es informativo.
 *
 * Una franja puede apuntar a colecciones propias (scoping quirúrgico dentro del
 * perfil): esas ganan sobre las franjas generales para los productos de esas
 * colecciones.
 */

export type TaxComponent = {
  id: string;
  name: string;
  value: number;              // % (pctPrice/pctOnCommissions) o ARS (fixed)
  type: "pctPrice" | "pctOnCommissions" | "fixed";
  commission?: boolean;       // pctPrice: participa de la base de "sobre comisiones"
  enabled: boolean;
};

export type GainMode = "fixed" | "pct";

export type Tier = {
  id: string;
  costUsd: number;                 // costo USD de la franja (tope del band + base del cálculo)
  gainMode: GainMode;              // "fixed" (ARS) | "pct" (% sobre el costo ARS)
  gain: number;                    // ganancia fija ARS — modo "fixed"
  gainPct: number;                 // % sobre el costo — modo "pct"
  overridePrice: number | null;    // precio de lista pisado a mano (null = manda la fórmula)
  collectionIds: number[];         // [] = franja general del perfil; con ids = franja quirúrgica
};

export type InstallmentPlan = { label: string; coefPct: number; enabled: boolean };

export type PricingProfile = {
  id: string;
  name: string;
  collectionIds: number[];         // colecciones que rige el perfil ([] en el default = catch-all)
  isDefault?: boolean;
  dollar: number;                  // espejo del dólar global (para las funciones puras)
  dollarUpdatedAt: string | null;
  tiers: Tier[];
  taxes: TaxComponent[];
  installments: InstallmentPlan[];
  roundMultiple: number;           // redondeo comercial, SIEMPRE hacia arriba
  transferPct: number;             // % de descuento por transferencia (informativo)
};

export type PricingSettings = {
  dollar: number;
  dollarUpdatedAt: string | null;
  profiles: PricingProfile[];
};

export const DEFAULT_TAXES: TaxComponent[] = [
  { id: "tn", name: "Comisión TN", value: 2, type: "pctPrice", commission: true, enabled: true },
  { id: "mp", name: "Comisión MP", value: 6.3, type: "pctPrice", commission: true, enabled: true },
  { id: "iva", name: "IVA", value: 21, type: "pctOnCommissions", enabled: true },
];

function newId(prefix = "x"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ── Cálculo ──────────────────────────────────────────── */

/**
 * Tasa efectiva total que se descuenta del precio de venta:
 * Σ %-sobre-precio + (cada %-sobre-comisiones × Σ de los % marcados comisión).
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

/** Ganancia ARS de una franja según su modo ($ fijo o % sobre el costo ARS). */
export function tierGain(tier: Tier, dollar: number): number {
  return tier.gainMode === "pct" ? tier.costUsd * dollar * ((tier.gainPct || 0) / 100) : tier.gain;
}

/** Precio de lista de una franja (gross-up). */
export function computeTierPrice(tier: Tier, profile: PricingProfile): number {
  const rate = effectiveRate(profile.taxes);
  if (rate >= 1) return 0; // pila inválida (>100%) — la UI lo señala
  const net = tier.costUsd * profile.dollar + tierGain(tier, profile.dollar) + fixedCosts(profile.taxes);
  return roundUp(net / (1 - rate), profile.roundMultiple);
}

/** Precio por transferencia (informativo): lista − % del perfil, redondeado. */
export function transferPrice(listPrice: number, profile: PricingProfile): number {
  const pct = profile.transferPct || 0;
  if (pct <= 0) return listPrice;
  return roundUp(listPrice * (1 - pct / 100), profile.roundMultiple);
}

/**
 * Franja que rige a un producto dentro de un perfil: scoped-first. Entre las
 * franjas con colecciones que intersecten al producto, la de menor costo ≥ el
 * costo del producto; si ninguna, entre las generales igual criterio; sino null.
 */
export function tierForProduct(profile: PricingProfile, costUsd: number, categoryIds: number[]): Tier | null {
  if (!(costUsd > 0)) return null;
  const S = new Set(categoryIds);
  const scoped = profile.tiers.filter((t) => t.collectionIds.length && t.collectionIds.some((c) => S.has(c)));
  const general = profile.tiers.filter((t) => !t.collectionIds.length);
  return pickBand(scoped, costUsd) ?? pickBand(general, costUsd);
}

function pickBand(tiers: Tier[], costUsd: number): Tier | null {
  return [...tiers].sort((a, b) => a.costUsd - b.costUsd).find((t) => costUsd <= t.costUsd) ?? null;
}

/** Precio de lista para un costo USD dentro de un perfil (override o fórmula). */
export function priceForUsd(costUsd: number, profile: PricingProfile, categoryIds: number[]): number | null {
  if (!(costUsd > 0) || !(profile.dollar > 0)) return null;
  const tier = tierForProduct(profile, costUsd, categoryIds);
  if (!tier) return null; // fuera de rango — "sin posicionar"
  return tier.overridePrice ?? computeTierPrice(tier, profile);
}

/**
 * Vista de cuotas: vendiendo a `price` en este plan y absorbiendo el coeficiente,
 * cuánto queda limpio después de la pila (para comparar contra la ganancia
 * objetivo de la franja). costArs = costo de la franja × dólar.
 */
export function installmentNet(price: number, coefPct: number, costArs: number, profile: PricingProfile): number {
  const rate = effectiveRate(profile.taxes);
  return Math.round(price * (1 - rate - coefPct / 100) - fixedCosts(profile.taxes) - costArs);
}

/* ── Perfiles y settings ──────────────────────────────── */

export function profileForProduct(categoryIds: number[], s: PricingSettings): PricingProfile {
  const set = new Set(categoryIds);
  for (const p of s.profiles) {
    if (p.isDefault) continue;
    if (p.collectionIds.some((c) => set.has(c))) return p;
  }
  return s.profiles.find((p) => p.isDefault) ?? s.profiles[s.profiles.length - 1];
}

export function makeTier(costUsd = 0): Tier {
  return { id: newId("t"), costUsd, gainMode: "fixed", gain: 0, gainPct: 0, overridePrice: null, collectionIds: [] };
}

export function makeProfile(name: string): PricingProfile {
  return { id: newId("p"), name, collectionIds: [], dollar: 0, dollarUpdatedAt: null, tiers: [], taxes: DEFAULT_TAXES.map((t) => ({ ...t })), installments: [], roundMultiple: 500, transferPct: 0 };
}

/** Migra una franja de cualquier forma (vieja o nueva) al Tier actual. */
function migrateTier(raw: Record<string, unknown>): Tier {
  const costUsd = Number(raw.costUsd ?? raw.maxUsd ?? 0);
  return {
    id: typeof raw.id === "string" ? raw.id : newId("t"),
    costUsd: isNaN(costUsd) ? 0 : costUsd,
    gainMode: raw.gainMode === "pct" ? "pct" : "fixed",
    gain: Number(raw.gain) || 0,
    gainPct: Number(raw.gainPct) || 0,
    overridePrice: raw.overridePrice != null ? Number(raw.overridePrice) : (raw.overridePrimary != null ? Number(raw.overridePrimary) : null),
    collectionIds: Array.isArray(raw.collectionIds) ? (raw.collectionIds as unknown[]).map(Number).filter((n) => !isNaN(n)) : [],
  };
}

function migrateProfile(raw: Record<string, unknown>): PricingProfile {
  return {
    id: typeof raw.id === "string" ? raw.id : newId("p"),
    name: typeof raw.name === "string" ? raw.name : "Perfil",
    collectionIds: Array.isArray(raw.collectionIds) ? (raw.collectionIds as unknown[]).map(Number).filter((n) => !isNaN(n)) : [],
    isDefault: !!raw.isDefault,
    dollar: Number(raw.dollar) || 0,
    dollarUpdatedAt: (raw.dollarUpdatedAt as string) ?? null,
    tiers: Array.isArray(raw.tiers) ? (raw.tiers as Record<string, unknown>[]).map(migrateTier) : [],
    taxes: Array.isArray(raw.taxes) && raw.taxes.length ? (raw.taxes as TaxComponent[]) : DEFAULT_TAXES.map((t) => ({ ...t })),
    installments: Array.isArray(raw.installments) ? (raw.installments as InstallmentPlan[]) : [],
    roundMultiple: Number(raw.roundMultiple) || 500,
    transferPct: Number(raw.transferPct) || 0,
  };
}

/** Ordena las franjas por costo y limpia; no genera grilla automática. */
export function normalizeProfile(p: PricingProfile): PricingProfile {
  const tiers = [...p.tiers].sort((a, b) => a.costUsd - b.costUsd);
  return { ...p, tiers, collectionIds: Array.isArray(p.collectionIds) ? p.collectionIds : [] };
}

/**
 * Parsea Settings.pricing. Migración suave: perfiles nuevos/viejos, o la config
 * vieja de un solo nivel → perfil General. Nunca pierde el tuning del usuario.
 */
export function parsePricingSettings(json: string): PricingSettings {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(json || "{}"); } catch { raw = {}; }

  if (Array.isArray(raw.profiles)) {
    const profiles = (raw.profiles as Record<string, unknown>[]).map(migrateProfile);
    const dollar = typeof raw.dollar === "number" ? raw.dollar : (profiles[0]?.dollar ?? 0);
    return finalizeSettings({ dollar, dollarUpdatedAt: (raw.dollarUpdatedAt as string) ?? null, profiles });
  }

  // Config vieja de un solo nivel → perfil General.
  const general = migrateProfile({ ...raw, id: "general", name: "General", isDefault: true, collectionIds: [] });
  return finalizeSettings({ dollar: general.dollar, dollarUpdatedAt: general.dollarUpdatedAt, profiles: [general] });
}

/**
 * Invariantes: al menos un perfil, exactamente un isDefault (catch-all sin
 * colecciones), dólar global espejado en cada perfil.
 */
export function finalizeSettings(s: PricingSettings): PricingSettings {
  let profiles = s.profiles.length ? s.profiles : [makeProfile("General")];
  const hasDefault = profiles.some((p) => p.isDefault);
  let seen = false;
  profiles = profiles.map((p, i) => {
    const isDefault = hasDefault ? (!!p.isDefault && !seen ? (seen = true, true) : false) : i === profiles.length - 1;
    return { ...p, isDefault, collectionIds: isDefault ? [] : (Array.isArray(p.collectionIds) ? p.collectionIds : []), dollar: s.dollar, dollarUpdatedAt: s.dollarUpdatedAt };
  });
  if (!profiles.some((p) => p.isDefault)) profiles[profiles.length - 1].isDefault = true;
  return { dollar: s.dollar, dollarUpdatedAt: s.dollarUpdatedAt, profiles: profiles.map(normalizeProfile) };
}
