/**
 * Logging estructurado mínimo, sin dependencias. Emite JSON a la consola, que en
 * Vercel queda en el stream de logs de la función — así los fallos de los jobs de
 * fondo (cron, pull, campañas) dejan rastro en vez de perderse en silencio.
 *
 * No es un APM: es el piso de observabilidad. Si más adelante se suma Sentry u
 * otro, se cambia acá adentro sin tocar los call sites.
 */
type Meta = Record<string, unknown>;

export function logError(scope: string, err: unknown, meta?: Meta): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: "error", scope, message, ...meta, ts: new Date().toISOString() }));
  if (err instanceof Error && err.stack) console.error(err.stack);
}

export function logWarn(scope: string, message: string, meta?: Meta): void {
  console.warn(JSON.stringify({ level: "warn", scope, message, ...meta, ts: new Date().toISOString() }));
}

export function logInfo(scope: string, message: string, meta?: Meta): void {
  console.log(JSON.stringify({ level: "info", scope, message, ...meta, ts: new Date().toISOString() }));
}
