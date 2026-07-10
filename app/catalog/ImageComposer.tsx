"use client";
import { LAYOUT, pct } from "@/lib/imageTemplates";

/**
 * Renders the layered composition (background → product → cover) as a square
 * preview. Pure CSS layering; the product image scales down centered to fit.
 */
export default function ImageComposer({
  backgroundUrl,
  coverUrl,
  productUrl,
  size = 320,
}: {
  backgroundUrl?: string | null;
  coverUrl?: string | null;
  productUrl?: string | null;
  size?: number;
}) {
  const box = (r: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
    position: "absolute",
    left: pct(r.x),
    top: pct(r.y),
    width: pct(r.w),
    height: pct(r.h),
  });

  return (
    <div
      style={{
        position: "relative",
        width: size,
        maxWidth: "100%",
        aspectRatio: "1 / 1",
        borderRadius: "var(--radius-input)",
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        // subtle checkerboard so transparent PNGs are legible
        background:
          "repeating-conic-gradient(var(--color-surface-2) 0% 25%, var(--color-surface) 0% 50%) 0 / 20px 20px",
      }}
    >
      {/* 1. Background (fills canvas) */}
      {backgroundUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backgroundUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {/* 2. Product (centered, bottom-aligned to cover; scales down to fit) */}
      {productUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={productUrl} alt="" style={{ ...box(LAYOUT.product), objectFit: "contain" }} />
      )}
      {/* 3. Cover frame on top */}
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" style={{ ...box(LAYOUT.cover), objectFit: "contain" }} />
      )}
      {/* Empty state */}
      {!backgroundUrl && !coverUrl && !productUrl && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-faint)", fontSize: "0.8125rem" }}>
          Sin capas
        </div>
      )}
    </div>
  );
}
