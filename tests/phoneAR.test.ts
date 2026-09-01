import { describe, it, expect } from "vitest";
import { normalizePhoneAR } from "../lib/phoneAR";

describe("normalizePhoneAR", () => {
  it("normaliza los formatos AR habituales a E.164 de celular", () => {
    const E = "+5493424123456";
    expect(normalizePhoneAR("0342 154 123456").e164).toBe(E);   // 0 de área + 15 de abonado
    expect(normalizePhoneAR("342 15 4123456").e164).toBe(E);    // 15 separado
    expect(normalizePhoneAR("+54 9 342 4123456").e164).toBe(E); // internacional
    expect(normalizePhoneAR("3424123456").e164).toBe(E);        // 10 dígitos pelados
    expect(normalizePhoneAR("(0342) 4123456").e164).toBe(E);    // fijo con paréntesis
  });

  it("marca confianza alta cuando venía con +54", () => {
    expect(normalizePhoneAR("+54 9 342 4123456").confidence).toBe("alta");
    expect(normalizePhoneAR("3424123456").confidence).toBe("media");
  });

  it("no adivina: devuelve null/baja cuando no puede con seguridad", () => {
    expect(normalizePhoneAR("15 4123456")).toEqual({ e164: null, confidence: "baja" }); // sin área → ambiguo
    expect(normalizePhoneAR("")).toEqual({ e164: null, confidence: "baja" });
    expect(normalizePhoneAR(null)).toEqual({ e164: null, confidence: "baja" });
    expect(normalizePhoneAR("+1 555 123 4567").e164).toBeNull();  // extranjero
    expect(normalizePhoneAR("123").e164).toBeNull();              // muy corto
  });
});
