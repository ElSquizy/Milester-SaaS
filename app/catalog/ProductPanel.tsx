"use client";
import { useState } from "react";
import CollectionPicker from "./CollectionPicker";

type Variant = { id: number; price: number; stock: number | null; sku: string | null };

type Product = {
  id: number;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  price: number;
  promotionalPrice: number | null;
  originalPrice: number;
  sku: string | null;
  published: boolean;
  tags: string;
  categoryName: string | null;
  imageUrl: string | null;
  syncStatus: string;
  unitsSold: number;
  lastSoldAt: Date | string | null;
  variants: Variant[];
  categoryIds: number[];
  categoryChips: Array<{ id: number; name: string }>;
};

interface Props {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
  onAdvanced: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

export default function ProductPanel({ product, onClose, onSaved, onAdvanced }: Props) {
  const originalTags: string[] = (() => { try { return JSON.parse(product.tags); } catch { return []; } })();

  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [promo, setPromo] = useState(product.promotionalPrice != null ? String(product.promotionalPrice) : "");
  const [sku, setSku] = useState(product.sku || "");
  const [published, setPublished] = useState(product.published);
  const [tagInput, setTagInput] = useState(originalTags.join(", "));
  const [catIds, setCatIds] = useState<Set<number>>(new Set(product.categoryIds));
  const [extraCatNames, setExtraCatNames] = useState<Map<number, string>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const parsedPrice = parseFloat(price.replace(/\./g, "").replace(",", "."));
  const parsedPromo = promo.trim() === "" ? null : parseFloat(promo.replace(/\./g, "").replace(",", "."));
  const normSku = sku.trim() || null;
  const parsedTags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);

  // Map of local category id -> name, for chips (originals + any added via the picker).
  const catNameById = new Map<number, string>([
    ...product.categoryChips.map((c) => [c.id, c.name] as [number, string]),
    ...extraCatNames,
  ]);
  const originalCatIds = new Set(product.categoryIds);

  // Compute the diff between edited state and the original (last-synced) values.
  const diffs: { label: string; from: React.ReactNode; to: React.ReactNode }[] = [];
  if (name !== product.name) diffs.push({ label: "Nombre", from: product.name, to: name });
  if (!isNaN(parsedPrice) && parsedPrice !== product.price)
    diffs.push({ label: "Precio base", from: fmt(product.price), to: fmt(parsedPrice) });
  if ((parsedPromo ?? null) !== (product.promotionalPrice ?? null))
    diffs.push({ label: "Precio promocional", from: product.promotionalPrice != null ? fmt(product.promotionalPrice) : "—", to: parsedPromo != null ? fmt(parsedPromo) : "—" });
  if (normSku !== (product.sku || null))
    diffs.push({ label: "SKU", from: product.sku || "—", to: normSku || "—" });
  if (published !== product.published)
    diffs.push({ label: "Visibilidad", from: product.published ? "Publicado" : "Oculto", to: published ? "Publicado" : "Oculto" });
  const addedTags = parsedTags.filter((t) => !originalTags.includes(t));
  const removedTags = originalTags.filter((t) => !parsedTags.includes(t));
  if (addedTags.length || removedTags.length)
    diffs.push({
      label: "Etiquetas",
      from: originalTags.join(", ") || "—",
      to: [...addedTags.map((t) => `+ ${t}`), ...removedTags.map((t) => `− ${t}`)].join("  "),
    });
  const addedCats = [...catIds].filter((id) => !originalCatIds.has(id));
  const removedCats = [...originalCatIds].filter((id) => !catIds.has(id));
  if (addedCats.length || removedCats.length)
    diffs.push({
      label: "Colecciones",
      from: `${originalCatIds.size}`,
      to: `${catIds.size} (${addedCats.length ? `+${addedCats.length} ` : ""}${removedCats.length ? `−${removedCats.length}` : ""})`.trim(),
    });

  const hasChanges = diffs.length > 0;

