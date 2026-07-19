# Plan técnico — FASE 3 (aprobado)

Decisiones del usuario (2026-07-19):
1. **Staging se conserva** — y al terminar cada sincronización se muestra un **sumario** de lo cambiado/agregado.
2. **Turso se mantiene** — la solución es la dieta de lecturas, no cambiar de motor.
3. **Limpieza total del legacy** (sistema Promotion + editor `/products*` viejo).

Con esto, la "migración" se reduce a cuatro workstreams concretos. La arquitectura
declarada queda: **TN = fuente de verdad comercial · espejo local = caché+staging
reconstruible · base propia = campañas/plantillas/historial/config/tickets.**

## A. Dieta de lecturas (causa raíz del bloqueo de cuota)

| Cambio | Efecto |
|---|---|
| Eliminar el polling de 10 s del Sidebar → refresco por evento (tras editar/pushear/pull) + focus con throttle de 60 s | Elimina ~5,5 M filas/día por pestaña |
| Índices `Product(syncStatus)` y `Product(pendingDelete)` | Los counts de pendientes pasan de escanear 1.912 filas a leer solo las coincidentes (normalmente 0-5) |
| Unificar los 7 counts de productos de Inicio en **una** consulta `COUNT(*) FILTER` | 7 escaneos → 1 por carga |
| (Pendiente evaluar) unificar los agregados KPI de Order | 2 escaneos → 1 |

## B. Sumario post-sincronización (pedido del usuario)

- `syncOneProduct` devuelve `{ created, fields }` leyendo los campos del changelog
  aún no sincronizados antes de marcarlos.
- La ruta SSE `/api/sync` acumula `{ id, name, action, fields }` por producto y lo
  incluye en el evento `done`.
- El Sidebar junta los sumarios de todos los lotes y al terminar muestra una
  tarjeta con el detalle (creado / campos actualizados / eliminado / imagen).

## C. Limpieza legacy (confirmada)

Eliminar: `model Promotion` (+relación en Product), `lib/promotions.ts`,
`/api/promotions`, `/api/check-promotions`, `components/PromotionChecker.tsx`,
páginas `/products`, `/products/new`, `/products/[id]`, y los componentes del
editor viejo (`ProductsView`, `ProductsTable`, `ProductGrid`, `ProductForm`,
`components/ProductPanel.tsx`). Se conservan `/api/products` y
`/api/products/[id]` (la app nueva los usa) quitando solo los `include: promotion`.
La lógica `originalPrice` de `updateProduct` pierde la condición `!existing.promotion`
(siempre era null desde que Campañas reemplazó al sistema viejo).

**Migración de BD:** `CREATE INDEX` ×2 + `DROP TABLE Promotion` — sentencias
individuales seguras en Turso (sin rebuild de tablas; lección aprendida del
incidente OrderItem). Las escrituras están permitidas pese al bloqueo de lecturas.

## D. Resiliencia y backups (fase siguiente, no en este lote)

- Comando de reconstrucción: pull completo TN + re-join de columnas propias por
  `tiendaNubeId` + regenerar `unitsSold`/`lastSoldAt`.
- Backup periódico de los datos clase B (campañas, plantillas, settings, tickets,
  `costUsd`, changelog) — hoy no existe.
- Documentación final (FASE 10 del plan original).

## Verificación

Con las lecturas de Turso bloqueadas, la verificación en vivo se hace contra la
base local de dev (`prisma/dev.db`, fallback automático sin vars `TURSO_`).
El sumario post-sync requiere un push real a TN → queda verificado por tipos y
revisión, y se prueba en vivo cuando la cuota se restablezca. **No se hace ningún
push a TN desde la base de dev** (espejo desalineado).
