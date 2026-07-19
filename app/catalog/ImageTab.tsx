"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ImageComposer from "./ImageComposer";
import { useIsMobile } from "@/components/useIsMobile";

type ImgTmpl = { id: number; name: string; backgroundUrl: string; coverUrl: string; shadowOffsetX: number; shadowOffsetY: number; shadowBlur: number; shadowOpacity: number };

export default function ImageTab({
  productId,
  imageTemplates,
  imgTmplId,
  setImgTmplId,
  productImageUrl,
  setProductImageUrl,
  fallbackImageUrl,
}: {
  productId: number;
  imageTemplates: ImgTmpl[];
  imgTmplId: number | null;
  setImgTmplId: (id: number | null) => void;
  productImageUrl: string;
  setProductImageUrl: (v: string) => void;
  fallbackImageUrl: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const sel = imageTemplates.find((t) => t.id === imgTmplId) || null;
  const layer = productImageUrl || fallbackImageUrl;

  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Drop the generated preview whenever inputs change (it's stale).
  useEffect(() => { setFinalUrl(null); }, [imgTmplId, productImageUrl]);
  // Revoke blob URLs when replaced/unmounted.
  useEffect(() => () => { if (finalUrl) URL.revokeObjectURL(finalUrl); }, [finalUrl]);

  const payload = () => ({ backgroundUrl: sel?.backgroundUrl, coverUrl: sel?.coverUrl, productImageUrl: layer });

  async function generate() {
    setComposing(true); setMsg(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundUrl: sel?.backgroundUrl, coverUrl: sel?.coverUrl, productUrl: layer,
          shadow: sel ? { offsetX: sel.shadowOffsetX, offsetY: sel.shadowOffsetY, blur: sel.shadowBlur, opacity: sel.shadowOpacity } : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo componer");
      setFinalUrl(URL.createObjectURL(await res.blob()));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Error" });
    } finally { setComposing(false); }
  }

  async function upload() {
    setUploading(true); setMsg(null);
    try {
      const res = await fetch(`/api/products/${productId}/image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo subir");
      setMsg({ kind: "ok", text: "Imagen subida a Tienda Nube ✓" });
      router.refresh(); // reflect the new image in the catalog/panel behind the modal
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Error" });
    } finally { setUploading(false); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 18 : 28, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div>
          <label style={lbl}>Plantilla de imagen</label>
          <select className="input" value={imgTmplId ?? ""} onChange={(e) => setImgTmplId(e.target.value ? Number(e.target.value) : null)} style={{ marginTop: 5 }}>
            <option value="">Sin plantilla (imagen simple)</option>
            {imageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {imageTemplates.length === 0 && (
            <p style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
              No hay plantillas de imagen. Creá una en <a href="/templates" style={{ color: "var(--color-brand)" }}>Plantillas → Imágenes</a>.
            </p>
          )}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <label style={lbl}>Imagen del producto (URL)</label>
            <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>1:1</span>
          </div>
          <input className="input" value={productImageUrl} onChange={(e) => setProductImageUrl(e.target.value)} placeholder="https://…/producto.png" style={{ fontSize: "0.8125rem" }} />
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", lineHeight: 1.5, margin: 0 }}>
          Se ubica centrada entre el fondo y el cover. La sombra del marco no la tapa. Si es más grande, se reescala al centro.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={generate} disabled={composing || !layer} style={{ fontSize: "0.8125rem" }}>
            {composing ? "Componiendo…" : "Ver resultado final"}
          </button>
          <button className="btn-primary" onClick={upload} disabled={uploading || !imgTmplId || !layer} style={{ fontSize: "0.8125rem" }}>
            {uploading ? "Subiendo…" : "Subir a Tienda Nube"}
          </button>
        </div>
        {msg && <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: msg.kind === "ok" ? "var(--color-success)" : "var(--color-danger)" }}>{msg.text}</span>}
      </div>

      <div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-subtle)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
          {finalUrl ? "Resultado final" : "Vista previa rápida"}
        </div>
        {finalUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={finalUrl} alt="" style={{ width: 360, maxWidth: "100%", aspectRatio: "1/1", borderRadius: "var(--radius-input)", border: "1px solid var(--color-border)", objectFit: "contain" }} />
        ) : (
          <ImageComposer backgroundUrl={sel?.backgroundUrl} coverUrl={sel?.coverUrl} productUrl={layer} size={360} />
        )}
        {!finalUrl && <p style={{ fontSize: "0.72rem", color: "var(--color-faint)", marginTop: 8 }}>Aproximada — la sombra real se ve en “Ver resultado final”.</p>}
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-muted)" };