  function toggleCat(id: number) {
    setCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(sync: boolean) {
    setSaving(true);
    setError("");
    try {
      if (isNaN(parsedPrice)) throw new Error("Precio inválido");

      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price: parsedPrice, promotionalPrice: parsedPromo, sku: normSku, published, tags: JSON.stringify(parsedTags), categoryIds: [...catIds], sync }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onSaved();
      }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(17,24,39,0.16)",
          zIndex: 40,
        }}
        className="anim-in"
      />

      {/* Floating panel */}
      <div
        className="anim-panel"
        style={{
          position: "fixed", top: 14, right: 14, bottom: 14,
          width: 420, maxWidth: "calc(100vw - 28px)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-card)",
          display: "flex", flexDirection: "column",
          zIndex: 50,
          boxShadow: "var(--shadow-float)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px",
          borderBottom: "1px solid var(--color-divider)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 10, border: "1px solid var(--color-divider)" }}
              />
            )}
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", letterSpacing: "-0.01em" }}>
                Edición rápida
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 1 }}>
                ID {product.id}{product.sku && ` · ${product.sku}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={onAdvanced}
              title="Edición avanzada"
              style={{
                width: 32, height: 32, borderRadius: 9, border: "1px solid var(--color-border)",
                background: "var(--color-surface)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-brand)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 9, border: "none",
                background: "var(--color-surface-2)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-muted)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Advanced-edit hint bar */}
        <button onClick={onAdvanced} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 20px", border: "none", borderBottom: "1px solid var(--color-divider)",
          background: "var(--color-brand-light)", color: "var(--color-brand)",
          fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", textAlign: "left",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
          Edición avanzada (descripción, SEO, imagen)
          <span style={{ marginLeft: "auto" }}>→</span>
        </button>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Name */}
            <Field label="Nombre">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </Field>

            {/* Prices — base + promotional */}
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Precio base">
                <div style={{ position: "relative" }}>
                  <span style={dollarStyle}>$</span>
                  <input type="text" value={price} onChange={(e) => setPrice(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 22, fontVariantNumeric: "tabular-nums", color: "var(--color-muted)" }} />
                </div>
              </Field>
              <Field label="Precio promocional" hint="vacío = sin oferta">
                <div style={{ position: "relative" }}>
                  <span style={{ ...dollarStyle, color: promo.trim() === "" ? "var(--color-faint)" : "var(--color-muted)" }}>$</span>
                  <input type="text" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="—"
                    style={{ ...inputStyle, paddingLeft: 22, fontVariantNumeric: "tabular-nums",
                      color: promo.trim() === "" ? "var(--color-faint)" : (parsedPromo != null && parsedPromo < parsedPrice ? "var(--color-success)" : "var(--color-warning)"),
                      fontWeight: 600 }} />
                </div>
              </Field>
            </div>

            {/* SKU */}
            <Field label="SKU" hint="Código interno">
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej: PS5-DIG-0601"
                style={{ ...inputStyle, fontFamily: "var(--font-mono), monospace" }} />
            </Field>

            {/* Visibility — iOS switch */}
            <Field label="Visibilidad">
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: "var(--radius-input)",
                border: "1px solid var(--color-border)", background: "var(--color-surface)",
              }}>
                <span style={{ fontSize: "0.875rem", color: "var(--color-ink)", fontWeight: 500 }}>
                  {published ? "Publicado" : "Oculto"}
                </span>
                <button className="switch" data-on={published} aria-label="Visibilidad" onClick={() => setPublished(!published)} />
              </div>
            </Field>

            {/* Tags */}
            <Field label="Etiquetas" hint="Separadas por coma">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="verano, oferta, nuevo..."
                style={inputStyle}
              />
            </Field>

            {/* Collections */}
            <Field label="Colecciones" hint={`${catIds.size}`}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: showPicker ? 10 : 8 }}>
                {[...catIds].map((id) => (
                  <span key={id} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 8px", borderRadius: 7, background: "var(--color-surface-2)",
                    border: "1px solid var(--color-divider)", fontSize: "0.8125rem", color: "var(--color-ink)",
                  }}>
                    {catNameById.get(id) || `#${id}`}
                    <button onClick={() => toggleCat(id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-faint)", padding: 0, fontSize: "1rem", lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {catIds.size === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--color-faint)" }}>Sin colecciones</span>}
              </div>
              {showPicker ? (
                <CollectionPicker selectedIds={catIds} onToggle={(id, nm) => {
                  setExtraCatNames((prev) => new Map(prev).set(id, nm));
                  toggleCat(id);
                }} />
              ) : (
                <button onClick={() => setShowPicker(true)} style={{
                  padding: "6px 12px", borderRadius: 7, border: "1px dashed var(--color-border)",
                  background: "transparent", color: "var(--color-muted)", fontSize: "0.8125rem", cursor: "pointer",
                }}>
                  + Editar colecciones
                </button>
              )}
            </Field>

            {/* Variants — just a count; full management lives in advanced edit */}
            {product.variants.length > 0 && (
              <button
                onClick={onAdvanced}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  padding: "11px 14px", borderRadius: "var(--radius-input)",
                  border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-ink)" }}>Variantes</span>
                <span style={{
                  minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999,
                  background: "var(--color-surface-2)", color: "var(--color-muted)",
                  fontSize: "0.75rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>{product.variants.length}</span>
                <span style={{ marginLeft: "auto", fontSize: "0.8125rem", color: "var(--color-brand)", fontWeight: 600 }}>Gestionar →</span>
              </button>
            )}

            {/* Sales */}
            <div style={{
              display: "flex", gap: 1, background: "var(--color-border)",
              border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden",
            }}>
              <div style={{ flex: 1, background: "var(--color-surface)", padding: "11px 14px" }}>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {product.unitsSold.toLocaleString("es-AR")}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 3 }}>Unidades vendidas</div>
              </div>
              <div style={{ flex: 1, background: "var(--color-surface)", padding: "11px 14px" }}>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)", lineHeight: 1 }}>
                  {product.lastSoldAt
                    ? new Date(product.lastSoldAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 3 }}>Última venta</div>
              </div>
            </div>

            {/* Sync status */}
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "var(--color-surface-2)", border: "1px solid var(--color-divider)",
              fontSize: "0.8125rem", color: "var(--color-muted)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>Estado sincronización</span>
              <SyncStatus status={product.syncStatus} />
            </div>

            {/* Pending changes diff */}
            {hasChanges && (
              <div style={{
                border: "1px solid var(--color-warning)", borderRadius: 8, overflow: "hidden",
                background: "var(--color-warning-bg)",
              }}>
                <div style={{
                  padding: "8px 14px", borderBottom: "1px solid var(--color-warning)",
                  fontSize: "0.75rem", fontWeight: 600, color: "var(--color-warning)",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontSize: "0.6875rem" }}>⚠</span>
                  Cambios pendientes de sincronizar
                </div>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {diffs.map((d) => (
                    <div key={d.label} style={{ fontSize: "0.8125rem" }}>
                      <div style={{ color: "var(--color-muted)", fontSize: "0.75rem", marginBottom: 2 }}>{d.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--color-subtle)", textDecoration: "line-through" }}>{d.from}</span>
                        <span style={{ color: "var(--color-faint)" }}>→</span>
                        <span style={{ color: "var(--color-ink)", fontWeight: 600 }}>{d.to}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--color-divider)",
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {error && (
            <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>
          )}
          {saved && (
            <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-success)", fontWeight: 600 }}>
              ✓ Guardado
            </span>
          )}
          {!error && !saved && <span style={{ flex: 1 }} />}
          <button
            className="btn-primary"
            onClick={() => handleSave(false)}
            disabled={saving || !hasChanges}
            title="Guarda los cambios. Se suben a Tienda Nube desde el botón de sincronizar del panel."
            style={{ padding: "8px 18px", whiteSpace: "nowrap" }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={labelStyle}>{label}</label>
        {hint && <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SyncStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    synced:  { color: "var(--color-success)", label: "Sincronizado" },
    pending: { color: "var(--color-warning)", label: "Pendiente" },
    error:   { color: "var(--color-danger)",  label: "Error" },
  };
  const s = map[status] || { color: "var(--color-subtle)", label: status };
  return (
    <span style={{ color: s.color, fontWeight: 500, fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
      {s.label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)",
  background: "var(--color-surface)", fontSize: "0.875rem",
  color: "var(--color-ink)", outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)",
  display: "block",
};

const dollarStyle: React.CSSProperties = {
  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
  fontSize: "0.875rem", color: "var(--color-muted)", pointerEvents: "none",
};
