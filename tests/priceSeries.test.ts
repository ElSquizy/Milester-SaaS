import { describe, it, expect } from "vitest";
import { priceMoments, pctChange, type Change } from "../lib/priceSeries";

const DAY = 86400000;
const now = Date.now();
const iso = (d: number) => new Date(now - d * DAY).toISOString();

describe("pctChange", () => {
  it("calcula la variación, null cuando no aplica", () => {
    expect(pctChange(100, 125)).toBe(25);
    expect(pctChange(200, 150)).toBe(-25);
    expect(pctChange(100, 100)).toBeNull(); // sin cambio
    expect(pctChange(0, 100)).toBeNull();   // base <= 0
    expect(pctChange(null, 100)).toBeNull();
  });
});

describe("priceMoments", () => {
  it("ignora los campos que no son de precio", () => {
    const cs: Change[] = [{ field: "stock", oldValue: "3", newValue: "1", createdAt: iso(1) }];
    const m = priceMoments(cs, { price: 100, promotionalPrice: null, costUsd: null, costUsdPromo: null });
    expect(m.length).toBe(1);          // solo "Ahora"
    expect(m[0].now).toBe(true);
  });

  it("agrupa los cambios de un mismo guardado (<60s) en un momento", () => {
    const cs: Change[] = [
      { field: "price", oldValue: "100", newValue: "200", createdAt: iso(5) },
      { field: "promotionalPrice", oldValue: null, newValue: "150", createdAt: iso(5) },
    ];
    const m = priceMoments(cs, { price: 200, promotionalPrice: 150, costUsd: null, costUsdPromo: null });
    expect(m.length).toBe(2); // Ahora + 1 momento
    expect(Object.keys(m[1].changed).sort()).toEqual(["price", "promotionalPrice"]);
    expect(m[1].changed.price.pct).toBe(100);
    expect(m[1].changed.promotionalPrice.from).toBeNull(); // "nuevo"
  });

  it("colapsa re-logs con oldValue obsoleto (mismo valor neto) y oscilaciones", () => {
    // El valor real: base 100 → 200 (día 20), y un re-log redundante que dice
    // 100→200 otra vez (día 5) cuando ya valía 200 → no debe generar fila.
    const cs: Change[] = [
      { field: "price", oldValue: "100", newValue: "200", createdAt: iso(20) },
      { field: "price", oldValue: "100", newValue: "200", createdAt: iso(5) }, // stale/no-op
    ];
    const m = priceMoments(cs, { price: 200, promotionalPrice: null, costUsd: null, costUsdPromo: null });
    expect(m.length).toBe(2); // Ahora + un solo cambio real (no dos)
    expect(m[1].changed.price.from).toBe(100);
    expect(m[1].changed.price.to).toBe(200);
  });

  it("una oscilación que netea en el mismo valor no genera momento", () => {
    // promo 50 → 80 → 50 dentro de un guardado: neto sin cambio.
    const cs: Change[] = [
      { field: "promotionalPrice", oldValue: "50", newValue: "80", createdAt: new Date(now - 5 * DAY).toISOString() },
      { field: "promotionalPrice", oldValue: "80", newValue: "50", createdAt: new Date(now - 5 * DAY + 5000).toISOString() },
    ];
    const m = priceMoments(cs, { price: 100, promotionalPrice: 50, costUsd: null, costUsdPromo: null });
    expect(m.length).toBe(1); // solo "Ahora" — la oscilación neteó a nada
  });

  it("la fila Ahora refleja el valor actual del producto", () => {
    const m = priceMoments([], { price: 123, promotionalPrice: 45, costUsd: 10, costUsdPromo: null });
    expect(m[0].now).toBe(true);
    expect(m[0].values.price).toBe(123);
    expect(m[0].values.costUsd).toBe(10);
  });
});
