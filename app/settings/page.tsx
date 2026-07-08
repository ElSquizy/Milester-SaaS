"use client";
import { useEffect, useRef, useState } from "react";

type ImportEvent =
  | { status: "fetching"; message: string; total?: number }
  | { status: "progress"; processed: number; total: number; created: number; updated: number }
  | { status: "done"; total: number; created: number; updated: number; deleted?: number }
  | { status: "error"; message: string };

export default function SettingsPage() {
  const [storeId, setStoreId] = useState("");
  const [appId, setAppId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");

  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ value: number; total: number } | null>(null);
  const [importDone, setImportDone] = useState<{ created: number; updated: number; total: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Orders / sales import
  const [ordersImporting, setOrdersImporting] = useState(false);
  const [ordersMsg, setOrdersMsg] = useState("");
  const [ordersProgress, setOrdersProgress] = useState<{ value: number; total: number } | null>(null);
  const [ordersDone, setOrdersDone] = useState<{ saved: number; productsWithSales: number } | null>(null);
  const [ordersCount, setOrdersCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/tiendanube/orders", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setOrdersCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  function startOrdersImport() {
    setOrdersImporting(true);
    setOrdersMsg("");
    setOrdersProgress(null);
    setOrdersDone(null);

    const es = new EventSource("/api/tiendanube/orders");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      switch (data.status) {
        case "fetching":
        case "aggregating":
          setOrdersMsg(data.message);
          break;
        case "progress":
          setOrdersProgress({ value: data.saved, total: data.total });
          setOrdersMsg(`${data.saved.toLocaleString("es-AR")} / ${data.total.toLocaleString("es-AR")} órdenes guardadas`);
          break;
        case "done":
          setOrdersImporting(false);
          setOrdersDone({ saved: data.saved, productsWithSales: data.productsWithSales });
          setOrdersProgress({ value: data.total, total: data.total });
          setOrdersMsg(`Listo — ${data.saved.toLocaleString("es-AR")} órdenes, ${data.productsWithSales} productos con ventas`);
          setOrdersCount(data.saved);
          es.close();
          break;
        case "error":
          setOrdersImporting(false);
          setOrdersMsg(`Error: ${data.message}`);
          es.close();
          break;
      }
    };
    es.onerror = () => {
      setOrdersImporting(false);
      setOrdersMsg("Error de conexión");
      es.close();
    };
  }

  // Single INBOUND sync (TN → SaaS): pulls collections + catalog + sales + customers + campaigns.
  const [inboundBusy, setInboundBusy] = useState(false);
  const [inboundMsg, setInboundMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runInbound() {
    setInboundBusy(true);
    setInboundMsg(null);
    try {
      const res = await fetch("/api/sync/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      const cat = d.catalog || {};
      const parts: string[] = [];
      if (d.collections) parts.push(`${d.collections} colecciones`);
      if (cat.created || cat.updated) parts.push(`${(cat.created || 0) + (cat.updated || 0)} productos`);
      if (cat.deleted) parts.push(`${cat.deleted} eliminados`);
      if (d.sales && (d.sales.created || d.sales.updated)) parts.push(`${d.sales.created + d.sales.updated} ventas`);
      setInboundMsg({ ok: true, text: parts.length ? `Actualizado: ${parts.join(" · ")}` : "Todo al día" });
    } catch (e) {
      setInboundMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setInboundBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data) return;
        if (data.storeId) setStoreId(data.storeId);
        if (data.appId) setAppId(data.appId);
        setHasClientSecret(!!data.hasClientSecret);
        setConnected(!!data.hasAccessToken);
        setHasSettings(!!data.hasAccessToken);
      })
      .catch(() => {});

    setRedirectUrl(`${window.location.origin}/api/tiendanube/oauth/callback`);

    // Surface OAuth callback result from the URL.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setBanner({ type: "ok", text: "Conectado con Tienda Nube correctamente." });
      setConnected(true);
      setHasSettings(true);
      window.history.replaceState({}, "", "/settings");
    } else if (params.get("error")) {
      setBanner({ type: "err", text: `Error al conectar: ${params.get("error")}` });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function saveCredentials() {
    if (!appId.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appId.trim(), clientSecret: clientSecret.trim() || undefined }),
      });
      setSaved(true);
      setHasClientSecret(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function connect() {
    window.location.href = "/api/tiendanube/oauth/start";
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [importLog]);

  function startImport() {
    setImporting(true);
    setImportLog([]);
    setProgress(null);
    setImportDone(null);

    const es = new EventSource("/api/tiendanube/import");
    es.onmessage = (e) => {
      const data: ImportEvent = JSON.parse(e.data);
      if (data.status === "fetching") {
        setImportLog((l) => [...l, data.message]);
      } else if (data.status === "progress") {
        setProgress({ value: data.processed, total: data.total });
        setImportLog(() => [`${data.processed.toLocaleString("es-AR")} / ${data.total.toLocaleString("es-AR")} procesados`]);
      } else if (data.status === "done") {
        setImporting(false);
        setImportDone(data);
        setProgress({ value: data.total, total: data.total });
        setImportLog((l) => [...l, `Listo — ${data.created} nuevos, ${data.updated} actualizados${data.deleted ? `, ${data.deleted} eliminados` : ""}`]);
        es.close();
      } else if (data.status === "error") {
        setImporting(false);
        setImportLog((l) => [...l, `Error: ${(data as { status: string; message: string }).message}`]);
        es.close();
      }
    };
    es.onerror = () => {
      setImporting(false);
      setImportLog((l) => [...l, "Error de conexión"]);
      es.close();
    };
  }

  const pct = progress ? Math.round((progress.value / progress.total) * 100) : 0;

  const ordersPct = ordersProgress ? Math.round((ordersProgress.value / ordersProgress.total) * 100) : 0;

  return (
    <div style={{ height: "100dvh", overflowY: "auto", padding: "48px 48px 80px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 48, maxWidth: 560 }}>

      <div>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>
          Configuración
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: 0 }}>
          Conectá tu tienda y gestioná la importación de productos y ventas.
        </p>
      </div>

      {/* OAuth banner */}
      {banner && (
        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: banner.type === "ok" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
          border: `1px solid ${banner.type === "ok" ? "var(--color-success)" : "var(--color-danger)"}`,
          color: banner.type === "ok" ? "var(--color-success)" : "var(--color-danger)",
          fontSize: "0.875rem", fontWeight: 500,
        }}>
          {banner.type === "ok" ? "✓ " : "✕ "}{banner.text}
        </div>
      )}

      {/* Connection */}
      <section style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.015em" }}>
          Conexión con Tienda Nube
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 24px" }}>
          Pegá el <strong style={{ color: "var(--color-ink)" }}>Client ID</strong> y{" "}
          <strong style={{ color: "var(--color-ink)" }}>Client Secret</strong> de tu app (panel de desarrolladores de Tienda Nube),
          guardá, y conectá. El access token se genera y guarda solo.
        </p>

        {/* Connection status */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", marginBottom: 20, borderRadius: 10,
          background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: connected ? "var(--color-success)" : "var(--color-faint)",
          }} />
          <span style={{ fontSize: "0.875rem", color: "var(--color-ink)", fontWeight: 500 }}>
            {connected ? `Conectado · tienda ${storeId}` : "Sin conectar"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Redirect URL to register */}
          <div>
            <span style={lbl}>URL de redirección (registrala en tu app)</span>
            <code style={{
              display: "block", marginTop: 6, padding: "9px 12px", borderRadius: 8,
              background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
              fontSize: "0.8125rem", color: "var(--color-muted)", fontFamily: "var(--font-mono), monospace",
              wordBreak: "break-all",
            }}>
              {redirectUrl}
            </code>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Client ID (App ID)</span>
            <input type="text" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="12345" style={inp} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Client Secret</span>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={hasClientSecret ? "•••••••••• (guardado)" : "••••••••••••••••"}
              style={inp}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <button
              onClick={saveCredentials}
              disabled={saving || !appId.trim()}
              style={{
                padding: "9px 20px", borderRadius: 8,
                border: "1px solid var(--color-border)", background: "var(--color-surface)",
                color: "var(--color-ink)", fontWeight: 500, fontSize: "0.9375rem",
                cursor: saving || !appId.trim() ? "default" : "pointer",
                opacity: !appId.trim() ? 0.5 : 1,
              }}
            >
              {saving ? "Guardando..." : "Guardar credenciales"}
            </button>
            <button
              onClick={connect}
              disabled={!appId.trim() || (!hasClientSecret && !clientSecret.trim())}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "9px 22px", borderRadius: 8, border: "none",
                background: "var(--color-brand)", color: "var(--color-brand-ink)",
                fontWeight: 600, fontSize: "0.9375rem",
                cursor: !appId.trim() ? "default" : "pointer",
                opacity: !appId.trim() || (!hasClientSecret && !clientSecret.trim()) ? 0.5 : 1,
              }}
            >
              {connected ? "Reconectar" : "Conectar con Tienda Nube"}
            </button>
            {saved && (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-success)" }}>✓ Guardado</span>
            )}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", margin: 0 }}>
            Asegurate de que tu app tenga el permiso <code style={{ fontFamily: "var(--font-mono), monospace" }}>read_orders</code> para importar ventas.
          </p>
        </div>
      </section>

      <div style={{ height: 1, background: "var(--color-divider)" }} />

      {/* Sincronización de ENTRADA — un único botón que trae todo desde Tienda Nube */}
      <section style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Sincronización de entrada
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 16px" }}>
          Trae la versión actual de Tienda Nube hacia tu sistema (colecciones, catálogo, ventas, clientes y campañas).
          También corre sola cada vez que cambiás de pestaña. Para subir tus cambios a Tienda Nube, usá el botón del panel lateral.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={runInbound}
            disabled={inboundBusy || !hasSettings}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 8, border: "none",
              background: "var(--color-brand)", color: "var(--color-brand-ink)",
              fontWeight: 600, fontSize: "0.9375rem",
              cursor: inboundBusy || !hasSettings ? "default" : "pointer", opacity: !hasSettings ? 0.4 : 1,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={inboundBusy ? { animation: "spin 0.9s linear infinite" } : undefined}>
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {inboundBusy ? "Sincronizando…" : "Sincronizar desde Tienda Nube"}
          </button>
          {inboundMsg && (
            <span style={{ fontSize: "0.8125rem", color: inboundMsg.ok ? "var(--color-success)" : "var(--color-danger)", fontWeight: 500 }}>
              {inboundMsg.ok ? "✓ " : "✕ "}{inboundMsg.text}
            </span>
          )}
        </div>
      </section>

      <div style={{ height: 1, background: "var(--color-divider)" }} />

      {/* Importación completa (avanzado) — reimporta todo en streaming, para arranques o reparaciones */}
      <section style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.015em" }}>
          Catálogo · importación completa (avanzado)
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 24px" }}>
          Descarga todos los productos desde Tienda Nube. Útil para el primer arranque o si algo quedó muy desincronizado.
        </p>

        <button
          onClick={startImport}
          disabled={importing || !hasSettings}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 22px", borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            fontWeight: 500, fontSize: "0.9375rem",
            cursor: importing || !hasSettings ? "default" : "pointer",
            opacity: !hasSettings ? 0.4 : 1,
          }}
        >
          {importing ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              Importando...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Importar ahora
            </>
          )}
        </button>

        {(importing || importLog.length > 0) && (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            {progress && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {progress.value.toLocaleString("es-AR")} / {progress.total.toLocaleString("es-AR")}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                </div>
                <div style={{ height: 5, background: "var(--color-surface-2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--color-border)" }}>
                  <div style={{
                    height: "100%", borderRadius: 999,
                    width: `${pct}%`,
                    background: importDone ? "var(--color-success)" : "var(--color-brand)",
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            )}

            <div ref={logRef} style={{
              padding: "12px 14px",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              maxHeight: 120, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 2,
            }}>
              {importLog.map((line, i) => (
                <span key={i} style={{
                  fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums",
                  color: i === importLog.length - 1 ? "var(--color-ink)" : "var(--color-subtle)",
                }}>
                  {line}
                </span>
              ))}
            </div>

            {importDone && (
              <div style={{ display: "flex", gap: 28, paddingTop: 4 }}>
                {[
                  { n: importDone.total, label: "Total", color: "var(--color-ink)" },
                  { n: importDone.created, label: "Nuevos", color: "var(--color-success)" },
                  { n: importDone.updated, label: "Actualizados", color: "var(--color-muted)" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: s.color }}>
                      {s.n.toLocaleString("es-AR")}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Import orders / sales */}
      <section style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.015em" }}>
          Ventas
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "0 0 24px" }}>
          Descarga el historial de órdenes para calcular qué productos se venden y cuáles no.
          {ordersCount != null && ordersCount > 0 && (
            <> Actualmente hay <strong style={{ color: "var(--color-ink)" }}>{ordersCount.toLocaleString("es-AR")}</strong> órdenes importadas.</>
          )}
        </p>

        <button
          onClick={startOrdersImport}
          disabled={ordersImporting || !hasSettings}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 22px", borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            fontWeight: 500, fontSize: "0.9375rem",
            cursor: ordersImporting || !hasSettings ? "default" : "pointer",
            opacity: !hasSettings ? 0.4 : 1,
          }}
        >
          {ordersImporting ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Importando ventas...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
              </svg>
              {ordersCount && ordersCount > 0 ? "Actualizar ventas" : "Importar ventas"}
            </>
          )}
        </button>

        {(ordersImporting || ordersMsg) && (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            {ordersProgress && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {ordersProgress.value.toLocaleString("es-AR")} / {ordersProgress.total.toLocaleString("es-AR")}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{ordersPct}%</span>
                </div>
                <div style={{ height: 5, background: "var(--color-surface-2)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--color-border)" }}>
                  <div style={{
                    height: "100%", borderRadius: 999, width: `${ordersPct}%`,
                    background: ordersDone ? "var(--color-success)" : "var(--color-brand)",
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            )}

            <div style={{
              padding: "12px 14px", background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)", borderRadius: 8,
              fontSize: "0.8125rem", color: "var(--color-ink)", fontVariantNumeric: "tabular-nums",
            }}>
              {ordersMsg}
            </div>

            {ordersDone && (
              <div style={{ display: "flex", gap: 28, paddingTop: 4 }}>
                {[
                  { n: ordersDone.saved, label: "Órdenes", color: "var(--color-ink)" },
                  { n: ordersDone.productsWithSales, label: "Productos con ventas", color: "var(--color-success)" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: s.color }}>
                      {s.n.toLocaleString("es-AR")}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)", color: "var(--color-ink)",
  fontSize: "0.9375rem", outline: "none",
};
