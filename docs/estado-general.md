# Milester — Estado general (2026-08-20)

Panorama del proyecto: qué es, qué se construyó, qué queda pendiente y qué ideas
se descartaron. Complementa `docs/rework-clientes-ventas.md` (plan Fases 0-4).

## Qué es la app

Gestor propio sobre **Tienda Nube** para una tienda de juegos (PS4/PS5,
primarias/secundarias) con lógica de negocio propia. Stack: **Next 16 (App Router,
Turbopack) + Prisma 7.8 + Turso (SQLite) en Vercel**. Sync por **polling** (no
webhooks): entrada TN→SaaS automática al navegar, salida SaaS→TN por botón.
Secciones: Inicio · Catálogo · Plantillas · Colecciones · Precios · Campañas ·
Ventas · Métricas · Clientes · Actividad · Configuración. ~65 rutas API, 20 modelos.

## Construido recientemente (todo en `main`, verificado con datos reales)

**Robustez / datos**
- Teléfono E.164 (AR) + link WhatsApp; backfill 943/958.
- Detección de app caída (401/402) con banner de reconexión.

**Plantillas de imagen**
- Slot del producto configurable por plantilla.
- Recorte lateral de la imagen (franja central).

**Catálogo / Campañas**
- Orden por costo USD promocional.
- Confirmar salida del wizard de campañas.
- Importar productos desde una lista pegada (matcher recall-first + revisión).
- Agregar productos a una campaña por costos ya lanzada.

**Analítica + Rework (Fases 0-4)** — ver `docs/rework-clientes-ventas.md`.
- Fase 0: stats denormalizadas del cliente (LTV/recencia/frecuencia).
- Fase 1: Ventas con resumen + filtros fecha/origen.
- Fase 2: Clientes con segmentos RFM, orden, reactivación, umbrales editables.
- Fase 3-4: /metrics con retención, plataforma/tipo, colección, heatmap día×hora,
  embudo/cancelación, efectividad de campañas.

## Pendientes / deuda conocida

| Tema | Estado | Nota |
|---|---|---|
| Márgenes reales | Bloqueado | costUsd 8/1819, exchangeRate 1/1596 sin poblar. Requiere snapshotear en cada venta (solo hacia adelante). Mayor valor faltante. |
| Prellenar costo USD desde la lista | No hecho | "Punto 3" del importador de campañas. |
| Filtro medio de pago | No hecho | Etiquetas sucias (45% "not-provided"). Necesita normalización. |
| "Por tipo" / "Por colección" | Con caveats | "Otro" domina en tipo; colección usa categoryName principal. |
| Tests automatizados | Ausentes | Solo tsc + verificación manual. |

## Ideas descartadas / aparcadas

- De la spec del compañero (solo analizada): webhooks, cola, contrato de salida,
  carritos abandonados, cupones — descartadas (reinstalación/scopes u otra app).
- Geografía de ventas (provincia 19%), tiempo-hasta-pago (paidAt 23%), envío vs
  retiro (99,6% envío) — bajo valor por cobertura/degeneración.
- Margen estimado (dólar global + costo actual) — alternativa nunca construida.
- Desglose por todas las colecciones de cada producto — query más pesado.

## Salud técnica

1. **`/metrics` es pesado**: ~7 funciones de agregación por carga, force-dynamic.
   Vigilar quota de Turso o cachear si el uso crece.
2. **Migración manual frágil**: el split por `;` comió columnas dos veces. Usar
   un ALTER por statement, sin comentario pegado.
3. Limitación de entorno: la UI no se pudo accionar en vivo (pane sin frames);
   verificación por endpoint + DOM + tsc. Conviene una pasada visual manual.

## Auditoría del plan "nifty-crane" (2026-08-20)

Plan viejo (`Refinamiento de vistas: sync centralizado, catálogo quirúrgico,
colecciones CRUD, campañas activas editables, Actividad con calendario`).
El archivo del plan ya no está en disco; se auditaron sus features contra el código.

| Feature del plan | Estado | Evidencia |
|---|---|---|
| **1. Sync centralizado** (entrada auto + 1 botón en Config; salida 1 botón sidebar; quitar botones dispersos) | ✅ Hecho | Settings usa `/api/sync/pull`; `SyncButton.tsx` ya no se renderiza en el catálogo. |
| **2. Catálogo quirúrgico** (editar nombre/stock inline, filtros tri-estado, orden "más antiguos") | ✅ Hecho | `NameCell`/`StockCell` en `ProductTable`; `parseTri` en `productFilter`; sort `oldest`. |
| **3. Colecciones CRUD** (crear/duplicar/eliminar → TN) | ✅ Hecho | `/api/collections/[id]/duplicate`, delete vía `/api/categories/[id]`, "Nueva colección". |
| **4. Editar campañas activas** (agregar productos, cambiar precios) | ✅ Hecho | `ItemsPanel` con `isActive` ("Editar campaña activa"). Extendido después a modo costos. |
| **5. Cambios → Actividad, navegable por fecha** | ✅ Hecho | `ChangesClient` con `<input type="date">` (día puntual vs. recientes). Sin grid de calendario custom, pero cumple el objetivo. |

**Única deuda detectada:** `app/catalog/SyncButton.tsx` quedó como **archivo muerto**
(no se importa en ningún lado; el push vive en el Sidebar y `SalesSyncButton`).
Candidato a borrar.
