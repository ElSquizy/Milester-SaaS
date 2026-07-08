import axios from "axios";

const BASE_URL = "https://api.tiendanube.com/v1";

export function getTiendaNubeClient(storeId: string, accessToken: string) {
  const client = axios.create({
    baseURL: `${BASE_URL}/${storeId}`,
    headers: {
      Authentication: `bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "Milester SaaS (gaizka.qwerty@gmail.com)",
    },
  });
  return client;
}

export interface TiendaNubeProduct {
  id?: number;
  name: { es: string } | Record<string, string>;
  description: { es: string } | Record<string, string>;
  seo_title?: { es: string } | Record<string, string>;
  seo_description?: { es: string } | Record<string, string>;
  variants?: TiendaNubeVariant[];
}

export interface TiendaNubeVariant {
  id?: number;
  price: string;
  stock?: number | null;
  sku?: string | null;
}

export async function syncProductToTiendaNube(
  storeId: string,
  accessToken: string,
  product: {
    tiendaNubeId?: string | null;
    name: string;
    description?: string | null;
    price: number;
    seoTitle?: string | null;
    seoDescription?: string | null;
    variants?: { tiendaNubeId?: string | null; price: number; promotionalPrice?: number | null; stock?: number | null; sku?: string | null; values?: string[] }[];
    attributes?: string[];
    published?: boolean;
    categoryIds?: number[];
    tags?: string;
  }
) {
  const client = getTiendaNubeClient(storeId, accessToken);

  const payload: TiendaNubeProduct & { published?: boolean; categories?: number[]; tags?: string } = {
    name: { es: product.name },
    description: { es: product.description || "" },
    ...(product.seoTitle && { seo_title: { es: product.seoTitle } }),
    ...(product.seoDescription && { seo_description: { es: product.seoDescription } }),
    ...(product.published !== undefined ? { published: product.published } : {}),
    ...(product.categoryIds !== undefined ? { categories: product.categoryIds } : {}),
    ...(product.tags !== undefined ? { tags: product.tags } : {}),
  };

  if (product.tiendaNubeId) {
    const { data } = await client.put(`/products/${product.tiendaNubeId}`, payload);

    if (product.variants && product.variants.length > 0) {
      const variantsRes = await client.get(`/products/${product.tiendaNubeId}/variants`);
      const existingVariants: TiendaNubeVariant[] = variantsRes.data;

      for (let i = 0; i < product.variants.length; i++) {
        const v = product.variants[i];
        const existing = existingVariants[i];
        if (existing?.id) {
          await client.put(`/products/${product.tiendaNubeId}/variants/${existing.id}`, {
            price: String(v.price),
            // TN clears the sale only with an empty string; null is ignored.
            promotional_price: v.promotionalPrice != null ? String(v.promotionalPrice) : "",
            stock: v.stock ?? null,
            sku: v.sku ?? null,
          });
        }
      }
    }

    return data;
  } else {
    const hasAttrs = !!(product.attributes && product.attributes.length);
    const productWithVariants = {
      ...payload,
      ...(hasAttrs ? { attributes: product.attributes!.map((a) => ({ es: a })) } : {}),
      variants: product.variants?.map((v) => ({
        price: String(v.price),
        ...(v.promotionalPrice != null ? { promotional_price: String(v.promotionalPrice) } : {}),
        stock: v.stock ?? null,
        sku: v.sku ?? null,
        ...(hasAttrs && v.values && v.values.length ? { values: v.values.map((x) => ({ es: x || "-" })) } : {}),
      })) || [{ price: String(product.price) }],
    };
    const { data } = await client.post("/products", productWithVariants);
    return data;
  }
}

export async function updateVariantPrice(
  storeId: string,
  accessToken: string,
  productId: string,
  variantId: string,
  price: number
) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const { data } = await client.put(`/products/${productId}/variants/${variantId}`, {
    price: String(price),
  });
  return data;
}

export async function importProductsFromTiendaNube(storeId: string, accessToken: string) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const allProducts = [];
  let page = 1;

  while (true) {
    const { data, headers } = await client.get(`/products?per_page=200&page=${page}`);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    // Tienda Nube uses Link header for pagination
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }

  return allProducts;
}

export interface TiendaNubeOrder {
  id: number;
  number?: number;
  total: string;
  status: string;          // open | closed | cancelled
  payment_status?: string;
  contact_name?: string;
  customer?: { id?: number; name?: string; email?: string; phone?: string };
  created_at: string;
  products?: {
    product_id?: number;
    name: string;
    quantity: number | string;
    price: string;
  }[];
}

/** Fetches products updated since the given ISO date (or all if omitted). Read-only. */
export async function fetchProductsUpdatedSince(storeId: string, accessToken: string, sinceISO?: string) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const all: unknown[] = [];
  let page = 1;
  const filter = sinceISO ? `&updated_at_min=${encodeURIComponent(sinceISO)}` : "";
  while (true) {
    const { data, headers } = await client.get(`/products?per_page=200&page=${page}${filter}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }
  return all;
}

export interface TiendaNubeCategory {
  id: number;
  parent?: number | null;
  name: Record<string, string>;
}

/** Fetches the full category (collection) tree. Read-only. */
export async function getCategoriesFromTiendaNube(
  storeId: string,
  accessToken: string
): Promise<TiendaNubeCategory[]> {
  const client = getTiendaNubeClient(storeId, accessToken);
  const all: TiendaNubeCategory[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await client.get(`/categories?per_page=200&page=${page}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }
  return all;
}

/** Fetches all orders, paginated. Read-only. */
export async function importOrdersFromTiendaNube(
  storeId: string,
  accessToken: string,
  onPage?: (count: number) => void
): Promise<TiendaNubeOrder[]> {
  const client = getTiendaNubeClient(storeId, accessToken);
  const all: TiendaNubeOrder[] = [];
  let page = 1;

  while (true) {
    const { data, headers } = await client.get(`/orders?per_page=200&page=${page}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    onPage?.(all.length);
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }

  return all;
}
