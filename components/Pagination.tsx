"use client";
import { useRouter, useSearchParams } from "next/navigation";

interface Props { page: number; totalPages: number }

export default function Pagination({ page, totalPages }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function go(p: number) {
    const np = new URLSearchParams(params.toString());
    np.set("page", String(p));
    router.push(`/products?${np.toString()}`);
  }

  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  const base: React.CSSProperties = {
    height: 30, minWidth: 30, borderRadius: 7,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    fontSize: "0.8125rem", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: "0 8px", color: "var(--color-muted)",
    boxShadow: "0 1px 2px oklch(0.16 0.01 252 / 0.05)",
    transition: "background 0.1s",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 20 }}>
      <button onClick={() => go(page - 1)} disabled={page === 1} style={{ ...base, opacity: page === 1 ? 0.35 : 1 }}>‹</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} style={{ color: "var(--color-subtle)", fontSize: "0.8125rem", padding: "0 2px" }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => go(p as number)}
            style={p === page
              ? { ...base, background: "var(--color-brand)", color: "white", border: "1px solid var(--color-brand)", fontWeight: 600 }
              : base}
          >
            {p}
          </button>
        )
      )}
      <button onClick={() => go(page + 1)} disabled={page === totalPages} style={{ ...base, opacity: page === totalPages ? 0.35 : 1 }}>›</button>
    </div>
  );
}
