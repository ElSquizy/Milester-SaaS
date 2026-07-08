"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useToast } from "./Toast";

interface Variant { id?: number; tiendaNubeId?: string | null; price: number; stock: number | null; sku: string | null; name?: string }
interface Promotion { promoPrice: number; startDate: string; endDate: string; active: boolean }
interface Product {
  id?: number;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  seoTitle: string;
  seoDescription: string;
  imageUrl?: string | null;
  syncStatus?: string;
  promotion?: Promotion | null;
  variants?: Variant[];
}

export default function ProductForm({ initialData, hasAiKey }: { initialData?: Product; hasAiKey?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showPromo, setShowPromo] = useState(!!initialData?.promotion);
  const [description, setDescription] = useState(initialData?.description || "");
  const [variants, setVariants] = useState<Variant[]>(
    initialData?.variants?.length ? initialData.variants : [{ price: initialData?.price || 0, stock: null, sku: null }]
  );
  const [savingVariants, setSavingVariants] = useState(false);

  const [form, setForm] = useState({
    name: initialData?.name || "",
    price: initialData?.price || 0,
    seoTitle: initialData?.seoTitle || "",
    seoDescription: initialData?.seoDescription || "",
    imageUrl: initialData?.imageUrl || "",
  });

  const [promo, setPromo] = useState({
    promoPrice: initialData?.promotion?.promoPrice || 0,
    startDate: initialData?.promotion?.startDate
      ? format(new Date(initialData.promotion.startDate), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    endDate: initialData?.promotion?.endDate
      ? format(new Date(initialData.promotion.endDate), "yyyy-MM-dd")
      : "",
  });

  // Sync description to textarea since TinyMCE CDN may not load
  useEffect(() => { setDescription(initialData?.description || ""); }, [initialData?.description]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, description, price: Number(form.price) };
      let res;
      if (initialData?.id) {
        res = await fetch(`/api/products/${initialData.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/products", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
      }
      const data = await res.json();

      if (showPromo && promo.endDate) {
        await fetch("/api/promotions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: data.id, promoPrice: Number(promo.promoPrice), startDate: promo.startDate, endDate: promo.endDate }),
        });
      }

      if (data.syncStatus === "error") {
        toast("Guardado localmente pero error al sincronizar con Tienda Nube", "error");
      } else {
        toast(initialData?.id ? "Producto actualizado y sincronizado ✓" : "Producto creado ✓", "success");
      }
      router.push("/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVariants() {
    if (!initialData?.id) return;
    setSavingVariants(true);
    const res = await fetch(`/api/products/${initialData.id}/variants`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants }),
    });
    setSavingVariants(false);
    if (res.ok) toast("Variantes actualizadas ✓", "success");
    else toast("Error al actualizar variantes", "error");
  }

  async function removePromo() {
    if (!initialData?.id) return;
    await fetch("/api/promotions", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: initialData.id }),
    });
    setShowPromo(false);
    toast("Promoción eliminada", "info");
    router.refresh();
  }

  function addVariant() { setVariants([...variants, { price: form.price, stock: null, sku: null }]); }
  function removeVariant(i: number) { setVariants(variants.filter((_, idx) => idx !== i)); }
  function updateVariant(i: number, field: keyof Variant, val: string | number | null) {
    setVariants(variants.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  }

  const syncColor = { synced: "text-blue-600", pending: "text-yellow-600", error: "text-red-600" }[initialData?.syncStatus || ""] || "text-gray-400";

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda — contenido */}
        <div className="lg:col-span-2 space-y-5">

          {/* Nombre */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Nombre del producto</label>
              {hasAiKey && (
                <button type="button" className="text-xs text-purple-600 hover:underline flex items-center gap-1">
                  ✨ Mejorar título
                </button>
              )}
              {!hasAiKey && (
                <span className="text-xs text-gray-400 cursor-help" title="Requiere API key de Anthropic en Configuración">
                  ✨ Mejorar título (requiere API key)
                </span>
              )}
            </div>
            <input
              type="text" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nombre del producto"
            />
          </div>

          {/* Descripción */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Descripción (HTML)</label>
              <div className="flex gap-3">
                {hasAiKey ? (
                  <button type="button" className="text-xs text-purple-600 hover:underline">✨ Generar con IA</button>
                ) : (
                  <span className="text-xs text-gray-400" title="Requiere API key de Anthropic">✨ Generar con IA (requiere API key)</span>
                )}
              </div>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="<p>Tu descripción en HTML...</p>"
            />
            {description && (
              <details className="mt-2">
                <summary className="text-xs text-blue-600 cursor-pointer hover:underline">Vista previa HTML</summary>
                <div
                  className="mt-2 p-3 border border-gray-200 rounded-lg text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              </details>
            )}
          </div>

          {/* Variantes */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Variantes</label>
              <button type="button" onClick={addVariant} className="text-xs text-blue-600 hover:underline">
                + Agregar variante
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-3 font-medium">Precio</th>
                    <th className="text-left py-2 pr-3 font-medium">Stock</th>
                    <th className="text-left py-2 pr-3 font-medium">SKU</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map((v, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3">
                        <input
                          type="number" step="0.01" min={0} value={v.price}
                          onChange={(e) => updateVariant(i, "price", parseFloat(e.target.value))}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number" min={0} value={v.stock ?? ""}
                          onChange={(e) => updateVariant(i, "stock", e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="∞"
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text" value={v.sku || ""}
                          onChange={(e) => updateVariant(i, "sku", e.target.value || null)}
                          placeholder="SKU-001"
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2">
                        {variants.length > 1 && (
                          <button type="button" onClick={() => removeVariant(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {initialData?.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  type="button" onClick={handleSaveVariants} disabled={savingVariants}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                >
                  {savingVariants ? "Guardando variantes..." : "Guardar variantes → Tienda Nube"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha — meta */}
        <div className="space-y-5">

          {/* Precio y estado */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">Precio</label>
              {initialData?.syncStatus && (
                <span className={`text-xs font-medium ${syncColor}`}>
                  ● {initialData.syncStatus === "synced" ? "Sincronizado" : initialData.syncStatus === "error" ? "Error sync" : "Pendiente"}
                </span>
              )}
            </div>
            <input
              type="number" step="0.01" min={0} required value={form.price}
              onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {initialData?.originalPrice && initialData.originalPrice !== form.price && (
              <p className="text-xs text-gray-400">Precio original: ${initialData.originalPrice}</p>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold transition-colors"
              >
                {saving ? "Guardando..." : "Guardar y sincronizar"}
              </button>
            </div>
            <button
              type="button" onClick={() => router.back()}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Cancelar
            </button>
          </div>

          {/* Imagen */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="text-sm font-semibold text-gray-700 block mb-3">Imagen</label>
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="preview" className="w-full h-40 object-contain rounded-lg border border-gray-200 mb-3 bg-gray-50" />
            )}
            <input
              type="url" value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* SEO */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">SEO</label>
              {hasAiKey ? (
                <button type="button" className="text-xs text-purple-600 hover:underline">🔍 Optimizar</button>
              ) : (
                <span className="text-xs text-gray-400" title="Requiere API key de Anthropic">🔍 Optimizar (requiere API key)</span>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Meta título</label>
              <input
                type="text" value={form.seoTitle} maxLength={70}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">{form.seoTitle.length}/70</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Meta descripción</label>
              <textarea
                value={form.seoDescription} maxLength={160} rows={3}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-0.5">{form.seoDescription.length}/160</p>
            </div>
          </div>

          {/* Promoción */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Promoción</label>
              {showPromo && initialData?.id && (
                <button type="button" onClick={removePromo} className="text-xs text-red-500 hover:underline">Eliminar</button>
              )}
            </div>
            {!showPromo ? (
              <button type="button" onClick={() => setShowPromo(true)} className="text-sm text-blue-600 hover:underline">
                + Programar promoción
              </button>
            ) : (
              <div className="space-y-3">
                {initialData?.promotion?.active && (
                  <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Activa ahora</span>
                )}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Precio promocional</label>
                  <input
                    type="number" step="0.01" min={0} value={promo.promoPrice}
                    onChange={(e) => setPromo({ ...promo, promoPrice: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Inicio</label>
                    <input type="date" value={promo.startDate} onChange={(e) => setPromo({ ...promo, startDate: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fin</label>
                    <input type="date" value={promo.endDate} onChange={(e) => setPromo({ ...promo, endDate: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  El precio vuelve a ${initialData?.originalPrice ?? form.price} al terminar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
