"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "No se pudo ingresar.");
      }
      const next = params.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--color-bg)" }}>
      <div className="card-float" style={{ width: "100%", maxWidth: 380, padding: "32px 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--color-brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.0625rem" }}>M</div>
          <div style={{ fontSize: "1.0625rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Milester</div>
        </div>
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Acceso privado</h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: "0 0 20px", lineHeight: 1.5 }}>
          Esta herramienta administra tu tienda. Ingresá la contraseña para continuar.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
          />
          {error && <span style={{ fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>}
          <button className="btn-primary" type="submit" disabled={loading || !password} style={{ marginTop: 4 }}>
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
