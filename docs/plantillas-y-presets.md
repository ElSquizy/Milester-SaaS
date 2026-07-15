# Sistema de plantillas y presets

> Estado: **especificación acordada, sin implementar** (salvo lo marcado ✅).
> Última actualización: 2026-07-15

## Idea central

**Todo se basa en plantillas.** Un producto = *identidad individual* + *moldes compartidos*.
Los moldes definen el **formato**; nunca el contenido propio de cada producto.

| | Vive en | Ejemplo |
|---|---|---|
| **Identidad individual** | El producto | nombre, SKU, precio, sinopsis, imagen del producto |
| **Molde compartido** | La plantilla / preset | formato de la descripción, fondo + cover, colecciones, etiquetas |

---

## Los tres tipos de plantilla

1. **Plantilla de descripción** ✅ *(implementada)*
   Esqueleto HTML con `{{slots}}` + regiones repetibles. Formato compartido; los slots se llenan por producto.

2. **Plantilla de imagen** ✅ *(implementada)*
   Fondo (1024×1024) + cover/marco (670×763) + parámetros de sombra. La imagen del producto es individual.

3. **Preset de producto** ⏳ *(a construir)*
   Un molde que agrupa varios campos. **Un preset = una edición masiva guardada.**

---

## Dónde viven los toggles

Esta es la decisión de diseño clave: los toggles **definen el molde**, no el momento de aplicarlo.

| Momento | ¿Toggles? | Qué pasa |
|---|---|---|
| **Definir un preset** | ✅ Sí | Elegís qué campos lleva el molde y con qué valores |
| **Aplicar a una selección** | ❌ No | Elegís el preset y aplica. Sin fricción. |
| **Duplicar / crear producto** | ✅ Sí | Elegís qué copiar del original, o de qué preset parte |

**Regla derivada:** los campos que el preset **no lleva, no se tocan**. Los toggles apagados *son* el "dejar igual".

---

## Reglas acordadas

### Vínculo: **aplicar una vez** (no vínculo vivo)
El preset es un **molde**, no un padre. Editarlo **no** modifica a los productos ya aplicados.
El producto guarda **qué preset usó** (trazabilidad, no herencia) → habilita el botón
**"reaplicar a los N productos que usan este preset"**, siempre con preview.

*Motivo:* un vínculo vivo haría que un typo en el molde marque 400 productos como modificados
y dispare 400 pushes a Tienda Nube.

### Slots: **siempre vacíos**
El preset define **qué plantilla** usar, no trae valores de slots.
No hay "producto madre" con datos precargados: el molde es formato puro.

### Choque al aplicar una plantilla de descripción
- **Misma plantilla** → se **conservan** los slots ya cargados (no se pisan).
- **Otra plantilla** → los slots no encajan: **avisar y pedir confirmación** antes de perderlos.

### Precio: **fuera del preset**
El preset **nunca** lleva precio.
- Aplicar a productos existentes → el precio **no se toca**.
- Crear/duplicar desde un preset → el producto nace con precio **0**.

### Qué NO puede llevar un preset (identidad individual)
`nombre` · `SKU` · `precio` · `imagen del producto` · `sinopsis` y demás slots

---

## Qué puede llevar un preset

- Plantilla de descripción (solo la referencia; slots vacíos)
- Plantilla de imagen (fondo + cover)
- Colecciones — modo **aditivo** (agregar, no reemplazar)
- Etiquetas — modo **aditivo**
- Política de stock (ilimitado / finito + número)
- Patrón de SEO con variables (ej. `{{nombre}} — …`)
- Visibilidad (publicado / oculto)

---

## Modelo de datos (borrador)

```
ProductPreset
  id, name
  fields        JSON   // solo los campos con toggle ON, con sus valores
  createdAt, updatedAt

Product
  presetId  Int?   // trazabilidad: qué preset se aplicó (NO es vínculo vivo)
```

Ya existentes: `Product.descriptionTemplateId` + `descriptionData`, `Product.imageTemplateId` + `productImageUrl`.

---

## Navegación (IA)

Las plantillas ya no entran como un botón dentro de Catálogo. Van a **entrada propia en el sidebar**:

```
Plantillas
 ├─ Descripciones
 ├─ Imágenes
 └─ Productos (presets)
```

Catálogo = productos. Plantillas = moldes.

---

## Red de seguridad (para toda edición masiva)

- **Preview del diff** antes de aplicar: *"vas a cambiar 342 productos; así queda el primero"*.
- **Deshacer el lote**: el `Changelog` ya guarda `oldValue`/`newValue`; con un `batchId` se revierte un lote entero.
- **Nada toca Tienda Nube** hasta el push del sidebar (todo queda `modified`). Ya funciona así.
- Progreso (SSE) + rate limit para lotes grandes.

---

## Plan por fases

**Fase 1 — el desbloqueo** (ataca el dolor real de hoy)
1. Seleccionar **todos los que coinciden con el filtro** (hoy solo se puede la página: 50 de 1.863).
2. **Aplicar plantilla de descripción a la selección** + colecciones/etiquetas **aditivas**.
3. **Preview del diff** + **deshacer el lote**.

**Fase 2 — el preset**
4. "Guardar esta edición masiva como preset" → aparece en la subvista.
5. Aplicar preset a una selección · botón "reaplicar".

**Fase 3 — mudanza e integración**
6. Plantillas al sidebar con sus 3 pestañas.
7. Toggles en duplicar / crear producto.

---

## Limitaciones conocidas (hoy)

- **Selección máxima = la página actual (50)**. `toggleAll` compara contra `products.length`.
- La acción masiva de **categoría reemplaza** en vez de agregar → footgun: borra las otras colecciones del producto.
