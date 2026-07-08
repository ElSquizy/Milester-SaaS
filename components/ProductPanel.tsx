"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useToast } from "./Toast";

interface Variant { id?: number; tiendaNubeId?: string | null; price: number; stock: number | null; sku: string | null }
interface Promotion { promoPrice: number; startDate: string; endDate: string; active: boolean }
interface Product {
  id: number; name: string; description: string; price: number; originalPrice: number;
  seoTitle: string; seoDescription: string; imageUrl: string | null;
  syncStatus: string; promotion: Promotion | null; variants: Variant[];
}
interface AiProvider { id: number; name: string; provider: string }

interface Props {
  product: Product;
  aiProviders: AiProvider[];
}

const inp: React.CSSProperties = {
  width: "100%", border: "1px solid var(--color-border)", borderRadius: 8,
  padding: "7px 10px", fontSize: "0.8125rem", color: "var(--color-ink)",
  background: "var(--color-surface)", outline: "none",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: "0.75rem", fontWeight: 500,
  color: "var(--color-muted)", marginBottom: 5,
};

export default function ProductPanel({ product, aiProviders }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: product.name,
    price: product.price,
    seoTitle: product.seoTitle || "",
    seoDescription: product.seoDescription || "",
    imageUrl: product.imageUrl || "",
  });
  const [description, setDescription] = useState(product.description || "");
  const [showPromo, setShowPromo] = useState(!!product.promotion);
  const [promo, setPromo] = useState({
    promoPrice: product.promotion?.promoPrice || 0,
    startDate: product.promotion?.startDate
      ? format(new Date(product.promotion.startDate), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    endDate: product.promotion?.endDate
      ? format(new Date(product.promotion.endDate), "yyyy-MM-dd")
      : "",
  });
  const [activeTab, setActiveTab] = useState<"general" | "seo" | "promo">("general");

  // Reset when product changes
  useEffect(() => {
    setForm({
      name: product.name, price: product.price,
      seoTitle: product.seoTitle || "", seoDescription: product.seoDescription || "",
      imageUrl: product.imageUrl || "",
    });
    setDescription(product.description || "");
    setShowPromo(!!product.promotion);
    setPromo({
      promoPrice: product.promotion?.promoPrice || 0,
      startDate: product.promotion?.startDate ? format(new Date(product.promotion.startDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      endDate: product.promotion?.endDate ? format(new Date(product.promotion.endDate), "yyyy-MM-dd") : "",
    });
    setActiveTab("general");
  }, [product.id, product.name, product.price, product.seoTitle, product.seoDescription, product.imageUrl, product.description, product.promotion]);

  function close() {
    const p = new URLSearchParams(params.toString());
    p.delete("edit");
    router.push(`/products?${p.toString()}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, description, price: Number(form.price) }),
      });
      const data = await res.json();
      if (showPromo && promo.endDate) {
        await fetch("/api/promotions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id, promoPrice: Number(promo.promoPrice), startDate: promo.startDate, endDate: promo.endDate }),
        });
      }
      if (data.syncStatus === "error") toast("Guardado, pero error al sincronizar", "error");
      else toast("Guardado y sincronizado", "success");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function generateWithAi(context: string) {
    if (aiProviders.length === 0) {
      toast("Configurá un proveedor de IA en Configuración", "info");
      return;
    }
    setAiLoading(context);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, productName: form.name, currentValue: context === "description" ? description : form.seoTitle }),
      });
      const data = await res.json();
      if (data.result) {
        if (context === "description") setDescription(data.result);
        else if (context === "seoTitle") setForm((f) => ({ ...f, seoTitle: data.result }));
        else if (context === "seoDescription") setForm((f) => ({ ...f, seoDescription: data.result }));
        else if (context === "name") setForm((f) => ({ ...f, name: data.result }));
        toast("Generado con IA ✓", "success");
      } else {
        toast(data.error || "Error al generar", "error");
      }
    } finally {
      setAiLoading(null);
    }
  }

  const hasAi = aiProviders.length > 0;
  const syncColor = { synced: "var(--color-success)", pending: "var(--color-warning)", error: "var(--color-danger)" }[product.syncStatus] || "var(--color-subtle)";
  const syncLabel = { synced: "Sincronizado", pending: "Pendiente", error: "Error" }[product.syncStatus] || product.syncStatus;

  const AiBtn = ({ ctx, label }: { ctx: string; label: string }) => (
    <button
      type="button"
      onClick={() => generateWithAi(ctx)}
      disabled={!hasAi || aiLoading === ctx}
      title={!hasAi ? "Configurá un proveedor de IA en Configuración" : undefined}
      style={{
        fontSize: "0.7rem", fontWeight: 500, border: "none", background: "none", cursor: hasAi ? "pointer" : "not-allowed",
        color: hasAi ? "var(--color-brand-text)" : "var(--color-faint)", padding: 0,
        display: "flex", alignItems: "center", gap: 3,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      {aiLoading === ctx ? "Generando..." : label}
    </button>
  );

  return (
    <div
      style={{
        position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column",
        background: "var(--color-surface)",
        boxShadow: "-1px 0 0 var(--color-border), -8px 0 32px oklch(0.16 0.01 252 / 0.07)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid var(--color-border)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button
          onClick={close}
          style={{
            width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "var(--color-surface-2)", color: "var(--color-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.75rem", flexShrink: 0,
          }}
        >✕</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {form.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: syncColor, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "0.7rem", color: "var(--color-subtle)" }}>{syncLabel}</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginLeft: "auto", flexShrink: 0,
            padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            background: "var(--color-brand)", color: "var(--color-brand-ink)",
            fontSize: "0.8125rem", fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--color-border)",
        padding: "0 16px", flexShrink: 0,
      }}>
        {(["general", "seo", "promo"] as const).map((tab) => {
          const labels = { general: "General", seo: "SEO", promo: "Promoción" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 12px", border: "none", background: "none", cursor: "pointer",
                fontSize: "0.8125rem", fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "var(--color-ink)" : "var(--color-muted)",
                borderBottom: `2px solid ${activeTab === tab ? "var(--color-brand)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {activeTab === "general" && (
          <>
            {/* Image */}
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt={form.name}
                style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
            )}

            {/* Name */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={lbl}>Nombre</label>
                <AiBtn ctx="name" label="Mejorar" />
              </div>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
            </div>

            {/* Price */}
            <div>
              <label style={lbl}>Precio</label>
              <input type="number" step="0.01" min={0} value={form.price}
                onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })} style={inp} />
              {product.originalPrice !== product.price && (
                <p style={{ fontSize: "0.7rem", color: "var(--color-subtle)", marginTop: 4 }}>Original: ${product.originalPrice.toLocaleString("es-AR")}</p>
              )}
            </div>

            {/* Image URL */}
            <div>
              <label style={lbl}>URL de imagen</label>
              <input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://..." style={{ ...inp, fontSize: "0.75rem" }} />
            </div>

            {/* Description */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={lbl}>Descripción (HTML)</label>
                <AiBtn ctx="description" label="Generar con IA" />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={10}
                style={{ ...inp, fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", resize: "vertical" }}
                placeholder="<p>Tu descripción en HTML...</p>"
              />
              {description && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: "0.75rem", color: "var(--color-brand-text)", cursor: "pointer" }}>Vista previa</summary>
                  <div style={{
                    marginTop: 8, padding: "10px 12px", border: "1px solid var(--color-border)",
                    borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.6,
                  }} dangerouslySetInnerHTML={{ __html: description }} />
                </details>
              )}
            </div>
          </>
        )}

        {activeTab === "seo" && (
          <>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={lbl}>Meta título</label>
                <AiBtn ctx="seoTitle" label="Generar" />
              </div>
              <input type="text" value={form.seoTitle} maxLength={70}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} style={inp} />
              <p style={{ fontSize: "0.7rem", color: form.seoTitle.length > 60 ? "var(--color-warning)" : "var(--color-subtle)", marginTop: 4 }}>
                {form.seoTitle.length}/70 caracteres
              </p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={lbl}>Meta descripción</label>
                <AiBtn ctx="seoDescription" label="Generar" />
              </div>
              <textarea value={form.seoDescription} maxLength={160} rows={4}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                style={{ ...inp, resize: "none" }} />
              <p style={{ fontSize: "0.7rem", color: form.seoDescription.length > 140 ? "var(--color-warning)" : "var(--color-subtle)", marginTop: 4 }}>
                {form.seoDescription.length}/160 caracteres
              </p>
            </div>

            {/* Preview */}
            {(form.seoTitle || form.seoDescription) && (
              <div style={{ padding: "12px 14px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px solid var(--color-border)" }}>
                <p style={{ fontSize: "0.65rem", color: "var(--color-subtle)", marginBottom: 4 }}>Vista previa en Google</p>
                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#1a0dab", marginBottom: 2 }}>{form.seoTitle || form.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#545454", lineHeight: 1.4 }}>{form.seoDescription || "Sin descripción"}</div>
              </div>
            )}
          </>
        )}

        {activeTab === "promo" && (
          <>
            {!showPromo ? (
              <button
                onClick={() => setShowPromo(true)}
                style={{
                  padding: "10px", borderRadius: 8, border: "1px dashed var(--color-border)",
                  background: "transparent", color: "var(--color-brand-text)", cursor: "pointer",
                  fontSize: "0.8125rem", width: "100%",
                }}
              >
                + Programar promoción
              </button>
            ) : (
              <>
                {product.promotion?.active && (
                  <div style={{
                    padding: "8px 12px", background: "var(--color-success-bg)", borderRadius: 8,
                    border: "1px solid oklch(0.86 0.07 145)", fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 500,
                  }}>
                    ● Promoción activa ahora
                  </div>
                )}

                <div>
                  <label style={lbl}>Precio promocional</label>
                  <input type="number" step="0.01" min={0} value={promo.promoPrice}
                    onChange={(e) => setPromo({ ...promo, promoPrice: parseFloat(e.target.value) })} style={inp} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={lbl}>Inicio</label>
                    <input type="date" value={promo.startDate}
                      onChange={(e) => setPromo({ ...promo, startDate: e.target.value })} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Fin</label>
                    <input type="date" value={promo.endDate}
                      onChange={(e) => setPromo({ ...promo, endDate: e.target.value })} style={inp} />
                  </div>
                </div>

                <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>
                  Al terminar, el precio vuelve a ${product.originalPrice.toLocaleString("es-AR")}.
                </p>

                <button
                  onClick={async () => {
                    await fetch("/api/promotions", {
                      method: "DELETE", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ productId: product.id }),
                    });
                    setShowPromo(false);
                    toast("Promoción eliminada", "info");
                    router.refresh();
                  }}
                  style={{
                    padding: "7px", borderRadius: 8, border: "1px solid var(--color-danger-bg)",
                    background: "var(--color-danger-bg)", color: "var(--color-danger)",
                    cursor: "pointer", fontSize: "0.8125rem", width: "100%",
                  }}
                >
                  Eliminar promoción
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer link to full page */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
        <a
          href={`/products/${product.id}`}
          style={{ fontSize: "0.75rem", color: "var(--color-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Abrir vista completa
        </a>
      </div>
    </div>
  );
}
