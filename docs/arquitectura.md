# Arquitectura de Milester

**Documento final de la migración (FASE 10).** Actualizado: 2026-07-19.
Complementa: [auditoria-arquitectura.md](auditoria-arquitectura.md) (el porqué) y [plan-migracion.md](plan-migracion.md) (las decisiones).

## 1. Arquitectura

```
   TIENDA NUBE  ←– fuente de verdad comercial
        ↑ push (staging revisado)      ↓ pull (cron + navegación)
   ┌─────────────────────────────────────────────┐
   │  APLICACIÓN (Next.js 16 en Vercel, cle1)    │
   │                                             │
   │  Turso (aws-us-east-2, misma región)        │
   │  ├─ ESPEJO comercial  → caché+staging,      │
   │  │  reconstruible desde TN                  │
   │  └─ DATOS PROPIOS     → irreconstruibles,   │
   │     con backup                              │
   └─────────────────────────────────────────────┘
```

No hay dos bases: espejo y datos propios conviven en Turso, algunas veces **en la
misma tabla** (ver §3). La distinción es de *propiedad del dato*, no de motor.

## 2. Fuente de verdad por tipo de dato

| Dato | Fuente de verdad | Local es… |
|---|---|---|
| Productos, precios, stock, SKU, variantes, colecciones, imágenes, descripciones, visibilidad | **Tienda Nube** | espejo reconstruible |
| Órdenes web y sus clientes | **Tienda Nube** | espejo reconstruible |
| Campañas (+snapshots de precio original), plantillas, changelog, settings, proveedores IA | **Base propia** | único origen — backup |
| Tickets manuales (`Order.source="local"`) y clientes locales | **Base propia** | único origen — backup |
| `Product.costUsd`, plantillas aplicadas, `productImageUrl`, `OrderItem.costUsd` | **Base propia** (columnas dentro de tablas espejo) | único origen — backup |
| `unitsSold`, `lastSoldAt`, `IncomingChange` | Derivados | se recalculan solos |

## 3. Las tablas espejo son MIXTAS

`Product`, `Order`, `OrderItem` y `Customer` mezclan columnas-espejo con
columnas-propias. Regla operativa: **nunca "resetear" estas tablas a mano** —
la reconstrucción (§5) y el restore (§6) saben preservar/re-unir lo propio vía
`tiendaNubeId`; un `DELETE` manual no.

## 4. Sincronización

**Entrante (pull):** cron (GitHub Actions → `GET /api/cron`, guardado por
`CRON_SECRET`) + al navegar (Sidebar → `/api/sync/pull`, con throttle en el
servidor). Upsert por `tiendaNubeId`; **solo escribe campos-espejo**, jamás los
propios. Saltea productos con `syncStatus` `modified`/`error` para no pisar el
staging.

**Saliente (push, staging):** editar marca `syncStatus="modified"` y registra
changelog. El botón **"Subir N cambios"** empuja por lotes de 20 (SSE, con
pausas por el rate limit de TN); al terminar muestra el **sumario** de lo
creado/actualizado/eliminado. Errores quedan en `syncStatus="error"` con su
botón de reintento. Las **imágenes** viajan en un paso aparte del push (la API
de TN las maneja en su propio endpoint) y se marcan con `imageDirty`.

**Webhooks: no hay.** Todo es pull. Si TN cambia algo, se ve en el próximo pull
(≈1 h por cron, o al navegar). `IncomingChange` acumula diffs para revisión.

## 5. Reconstrucción (base propia perdida o vacía)

Orden estricto — el restore necesita que el espejo exista primero:

```
1. Nueva base Turso vacía + credenciales en .env
2. npx prisma migrate deploy               ← esquema
3. Configurar credenciales TN (fila Settings o restore del backup, paso 4)
4. node scripts/restore.mjs --file <backup> --apply   ← datos propios, parte A*
5. Pull COMPLETO:  levantar `npm run dev` local y llamar
      GET /api/cron?secret=<CRON_SECRET>&full=1
   `full=1` recorre TODO el catálogo y TODO el historial de órdenes
   (sin él, una base vacía solo vería 30 días de ventas). Corre local:
   tarda minutos y excede el límite de la función en Vercel.
6. node scripts/restore.mjs --file <backup> --apply   ← re-une columnas propias
   (costUsd, plantillas aplicadas, fusiones de clientes) por tiendaNubeId
7. Verificar: Inicio carga, conteos razonables, "Todo sincronizado".
```

