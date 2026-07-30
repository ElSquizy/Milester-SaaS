/**
 * Normaliza teléfonos argentinos a E.164 de celular (+549 + área + abonado).
 * Tienda Nube devuelve el número tal como lo tipeó el cliente, así que hay que
 * limpiar el 0 de área, el 15 de abonado y armar el formato de celular.
 *
 * Devuelve null (confianza "baja") si no se puede normalizar con seguridad —
 * nunca adivina.
 */
export type PhoneResult = { e164: string | null; confidence: "alta" | "media" | "baja" };

const fail: PhoneResult = { e164: null, confidence: "baja" };

export function normalizePhoneAR(raw: string | null | undefined): PhoneResult {
  if (!raw || typeof raw !== "string") return fail;

  const hadPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return fail;

  // Prefijo internacional: +54… o 0054… → sacar el 54 para quedarnos con lo nacional.
  if (hadPlus || digits.startsWith("00")) {
    digits = digits.replace(/^0+/, "");           // 0054 → 54
    if (digits.startsWith("54")) digits = digits.slice(2);
    else return { e164: null, confidence: "baja" }; // +XX extranjero → no es AR
  }

  // 9 de celular que a veces viene pegado tras el país (54 9 …).
  if (digits.startsWith("9")) digits = digits.slice(1);

  // 0 inicial del código de área (0342 → 342).
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  // "15" de abonado: aparece tras el código de área. Como el largo de área es
  // variable (2 a 4 dígitos), sólo lo removemos si al hacerlo quedan 10 dígitos
  // (área + abonado) — así no comemos un 15 que sea parte del número real.
  if (digits.includes("15")) {
    for (const areaLen of [2, 3, 4]) {
      if (digits.length > areaLen + 2 && digits.slice(areaLen, areaLen + 2) === "15") {
        const candidate = digits.slice(0, areaLen) + digits.slice(areaLen + 2);
        if (candidate.length === 10) { digits = candidate; break; }
      }
    }
  }

  // A esta altura esperamos 10 dígitos nacionales (área + abonado).
  if (digits.length !== 10) return { e164: null, confidence: "baja" };

  return { e164: `+549${digits}`, confidence: hadPlus ? "alta" : "media" };
}
