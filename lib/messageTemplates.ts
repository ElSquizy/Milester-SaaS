/**
 * Plantillas de mensaje para clientes (WhatsApp/Instagram). Un texto con
 * variables {nombre} {precio} {url}… que se renderiza con los datos de un
 * producto y se copia al portapapeles desde el clic derecho del catálogo.
 *
 * Las variables numéricas admiten una operación simple para, por ejemplo,
 * mostrar cuotas: {precio_actual / 3}, {precio / 6}, {precio * 1.1}.
 *
 * Núcleo PURO (sin Prisma): lo importan el editor (cliente) y el menú.
 */

/** Datos de producto que alimentan las variables. */
export type MessageProduct = {
  name: string;
  sku: string | null;
  price: number;
  promotionalPrice: number | null;
  categoryName: string | null;
  stock: number | null;
  infiniteStock: boolean;
  productUrl: string | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

type MessageVariable = {
  name: string;                          // "precio_actual" (sin llaves)
  label: string;                         // etiqueta del chip
  resolve: (p: MessageProduct) => string; // valor de texto (sin operación)
  num?: (p: MessageProduct) => number | null; // valor numérico para operaciones
  money?: boolean;                       // formatear el resultado como $ (sino, número pelado)
};

/** Variables disponibles: nombre, etiqueta y cómo se resuelven. */
export const MESSAGE_VARIABLES: MessageVariable[] = [
  { name: "nombre", label: "Nombre", resolve: (p) => p.name },
  { name: "precio", label: "Precio base", resolve: (p) => money(p.price), num: (p) => p.price, money: true },
  { name: "precio_promo", label: "Precio en oferta", resolve: (p) => (p.promotionalPrice != null ? money(p.promotionalPrice) : ""), num: (p) => p.promotionalPrice, money: true },
  { name: "precio_actual", label: "Precio vigente", resolve: (p) => money(p.promotionalPrice ?? p.price), num: (p) => p.promotionalPrice ?? p.price, money: true },
  { name: "descuento", label: "% de descuento", resolve: (p) => (p.promotionalPrice != null && p.price > 0 ? `${Math.round((1 - p.promotionalPrice / p.price) * 100)}%` : "") },
  { name: "sku", label: "SKU", resolve: (p) => p.sku ?? "" },
  { name: "categoria", label: "Categoría", resolve: (p) => p.categoryName ?? "" },
  { name: "stock", label: "Stock", resolve: (p) => (p.infiniteStock ? "disponible" : p.stock != null ? String(p.stock) : "sin stock"), num: (p) => (p.infiniteStock ? null : p.stock), money: false },
  { name: "url", label: "Link del producto", resolve: (p) => p.productUrl ?? "" },
];

const BY_NAME = new Map(MESSAGE_VARIABLES.map((v) => [v.name, v]));

// {variable} o {variable <op> numero} — el op y el operando son opcionales.
const TOKEN_RE = /\{\s*([a-zA-Z_]+)\s*(?:([*/+-])\s*(\d+(?:[.,]\d+)?))?\s*\}/g;

/**
 * Reemplaza las variables conocidas (con operación opcional) por sus valores.
 * Deja intacto cualquier {texto} que no sea una variable válida — así un "3x1"
 * o un "{lo que sea}" en el mensaje no se rompe.
 */
export function renderMessage(body: string, product: MessageProduct): string {
  return body.replace(TOKEN_RE, (whole, name: string, op: string | undefined, operand: string | undefined) => {
    const v = BY_NAME.get(name);
    if (!v) return whole; // no es una variable → se deja tal cual
    if (op && operand !== undefined) {
      if (!v.num) return whole; // operación sobre una variable no numérica → sin cambios
      const base = v.num(product);
      if (base == null) return ""; // sin valor (ej: sin oferta) → vacío
      const n = parseFloat(operand.replace(",", "."));
      let r = base;
      if (op === "/") r = n !== 0 ? base / n : base;
      else if (op === "*") r = base * n;
      else if (op === "+") r = base + n;
      else if (op === "-") r = base - n;
      r = Math.round(r);
      return v.money ? money(r) : String(r);
    }
    return v.resolve(product);
  });
}

/** Producto de ejemplo para la vista previa del editor. */
export const SAMPLE_MESSAGE_PRODUCT: MessageProduct = {
  name: "Resident Evil 4 [PS5]",
  sku: "RE4-2023-PS5",
  price: 75000,
  promotionalPrice: 65000,
  categoryName: "PlayStation 5",
  stock: null,
  infiniteStock: true,
  productUrl: "https://tutienda.com/re4-ps5",
};

export const SEED_MESSAGE_BODY =
  `¡Hola! 👋 Te paso la info de *{nombre}*:\n\n` +
  `💰 Precio: {precio_actual}\n` +
  `💳 3 cuotas de {precio_actual / 3}\n` +
  `🎮 {categoria}\n` +
  `🔗 {url}\n\n` +
  `¿Te lo reservo?`;