\* El restore es seguro de correr dos veces: las tablas propias solo se
restauran si están vacías, y las columnas re-unidas son idempotentes. En la
práctica: correrlo tras el paso 3 restaura Settings/campañas/plantillas;
tras el paso 5, re-une lo que referencia al espejo.

**Limitación conocida:** referencias a productos/clientes que ya no existen en
TN se saltan y se reportan (nunca se inserta un FK colgante). Campañas cuyos
productos desaparecieron pierden esos ítems.

## 6. Backups

- **Qué:** solo los datos propios (§2). El espejo no se respalda — se
  reconstruye. El backup incluye mapas `id→tiendaNubeId` para poder traducir
  claves foráneas sobre una base reconstruida.
- **Manual:** `node scripts/backup.mjs` → `backups/backup-<fecha>.json`.
- **Automático:** `.github/workflows/backup.yml`, lunes 06:00 UTC → artifact de
  GitHub (90 días). Requiere secrets de repo `TURSO_DATABASE_URL` y
  `TURSO_AUTH_TOKEN`.
- ⚠️ El archivo contiene las credenciales de `Settings` (token TN, client
  secret, API keys de IA). `backups/` está en `.gitignore`; el repo debe seguir
  privado.

## 7. Campañas y restauración de precios

`CampaignItem` guarda el snapshot de `originalPrice` y `variantPrices` **al
aplicar** la campaña. Al terminarla (manual o por fecha vía cron →
`tickCampaigns`), se restaura desde el snapshot — con traspaso si otra campaña
activa cubre el mismo producto. Los ítems se conservan tras terminar (son el
historial para analíticas). Esto cumple el requisito del plan: nunca se pierde
el precio original.

## 8. Seguridad

- Token TN y secretos viven en `Settings` (BD) y solo se usan del lado servidor
  (`lib/`); nada llega al cliente.
- Autenticación: contraseña única (`MILESTER_PASSWORD`) vía `proxy.ts` +
  cookie; `MILESTER_ENABLED=false` = modo mantenimiento. Sin usuarios/roles
  (operador único).
- `/api/cron` es la única ruta que bypasea el login; la guarda `CRON_SECRET`.
- Pendientes conocidos (auditoría §5): `AiProvider.apiKey` y
  `Settings.clientSecret` en texto plano en la BD.

## 9. Vercel

- Región fijada en `vercel.json`: `cle1` (co-ubicada con Turso en Ohio).
- Variables de entorno requeridas: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  `MILESTER_PASSWORD`, `CRON_SECRET`, `APP_URL`; opcional `MILESTER_ENABLED`.
- Sin filesystem persistente: nada se escribe a disco en runtime (las imágenes
  se componen en memoria y van a TN como adjunto).
- `maxDuration: 60` en las rutas pesadas; por eso la reconstrucción full corre
  local, no desplegada.

## 10. Tareas programadas

| Workflow | Cadencia | Hace |
|---|---|---|
| `cron.yml` | cada 10 min nominal (~1 h real: GitHub throttlea) | `GET /api/cron` → tick de campañas + pull incremental |
| `backup.yml` | lunes 06:00 UTC | export de datos propios → artifact |

Para cadencia real de 10 min, un cron externo (cron-job.org) contra el mismo
endpoint; el de GitHub queda de respaldo.

## 11. Limitaciones conocidas

1. **TN no acepta activar stock ilimitado en productos existentes** (solo al
   crear); la UI lo advierte.
2. **Rate limit de TN**: el push pausa entre productos y reintenta 429/5xx con
   backoff; lotes de 20.
3. **Sin webhooks**: la frescura entrante depende del pull (≤1 h desatendido).
4. **Turso vía HTTP**: los `PRAGMA` no persisten entre sentencias — cualquier
   migración con rebuild de tablas necesita backup previo (lección aprendida:
   incidente OrderItem) y preferir `ALTER TABLE`/`CREATE INDEX` sueltos.
5. **Cuota de lecturas de Turso**: tras la dieta (índices, un solo scan en
   Inicio, refresh por evento) el consumo es ~10-100× menor; si reaparece el
   bloqueo, revisar qué nueva superficie está leyendo de más antes de pagar.
6. Restore: referencias a entidades que ya no existen en TN se degradan o se
   saltan (reportadas), no se reconstruyen.
