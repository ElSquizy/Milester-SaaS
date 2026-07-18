"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const NAV = [
  {
    href: "/",
    label: "Inicio",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/catalog",
    label: "Catálogo",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    href: "/collections",
    label: "Colecciones",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
      </svg>
    ),
  },
  {
    href: "/campaigns",
    label: "Campañas",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  },
  {
    href: "/sales",
    label: "Ventas",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/customers",
    label: "Clientes",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/changes",
    label: "Actividad",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function relTime(iso: string | null): string {
  if (!iso) return "nunca";
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "recién";
  if (secs < 3600) return `hace ${Math.round(secs / 60)} min`;
  if (secs < 86400) return `hace ${Math.round(secs / 3600)} h`;
  return `hace ${Math.round(secs / 86400)} d`;
}

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0); // last push errored — needs an explicit retry
  const [pulling, setPulling] = useState(false);
  const [push, setPush] = useState<{ active: boolean; done: number; total: number; errors: number }>({ active: false, done: 0, total: 0, errors: 0 });
  const [lastPull, setLastPull] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const refreshPending = useCallback(() => {
    fetch("/api/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { setPending(d.pending || 0); setFailed(d.errors || 0); })
      .catch(() => {});
  }, []);

  // INBOUND sync (TN → SaaS): automatic, throttled server-side. Runs on navigation.
  const runPull = useCallback(async () => {
    setPulling(true);
    try {
      const res = await fetch("/api/sync/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json().catch(() => ({}));
      if (d.lastPullAt) setLastPull(d.lastPullAt);
      if (!d.skipped) router.refresh();
    } catch { /* ignore */ } finally {
      setPulling(false);
      refreshPending();
    }
  }, [router, refreshPending]);

  // OUTBOUND sync (SaaS → TN): push pending local changes. Streamed.
  // mode "errors" re-pushes only the products whose last attempt failed —
  // those drop out of the normal queue, so they need an explicit retry.
  const runPush = useCallback((mode?: "errors") => {
    const queued = mode === "errors" ? failed : pending;
    if (push.active || queued === 0) return;

    // The server pushes a slice per request; chain batches until nothing is left.
    // Progress is cumulative across batches so the button reads naturally.
    let carried = 0;
    let carriedErrors = 0;
    setPush({ active: true, done: 0, total: queued, errors: 0 });

    const finish = () => {
      setTimeout(() => { setPush({ active: false, done: 0, total: 0, errors: 0 }); refreshPending(); router.refresh(); }, 1200);
    };

    const runBatch = () => {
      const es = new EventSource(mode === "errors" ? "/api/sync?mode=errors" : "/api/sync");
      esRef.current = es;
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.status === "start") {
          setPush((p) => ({ ...p, total: carried + (data.queued ?? data.total) }));
        } else if (data.status === "progress") {
          setPush((p) => ({ ...p, done: carried + data.done, errors: carriedErrors + data.errors }));
        } else if (data.status === "done") {
          es.close();
          carried += data.done;
          carriedErrors += data.errors;
          setPush((p) => ({ ...p, done: carried, errors: carriedErrors }));
          // Guard against a stuck queue: only continue if this batch moved something.
          if (data.remaining > 0 && data.done > 0) runBatch();
          else finish();
        } else if (data.status === "error") {
          es.close();
          setPush({ active: false, done: 0, total: 0, errors: 0 });
          refreshPending();
        }
      };
      es.onerror = () => { es.close(); setPush({ active: false, done: 0, total: 0, errors: 0 }); refreshPending(); };
    };

    runBatch();
  }, [push.active, pending, failed, router, refreshPending]);

  // On navigation: refresh the pending count and run the automatic inbound pull.
  useEffect(() => {
    refreshPending();
    runPull();
  }, [path, runPull, refreshPending]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [path]);

  // Lock body scroll while the drawer is open (mobile).
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  // The pending count used to refresh only on navigation, so edits made while
  // staying on a page left the button stale. Poll it, and re-check as soon as
  // the tab regains focus (after editing elsewhere).
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) refreshPending(); }, 10_000);
    const onFocus = () => refreshPending();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshPending]);

  return (
    <>
    {/* Mobile top bar — only shown below the breakpoint (see globals.css). */}
    <header className="app-topbar">
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Abrir menú"
        style={{
          width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "var(--radius-control)", border: "1px solid var(--color-border)",
          background: "var(--color-surface)", color: "var(--color-ink)", cursor: "pointer", flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 8, background: "var(--color-brand)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="11" height="9" viewBox="0 0 13 11" fill="none">
            <path d="M1 10V1l5.5 6.5L12 1v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-ink)", letterSpacing: "-0.02em" }}>Milester</span>
      </div>
    </header>

    {/* Backdrop — only rendered on mobile when the drawer is open. */}
    {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}

    <aside className="app-sidebar" data-open={drawerOpen}>
      {/* Wordmark */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "18px 16px 16px",
        borderBottom: "1px solid var(--color-divider)",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9,
          background: "var(--color-brand)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="13" height="11" viewBox="0 0 13 11" fill="none">
            <path d="M1 10V1l5.5 6.5L12 1v9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{
          fontSize: "0.9375rem", fontWeight: 600,
          color: "var(--color-ink)", letterSpacing: "-0.02em",
        }}>
          Milester
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ href, label, icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <NavItem key={href} href={href} label={label} active={active}>
              {icon}
            </NavItem>
          );
        })}
      </nav>

      {/* Sync footer: OUTBOUND push (SaaS → TN). Inbound pull runs automatically. */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--color-divider)" }}>
        <button
          onClick={() => runPush()}
          disabled={push.active || pending === 0}
          title={pending === 0 ? "No hay cambios para subir" : "Subir tus cambios a Tienda Nube"}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "9px 11px", borderRadius: "var(--radius-control)",
            border: "1px solid " + (pending > 0 && !push.active ? "var(--color-brand)" : "var(--color-border)"),
            background: pending > 0 && !push.active ? "var(--color-brand)" : "var(--color-surface)",
            color: pending > 0 && !push.active ? "var(--color-brand-ink)" : "var(--color-subtle)",
            fontSize: "0.8125rem", fontWeight: 600,
            cursor: push.active || pending === 0 ? "default" : "pointer",
            boxShadow: pending > 0 && !push.active ? "var(--shadow-card)" : "none",
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={push.active ? { animation: "spin 0.9s linear infinite" } : undefined}
          >
            {push.active
              ? <><path d="M21 12a9 9 0 1 1-6.219-8.56" /></>
              : <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>}
          </svg>
          {push.active
            ? `Subiendo ${push.done}/${push.total}…`
            : pending > 0
            ? `Subir ${pending} ${pending === 1 ? "cambio" : "cambios"}`
            : "Todo sincronizado"}
        </button>

        {/* Failed pushes leave the normal queue, so they need their own retry. */}
        {failed > 0 && !push.active && (
          <button
            onClick={() => runPush("errors")}
            title="Volver a intentar los productos cuya última subida falló"
            style={{
              width: "100%", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "8px 11px", borderRadius: "var(--radius-control)",
              border: "1px solid var(--color-danger)", background: "var(--color-danger-bg)",
              color: "var(--color-danger)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
            </svg>
            Reintentar {failed} con error
          </button>
        )}

        <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", textAlign: "center", marginTop: 6, minHeight: 14 }}>
          {pulling
            ? "Trayendo cambios de Tienda Nube…"
            : push.active
            ? (push.errors > 0 ? `${push.errors} con error` : "Enviando a Tienda Nube…")
            : `Tienda Nube · ${relTime(lastPull)}`}
        </div>
        <button
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}
          style={{ width: "100%", marginTop: 8, padding: "5px 0", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.6875rem", color: "var(--color-subtle)" }}
        >
          Cerrar sesión
        </button>
      </div>

    </aside>
    </>
  );
}

function NavItem({ href, label, active, children, badge }: {
  href: string; label: string; active: boolean; children: React.ReactNode; badge?: number;
}) {
  const [hov, setHov] = useState(false);

  const bg = active ? "var(--color-brand)" : hov ? "var(--color-surface-2)" : "transparent";
  const color = active ? "var(--color-brand-ink)" : hov ? "var(--color-ink)" : "var(--color-muted)";

  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 11px", borderRadius: "var(--radius-control)",
        textDecoration: "none",
        fontSize: "0.875rem", fontWeight: active ? 600 : 500,
        background: bg, color,
        boxShadow: active ? "var(--shadow-card)" : "none",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
          background: active ? "var(--color-brand-ink)" : "var(--color-brand)",
          color: active ? "var(--color-brand)" : "var(--color-brand-ink)",
          fontSize: "0.6875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {badge}
        </span>
      )}
    </Link>
  );
}
