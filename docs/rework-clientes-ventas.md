# Plan — Analítica + Rework de Clientes y Ventas

Estado: aprobado (plan), sin implementar. Orden recomendado abajo.

## Contexto

Las vistas de **Ventas** (`/sales`) y **Clientes** (`/customers`) hoy son listas
transaccionales, sin analítica ni segmentación. El módulo `/metrics` ya cubre el
análisis general (KPIs, evolución, top productos, canal, proyección, sugerencias).
Este plan las reformula y suma la analítica Tier 1 detectada en la auditoría de datos.

### Hallazgo técnico que define la viabilidad

`app/customers/page.tsx` calcula el gasto por cliente con un `order.groupBy` sobre
**todos** los pedidos en cada carga y mapea en memoria. Consecuencias:
1. No se puede ordenar/paginar por LTV / última compra / frecuencia (son valores
   calculados después de traer la página).
2. Costo de Turso creciente (ya hubo blowouts de cuota).

Por eso el habilitador del rework de Clientes es **denormalizar stats en `Customer`**.

## Cobertura de datos (auditoría, 1.596 pedidos / 1.819 ítems)

- `customerId` 100%, `variantName` 95%, `channel`/`status` 100%, `discount>0` 77%.
- `paymentMethod` 99% pero 45% "not-provided" + etiquetas duplicadas (sucio).
- `paidAt` 23% (tiempo-hasta-pago pobre), `province` 19% (geografía floja).
- `costUsd` en ítems 8/1819 y `exchangeRate` 1/1596 → **margen real NO viable**
  (solo estimado con costo actual + dólar global; snapshot a futuro si se quiere el real).

---

## Fase 0 — Cimiento de datos (va PRIMERO)

- Denormalizar en `Customer`: `lastOrderAt`, `orderCount`, `totalSpent`
  (migración aditiva a Turso, patrón `Product.unitsSold/lastSoldAt`).
- Poblarlas en el sync de ventas (`salesSync`) al upsert de órdenes; excluir
  canceladas de forma consistente.
- Backfill una vez con script sobre pedidos existentes.

## Fase 1 — Rework de Ventas (bajo riesgo, win rápido)

- Franja resumen del filtro actual (facturado, ticket promedio, nº ventas) vía `aggregate`.
- Filtro por rango de fechas (reusar `resolveRange` de `lib/metrics`).
- Filtros por origen (web/local) y estado (ya existe). Medio de pago opcional (caveat etiquetas).
- Mantener operacional (lista + panel lateral). No duplicar `/metrics`.

## Fase 2 — Rework de Clientes (mayor valor; usa Fase 0)

- Orden server-side + paginación por LTV, última compra, frecuencia.
- Segmentos (RFM simplificado): Nuevo · Recurrente · VIP · Dormido/En riesgo,
  con chips de conteo y filtro por segmento. Umbrales = decisión de negocio.
- Lista de reactivación: dormidos con `phoneE164` → botón WhatsApp por cliente
  (nunca envío automático).
- Conservar detección de duplicados y detalle expandible actuales.

## Fase 3 — Analítica Tier 1 en `/metrics`

- Clientes/retención: nuevos vs. recurrentes, curva de recompra (aprovecha Fase 0).
- Ventas por plataforma/tipo (`variantName`).
- Ventas por colección/categoría.

## Fase 4 — Tier 2 (después)

- Heatmap día×hora · efectividad de campañas · embudo/cancelaciones.

## Decisiones abiertas

1. Umbrales de segmento (VIP, dormido, etc.).
2. Normalización de etiquetas de medio de pago (si se quiere ese filtro).
3. Snapshot de `costUsd`/`exchangeRate` a futuro para márgenes reales.

## Orden recomendado

Fase 0 → Fase 1 (Ventas) → Fase 2 (Clientes) → Fase 3 (analítica).
Cada fase es enviable y verificable por separado.
