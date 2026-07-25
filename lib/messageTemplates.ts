/**
 * Plantillas de mensaje para clientes (WhatsApp/Instagram). Un texto con
 * variables {nombre} {precio} {url}… que se renderiza con los datos de un
 * producto y se copia al portapapeles desde el clic derecho del catálogo.
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

/** Variables disponibles: token, etiqueta para el editor y cómo se resuelven. */
export const MESSAGE_VARIABLES: { token: string; label: string; resolve: (p: MessageProduct) => string }[] = [
  { token: "{nombre}", label: "Nombre", resolve: (p) => p.name },
  { token: "{precio}", label: "Precio base", resolve: (p) => money(p.price) },
  { token: "{precio_promo}", label: "Precio en oferta", resolve: (p) => (p.promotionalPrice != null ? money(p.promotionalPrice) : "") },
  { token: "{precio_actual}", label: "Precio vigente", resolve: (p) => money(p.promotionalPrice ?? p.price) },
  { token: "{descuento}", label: "% de descuento", resolve: (p) => (p.promotionalPrice != null && p.price > 0 ? `${Math.round((1 - p.promotionalPrice / p.price) * 100)}%` : "") },
  { token: "{sku}", label: "SKU", resolve: (p) => p.sku ?? "" },
  { token: "{categoria}", label: "Categoría", resolve: (p) => p.categoryName ?? "" },
  { token: "{stock}", label: "Stock", resolve: (p) => (p.infiniteStock ? "disponible" : p.stock != null ? String(p.stock) : "sin stock") },
  { token: "{url}", label: "Link del producto", resolve: (p) => p.productUrl ?? "" },
];

/** Reemplaza las variables conocidas; deja intacto cualquier {texto} desconocido. */
export function renderMessage(body: string, product: MessageProduct): string {
  let out = body;
  for (const v of MESSAGE_VARIABLES) out = out.split(v.token).join(v.resolve(product));
  return out;
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
  `🎮 {categoria}\n` +
  `🔗 {url}\n\n` +
  `¿Te lo reservo?`;
