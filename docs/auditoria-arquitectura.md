# Auditoría de arquitectura — FASE 1 y FASE 2

**Fecha:** 2026-07-19 · **Alcance:** repositorio completo + esquema de datos.
**Contexto crítico:** las lecturas de Turso están **bloqueadas por cuota** al momento de esta auditoría (las escrituras funcionan). Los conteos de filas citados se midieron en esta misma sesión, horas antes del bloqueo. No fue posible re-verificarlos en vivo; todo lo demás sale del código y del esquema, que sí son verificables.

---

## 1. Stack tecnológico (verificado)

| Componente | Qué es | Evidencia |
|---|---|---|
| Framework | **Next.js 16.2.9** (App Router, Turbopack), React 19.2.4 | `package.json` |
| Backend | API Routes de Next (`app/api/**`), runtime Node | `export const runtime = "nodejs"` en rutas pesadas |
| ORM | **Prisma 7.8** + `@prisma/adapter-libsql` (prod) y `@prisma/adapter-better-sqlite3` (dev local) | `lib/prisma.ts`, `package.json` |
| Cliente Turso | `@libsql/client` 0.17 (directo en scripts; vía adapter en la app) | `package.json` |
| Cliente Tienda Nube | **axios** con interceptor de reintentos (429/5xx con backoff + Retry-After). Centralizado en `lib/tiendanube.ts` → `getTiendaNubeClient()`; lo consumen 10 módulos de `lib/`, **ninguna llamada directa desde componentes** | grep `getTiendaNubeClient` |
| Autenticación | **Contraseña única compartida** (`MILESTER_PASSWORD`) vía `proxy.ts` (el middleware de Next 16) + cookie con token derivado. Kill-switch `MILESTER_ENABLED=false` | `proxy.ts` |
| Despliegue | Vercel, región **`cle1` (Cleveland, Ohio)** | `vercel.json` |
| Base de datos | Turso en **`aws-us-east-2` (Ohio)** | URL en `.env` |
| Tareas programadas | GitHub Actions (`.github/workflows/cron.yml`, cada 10 min nominal, **~1 h real** por throttling de GitHub) → `GET /api/cron` protegido por `CRON_SECRET`. Ejecuta `tickCampaigns` + `pullFromTiendaNube` | `cron.yml`, `app/api/cron/route.ts` |
| Webhooks | **No existen.** Toda la entrada de datos es pull por cron o pull al navegar (Sidebar dispara `/api/sync/pull` en cada cambio de ruta) | grep exhaustivo sin resultados |
| Variables de entorno | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MILESTER_PASSWORD`, `MILESTER_ENABLED`, `CRON_SECRET`, `APP_URL`, `NODE_ENV` | grep `process.env` |

**Hallazgo geográfico relevante:** Vercel (`cle1`) y Turso (`aws-us-east-2`) están **en la misma región efectiva** (Ohio). La premisa del plan de "base remota lejos de la infraestructura" **no se cumple** — la latencia por distancia no es el problema.

---

## 2. Inventario de datos (17 modelos)

Conteos medidos antes del bloqueo: **1.912 Product · 1.464 Order · 1.665 OrderItem · 1.067 Customer · 210+ CampaignItem**. Changelog e IncomingChange: sin conteo (bloqueo) — se estiman miles y decenas respectivamente.

### Clasificación

| Modelo | Clase | Detalle |
|---|---|---|
| `Product` | **MIXTA (C + B)** | Los campos comerciales (nombre, precios, stock, SKU, tags, imagen, descripción, published) son **espejo reconstruible** de TN. Pero conviven columnas **propias e irreconstruibles**: `costUsd`, `descriptionTemplateId`/`descriptionData`, `imageTemplateId`, `productImageUrl`, `imageDirty`, y el estado de staging `syncStatus`/`pendingDelete`. `unitsSold`/`lastSoldAt` son derivados de órdenes (reconstruibles). |
| `Variant` | **C** reconstruible | Espejo de variantes TN. Salvo promos por variante staged sin pushear. |
| `Category`, `ProductCategory` | **C** reconstruible | Espejo del árbol de colecciones TN. |
| `Order` (source=tiendanube) | **C** reconstruible | Espejo de órdenes TN (incluye `rawData` snapshot). |
| `Order` (source=local) | **B — irreconstruible** | Tickets manuales: `fulfillmentState`, `paymentReference`, `exchangeRate`, canal. TN no los conoce. |
| `OrderItem` | **MIXTA** | Espejo para órdenes TN; **`costUsd` snapshot es propio**; ítems de tickets locales son propios. |
| `Customer` | **MIXTA** | Espejo para clientes TN; los de `tiendaNubeId=null` (locales) y las decisiones de `mergedIntoId` son **propios**. |
| `Campaign`, `CampaignItem` | **B — irreconstruible** | El corazón del sistema de promos: snapshots de `originalPrice` y `variantPrices` que permiten revertir. Exactamente lo que el plan exige conservar. |
| `Changelog` | **B — irreconstruible** | Historial/auditoría de cambios por producto. |
| `Settings` | **B — irreconstruible** | Credenciales TN (`accessToken`, `clientSecret`), cursores de sync, config. |
| `DescriptionTemplate`, `ImageTemplate` | **B — irreconstruible** | Las plantillas de contenido/imagen creadas por el usuario. |
| `AiProvider`, `AiTemplate` | **B — irreconstruible** | Proveedores IA (**API keys en texto plano en la BD** — ver Seguridad) y prompts. |
| `IncomingChange` | **C** derivado | Diff TN↔local pendiente de aprobación. Se regenera. |
| `Promotion` | **LEGACY — candidata a eliminación** | Sistema viejo de promos por producto, **superseded por Campaign**. `lib/promotions.ts` solo lo llama `/api/check-promotions`, cuyo único cliente (`PromotionChecker.tsx`) **no está montado en ningún lado**. Código muerto. |

También legacy: las páginas `/products`, `/products/new`, `/products/[id]` — editor viejo, no enlazado desde la navegación (el Sidebar va a `/catalog`). Solo se referencian entre sí.

**Sin categoría D (UNKNOWN):** todos los modelos quedaron clasificados.

### Migraciones y seeds
14 migraciones en `prisma/migrations/`. **No hay seeds** ni datos iniciales: la base se puebla exclusivamente con el pull desde TN + lo que el usuario crea.

---

## 3. FASE 2 — Mapa de dependencias

```
Product/Variant/Category
  ├─ lib: products, catalogSync, sync, variants, campaigns, collections, changes, localOrders
  ├─ api: /api/products*, /api/sync*, /api/collections*, /api/categories*, /api/campaigns*
  ├─ UI:  CatalogShell → ProductTable/Cards/Panel/Modal · CampaignWizard · CollectionsClient · OrderTickets (búsqueda)
  └─ cron: pullFromTiendaNube (espejo entrante) · tickCampaigns (escribe promos → push)

