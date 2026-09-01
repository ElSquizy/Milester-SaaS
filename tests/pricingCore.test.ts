import { describe, it, expect } from "vitest";
import {
  effectiveRate, roundUp, tierGain, computeTierPrice, tierForProduct, priceForUsd,
  parsePricingSettings, finalizeSettings, profileForProduct, makeProfile, makeTier, DEFAULT_TAXES,
  type PricingProfile,
} from "../lib/pricingCore";

const profile = (over: Partial<PricingProfile> = {}): PricingProfile => ({ ...makeProfile("Test"), dollar: 1000, ...over });

describe("effectiveRate", () => {
  it("aplica IVA sobre las comisiones (gross-up correcto)", () => {
    // TN 2% + MP 6.3% (comisiones) + IVA 21% sobre esas → (8.3 + 0.21*8.3)/100
    expect(effectiveRate(DEFAULT_TAXES)).toBeCloseTo(0.10043, 5);
  });
  it("ignora impuestos deshabilitados", () => {
    expect(effectiveRate(DEFAULT_TAXES.map((t) => ({ ...t, enabled: false })))).toBe(0);
  });
});

describe("roundUp / tierGain", () => {
  it("redondea SIEMPRE hacia arriba", () => {
    expect(roundUp(16674, 500)).toBe(17000);
    expect(roundUp(17000, 500)).toBe(17000);
    expect(roundUp(17001, 500)).toBe(17500);
  });
  it("ganancia fija vs porcentual", () => {
    expect(tierGain({ ...makeTier(10), gainMode: "fixed", gain: 5000 }, 1000)).toBe(5000);
    expect(tierGain({ ...makeTier(10), gainMode: "pct", gainPct: 20 }, 1000)).toBe(2000); // 10*1000*0.2
  });
});

describe("computeTierPrice", () => {
  it("gross-up: costo + ganancia, dividido por (1 - tasa), redondeado", () => {
    // net = 10*1000 + 5000 = 15000 ; /(1-0.10043) = 16674.6 ; roundUp 500 → 17000
    const p = profile();
    const tier = { ...makeTier(10), gain: 5000 };
    expect(computeTierPrice(tier, p)).toBe(17000);
  });
  it("pila de impuestos > 100% devuelve 0 (inválida)", () => {
    const p = profile({ taxes: [{ id: "x", name: "x", value: 120, type: "pctPrice", enabled: true }] });
    expect(computeTierPrice({ ...makeTier(10), gain: 0 }, p)).toBe(0);
  });
});

describe("tierForProduct (scoped-first)", () => {
  const p = profile({ tiers: [
    { ...makeTier(20), collectionIds: [] },   // general
    { ...makeTier(15), collectionIds: [7] },  // quirúrgica (colección 7)
  ] });
  it("la franja scoped gana para productos de esa colección", () => {
    expect(tierForProduct(p, 10, [7])?.costUsd).toBe(15);
  });
  it("cae a la general si el producto no está en la colección scoped", () => {
    expect(tierForProduct(p, 10, [99])?.costUsd).toBe(20);
  });
  it("null si el costo supera todas las franjas (sin posicionar)", () => {
    expect(tierForProduct(p, 25, [7])).toBeNull();
  });
  it("elige la banda más chica que cubre el costo", () => {
    const q = profile({ tiers: [makeTier(10), makeTier(20), makeTier(30)] });
    expect(tierForProduct(q, 15, [])?.costUsd).toBe(20);
    expect(tierForProduct(q, 10, [])?.costUsd).toBe(10);
  });
});

describe("priceForUsd", () => {
  const p = profile({ tiers: [{ ...makeTier(10), gain: 5000 }] });
  it("null sin costo o sin dólar", () => {
    expect(priceForUsd(0, p, [])).toBeNull();
    expect(priceForUsd(10, profile({ dollar: 0, tiers: p.tiers }), [])).toBeNull();
  });
  it("calcula por fórmula", () => {
    expect(priceForUsd(10, p, [])).toBe(17000);
  });
  it("un overridePrice pisa la fórmula", () => {
    const q = profile({ tiers: [{ ...makeTier(10), overridePrice: 9999 }] });
    expect(priceForUsd(10, q, [])).toBe(9999);
  });
  it("fuera de rango → null", () => {
    expect(priceForUsd(50, p, [])).toBeNull();
  });
});

describe("settings: parse + invariantes", () => {
  it('config vacía "{}" crea un perfil default catch-all', () => {
    const s = parsePricingSettings("{}");
    expect(s.profiles.length).toBe(1);
    expect(s.profiles[0].isDefault).toBe(true);
    expect(s.profiles[0].collectionIds).toEqual([]);
  });
  it("finalizeSettings garantiza exactamente un isDefault", () => {
    const s = finalizeSettings({ dollar: 900, dollarUpdatedAt: null, profiles: [
      { ...makeProfile("A"), isDefault: true }, { ...makeProfile("B"), isDefault: true },
    ] });
    expect(s.profiles.filter((p) => p.isDefault).length).toBe(1);
    expect(s.profiles.every((p) => p.dollar === 900)).toBe(true); // dólar global espejado
  });
});

describe("profileForProduct", () => {
  const s = finalizeSettings({ dollar: 1000, dollarUpdatedAt: null, profiles: [
    { ...makeProfile("General"), isDefault: true },
    { ...makeProfile("PS5"), collectionIds: [7] },
  ] });
  it("elige el perfil cuya colección intersecta el producto", () => {
    expect(profileForProduct([7], s).name).toBe("PS5");
  });
  it("cae al default si ninguna colección matchea", () => {
    expect(profileForProduct([99], s).name).toBe("General");
  });
});
