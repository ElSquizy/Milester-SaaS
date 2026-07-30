import { prisma } from "./prisma";

/**
 * Estado de salud de la API de Tienda Nube. Milester falla en silencio si el
 * token se revoca (401) o la suscripción queda impaga (402) — esto lo detecta y
 * lo persiste en Settings para mostrar un banner de reconexión.
 */
export type TnApiError = "unauthorized" | "payment_required";

function statusOf(err: unknown): number | undefined {
  const e = err as { response?: { status?: number }; status?: number } | undefined;
  return e?.response?.status ?? e?.status;
}

/** Registra un 401/402 (ignora el resto). Devuelve el código mapeado o null. */
export async function recordTnError(err: unknown): Promise<TnApiError | null> {
  const s = statusOf(err);
  const mapped: TnApiError | null = s === 401 ? "unauthorized" : s === 402 ? "payment_required" : null;
  if (!mapped) return null;
  const row = await prisma.settings.findFirst({ select: { id: true, tnApiError: true } });
  if (row && row.tnApiError !== mapped) {
    await prisma.settings.update({ where: { id: row.id }, data: { tnApiError: mapped, tnApiErrorAt: new Date() } });
  }
  return mapped;
}

/** Limpia el estado de error tras una operación exitosa contra TN. */
export async function clearTnError(): Promise<void> {
  const row = await prisma.settings.findFirst({ select: { id: true, tnApiError: true } });
  if (row?.tnApiError) {
    await prisma.settings.update({ where: { id: row.id }, data: { tnApiError: null, tnApiErrorAt: null } });
  }
}