Campaign/CampaignItem
  ├─ lib: campaigns, campaignScheduler
  ├─ api: /api/campaigns* 
  ├─ UI:  CampaignsClient, CampaignWizard, CampaignExtras (ItemsPanel)
  └─ efecto: escribe promotionalPrice en Product/Variant → entra a la cola de push

Order/OrderItem/Customer
  ├─ lib: salesSync, customerSync, orderMap, localOrders
  ├─ api: /api/sales, /api/customers*, /api/orders/local*
  └─ UI:  SalesClient, CustomersClient, OrderTickets (Inicio), dashboard de Inicio (KPIs)

Settings → lib/creds → TODAS las operaciones contra TN
Changelog → lib/changes → /api/changelog, /api/changes → ChangesClient, paneles de producto

Flujo saliente (push): UI → updateProduct (staging: syncStatus="modified")
  → botón "Subir cambios" (Sidebar) → SSE /api/sync → syncOneProduct → TN (+ imagen)
Flujo entrante (pull): cron + navegación → pullFromTiendaNube → upsert espejo
  → SALTEA productos con syncStatus modified/error (protege el staging)
```

**Duplicación innecesaria detectada:** ninguna estructural — el espejo es una decisión (caché + staging), no un accidente. La duplicación real es el sistema **Promotion legacy vs Campaign** (mismo propósito, uno muerto).

---

## 4. Contradicciones con la arquitectura objetivo (documentadas, no ocultadas)

1. **La arquitectura objetivo ya existe en su mayor parte.** TN ya es la fuente de verdad comercial *de facto*: el pull entrante pisa el espejo local con lo que dice TN, y toda edición comercial termina en TN vía push. La base propia ya contiene campañas, plantillas, historial, config — exactamente lo que el diagrama objetivo pide.

2. **La única desviación real del modelo de escritura del plan es deliberada y es una feature:** las ediciones se **stagean** localmente (`syncStatus="modified"`) y se pushean en lote con revisión previa ("Subir N cambios", diff en el panel, "Deshacer cambios", reintento de errores). El plan pide escritura TN-first (editar → TN → actualizar caché). Adoptarlo **eliminaría el flujo de staging/revisión** y haría cada edición inline una llamada a TN (con sus 429 y backoffs de hasta 27 s medidos). Esto es una decisión de producto, no técnica.

3. **La crisis que motivó este plan no es de arquitectura sino de volumen de lecturas.** Causa medida del bloqueo de cuota: el Sidebar hace polling del contador de pendientes **cada 10 s** con un `count` sin índice que escanea 1.912 filas (~5,5 M filas/día por pestaña abierta), más ~13 queries `force-dynamic` en cada carga de Inicio. Vercel y Turso están co-ubicados en Ohio; mover lecturas de catálogo a la API de TN las haría **más lentas**, no más rápidas (paginada de a 200, rate-limited). El propio plan advierte: *"No reemplaces una consulta lenta por cinco consultas a otra API."*

4. **Las tablas espejo son MIXTAS.** `Product`, `Order`, `OrderItem`, `Customer` mezclan columnas-caché con columnas-propias. Un "reset del caché" ingenuo destruiría `costUsd`, plantillas aplicadas, tickets locales y clientes locales. La reconstrucción debe ser: pull TN + **re-join de columnas propias por `tiendaNubeId`**. El join key ya existe; el comando de reconstrucción no está implementado.

5. **Riesgo operativo demostrado en esta sesión:** un rebuild de tabla en Turso (`DROP TABLE` + recrear) **cascadeó y borró los 1.665 OrderItem** porque `PRAGMA foreign_keys=OFF` no persiste entre sentencias sobre HTTP. Se restauró desde backup previo. Cualquier migración futura de esquema o de motor debe asumir esto.

---

## 5. Seguridad (FASE 8 adelantada — hallazgos)

- ✅ Tokens TN solo en servidor (`Settings` en BD + llamadas desde `lib/`); nunca expuestos al cliente.
- ✅ `/api/cron` protegido por `CRON_SECRET`; bypass del login solo para esa ruta.
- ✅ Rate-limit propio en login/compose/upload (`lib/rateLimit.ts`).
- ⚠️ `AiProvider.apiKey` se guarda **en texto plano** en la BD.
- ⚠️ Autenticación de contraseña única compartida: sin usuarios/roles (aceptable para operador único; el plan menciona User/Role/Permission como crecimiento futuro).
- ⚠️ `Settings.clientSecret` (OAuth TN) también en BD en claro.

---

## 6. Datos para la decisión de base (FASE 4 — insumos, sin decidir)

- Volumen real: **diminuto** (~5-10 MB estimados; la tabla más grande tiene 1.912 filas).
- Escrituras: bajas (ediciones de operador + pull horario). Lecturas: altas **por diseño actual** (polling + force-dynamic), corregible por software en 10-100×.
- El bloqueo actual es de **cuota de filas leídas del plan gratuito de Turso**, no de capacidad.
- Prisma abstrae el motor: migrar SQLite→Postgres (Neon/Supabase) es mayormente transparente en la app; los scripts sueltos usan SQL crudo simple. El riesgo está en la migración de datos, no en el código.
- Alternativa de costo cero real: reducir las lecturas (índices en `syncStatus`/`pendingDelete`, unificar los counts de Inicio, matar el polling de 10 s, cache de 30-60 s en Inicio) y permanecer en Turso gratuito.

---

## 7. Recomendación preliminar para FASE 3 (requiere aprobación)

La lectura honesta de esta auditoría: **no hay una migración grande que hacer — hay una formalización y una dieta de lecturas.**

1. **Conservar el espejo local como caché+staging declarado** (el plan lo permite: "caché opcional", "reconstruible"). Documentarlo como tal.
2. **Implementar el comando de reconstrucción** (resiliencia real): pull completo TN + re-join de columnas propias por `tiendaNubeId` + regenerar derivados (`unitsSold`). Hoy es posible pero no existe como operación.
3. **Atacar el consumo de lecturas** (la causa raíz del incidente) — independiente de qué motor se use.
4. **Decidir el motor** con el usuario: quedarse en Turso (con dieta de lecturas ± plan pago) vs. Neon/Postgres. Ambas viables; ninguna urgente si (3) se hace.
5. **Limpieza:** eliminar sistema Promotion legacy (+PromotionChecker, /api/promotions, /api/check-promotions) y páginas `/products*` viejas, previa confirmación.
6. **Backups automáticos** de los datos clase B (los irreconstruibles) — hoy no existen.

**Pregunta abierta que define el diseño (para el usuario):** ¿se conserva el flujo de staging ("Subir cambios" con revisión) o se pasa a escritura TN-first como pide el plan literal? Todo lo demás se adapta a esa respuesta.
