"use client";
import { useCallback, useEffect, useState } from "react";
import ProductGridModal from "../campaigns/ProductGridModal";
import type { PickedProduct } from "../campaigns/CampaignExtras";
import CollectionPicker from "../catalog/CollectionPicker";
import { useIsMobile } from "@/components/useIsMobile";
import { notifyPendingChanged } from "@/lib/pendingEvent";

type TemplateOpt = { id: number; name: string };
type CommonData = {
  descriptionTemplateId: number | null; descriptionData: Record<string, unknown> | null;
  imageTemplateId: number | null; productImageUrl: string | null;
  categoryIds: number[]; tags: string[]; seoTitle: string | null; seoDescription: string | null;
};
const parseCommon = (json: string): CommonData => {
  try {
    const c = JSON.parse(json);
    return {
      descriptionTemplateId: c.descriptionTemplateId ?? null, descriptionData: c.descriptionData ?? null,
      imageTemplateId: c.imageTemplateId ?? null, productImageUrl: c.productImageUrl ?? null,
      categoryIds: Array.isArray(c.categoryIds) ? c.categoryIds : [], tags: Array.isArray(c.tags) ? c.tags : [],
      seoTitle: c.seoTitle ?? null, seoDescription: c.seoDescription ?? null,
    };
  } catch {
    return { descriptionTemplateId: null, descriptionData: null, imageTemplateId: null, productImageUrl: null, categoryIds: [], tags: [], seoTitle: null, seoDescription: null };
  }
};

/**
 * "Transformaciones" — plantillas de operación sobre el catálogo. La primera:
 * dividir un producto multi-variante en productos independientes.
 *
 * Flujo seguro: seleccionar → configurar la regla del nombre → vista previa
 * (borrador editable en el Centro de revisión) → confirmar. Confirmar crea los
 * productos LOCALES staged; la creación real en Tienda Nube va por el push
 * normal ("Subir cambios"), con sus lotes, reintentos y sumario.
 */

type Issue = { level: "warning" | "error"; code: string; message: string };
type Item = {
  id: number; sourceProductId: number; sourceName: string; variantLabel: string;
  name: string; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null;
  status: string; issues: string; duplicateAction: string | null; targetProductId: number | null;
  commonData: string;
};
type Job = { id: number; type: string; status: string; nameRule: string; createdAt: string; items: Item[] };
type JobSummary = { id: number; type: string; status: string; createdAt: string; _count: { items: number } };

const TOKEN_P = "{nombre_producto}";
const TOKEN_V = "{nombre_variante}";
const money = (n: number) => `$${n.toLocaleString("es-AR")}`;
const parseIssues = (s: string): Issue[] => { try { return JSON.parse(s); } catch { return []; } };
const buildName = (rule: string, p: string, v: string) =>
  rule.replaceAll(TOKEN_P, p).replaceAll(TOKEN_V, v).replace(/\s+/g, " ").trim();

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  ready: { label: "Listo", color: "var(--color-success)", icon: "✓" },
  warning: { label: "Revisar", color: "var(--color-warning)", icon: "⚠" },
  error: { label: "Error", color: "var(--color-danger)", icon: "✕" },
  edited: { label: "Editado", color: "var(--color-info)", icon: "✎" },
  skipped: { label: "Omitido", color: "var(--color-subtle)", icon: "—" },
  created: { label: "Creado", color: "var(--color-success)", icon: "✓" },
};

export default function TransformationsView({ categories, descTemplates, imageTemplates }: { categories: string[]; descTemplates: TemplateOpt[]; imageTemplates: TemplateOpt[] }) {
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [step, setStep] = useState<null | "select" | "config" | "review">(null);
  const [picked, setPicked] = useState<PickedProduct[]>([]);
  const [job, setJob] = useState<Job | null>(null);

  const loadJobs = useCallback(() => {
    fetch("/api/transformations").then((r) => r.json()).then(setJobs).catch(() => {});
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  async function openJob(id: number) {
    const j = await (await fetch(`/api/transformations/${id}`)).json();
    if (j?.id) { setJob(j); setStep("review"); }
  }

  const jobStateLabel: Record<string, string> = { draft: "Borrador", completed: "Completada", partial: "Parcial" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Launcher */}
      <div className="card" style={{ padding: 20, display: "flex", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Dividir producto por variantes</div>
          <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.5 }}>
            Convierte un producto con variantes (ej: PS4 / PS5) en productos independientes, heredando
            descripción, imagen, colecciones y SEO. Nada se crea sin tu revisión y confirmación.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setStep("select")} style={{ flexShrink: 0, justifyContent: "center" }}>
          Empezar
        </button>
      </div>

      {/* Operation log */}
      {jobs.length > 0 && (
        <div>
          <h2 style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-subtle)", margin: "0 0 10px" }}>
            Transformaciones anteriores
          </h2>
          <div className="card" style={{ overflow: "hidden" }}>
            {jobs.map((j, i) => (
              <button key={j.id} onClick={() => openJob(j.id)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "11px 16px", border: "none", background: "transparent", cursor: "pointer",
                borderTop: i > 0 ? "1px solid var(--color-divider)" : "none",
              }}>
                <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-ink)", fontWeight: 500 }}>
                  Transformación #{String(j.id).padStart(5, "0")}
                  <span style={{ color: "var(--color-subtle)", fontWeight: 400 }}> · dividir por variantes · {j._count.items} productos</span>
                </span>
                <span className={`pill ${j.status === "completed" ? "pill-success" : j.status === "partial" ? "pill-warning" : "pill-neutral"}`}>
                  {jobStateLabel[j.status] ?? j.status}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", flexShrink: 0 }}>
                  {new Date(j.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 1: selección */}
      {step === "select" && (
        <ProductGridModal
          initial={picked}
          categories={categories}
          title="Dividir por variantes — elegí los productos"
          confirmLabel="Continuar"
          tileBadge={(p) => (p.variantCount && p.variantCount > 1 ? `${p.variantCount} variantes` : null)}
          disabledReason={(p) => (!p.variantCount || p.variantCount < 2 ? "Sin variantes suficientes para dividir" : null)}
          onClose={() => setStep(null)}
          onConfirm={(sel) => { setPicked(sel); setStep(sel.length ? "config" : null); }}
        />
      )}

      {/* Paso 2: configuración */}
      {step === "config" && (
        <ConfigModal
          picked={picked}
          isMobile={isMobile}
          onBack={() => setStep("select")}
          onClose={() => setStep(null)}
          onPreview={(j) => { setJob(j); setStep("review"); loadJobs(); }}
        />
      )}

      {/* Centro de revisión */}
      {step === "review" && job && (
        <ReviewCenter
          job={job}
          setJob={setJob}
          isMobile={isMobile}
          descTemplates={descTemplates}
          imageTemplates={imageTemplates}
          onClose={() => { setStep(null); setJob(null); setPicked([]); loadJobs(); }}
        />
      )}
    </div>
  );
}

/* ── Paso 2: regla del nombre ─────────────────────────── */

function ConfigModal({ picked, isMobile, onBack, onClose, onPreview }: {
  picked: PickedProduct[]; isMobile: boolean;
  onBack: () => void; onClose: () => void; onPreview: (job: Job) => void;
}) {
  const [rule, setRule] = useState(`${TOKEN_P} - ${TOKEN_V}`);
  const [sampleVariants, setSampleVariants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Real variant labels of the first selected product make the preview honest.
  useEffect(() => {
    fetch("/api/products/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: picked.map((p) => p.id) }) })
      .then((r) => r.json())
      .then((d) => {
        const first = d[String(picked[0]?.id)];
        setSampleVariants(Array.isArray(first) ? first.map((v: { label: string }, i: number) => v.label || `Variante ${i + 1}`) : []);
      })
      .catch(() => setSampleVariants([]));
  }, [picked]);

  const sampleName = picked[0]?.name ?? "Juego N";
  const samples = (sampleVariants.length ? sampleVariants : ["PS4", "PS5"]).slice(0, 3);
  const ruleValid = rule.includes(TOKEN_V);

  async function generate() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/transformations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: picked.map((p) => p.id), nameRule: rule }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo generar la vista previa");
      onPreview(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "64px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: isMobile ? "none" : 520, height: isMobile ? "100dvh" : undefined, background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: isMobile ? "14px 16px" : "20px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Regla del nombre</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 16 : "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.5 }}>
            {picked.length} {picked.length === 1 ? "producto seleccionado" : "productos seleccionados"}. Definí cómo se
            arma el nombre de cada producto nuevo:
          </p>
          <input className="input" value={rule} onChange={(e) => setRule(e.target.value)} style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.8125rem" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[TOKEN_P, TOKEN_V].map((t) => (
              <button key={t} onClick={() => setRule((r) => r + (r.endsWith(" ") || r === "" ? "" : " ") + t)}
                className="pill pill-neutral" style={{ cursor: "pointer", border: "1px dashed var(--color-border)", fontFamily: "var(--font-mono), monospace" }}>
                + {t}
              </button>
            ))}
          </div>
          {!ruleValid && (
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-danger)" }}>
              La regla debe incluir {TOKEN_V} — sin eso todos los nombres saldrían iguales.
            </p>
          )}

          <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-subtle)", background: "var(--color-surface-2)" }}>
              Vista previa · {sampleName}
            </div>
            {samples.map((v) => (
              <div key={v} style={{ padding: "8px 12px", borderTop: "1px solid var(--color-divider)", fontSize: "0.8125rem", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "var(--color-subtle)", flexShrink: 0, fontSize: "0.75rem" }}>{v} →</span>
                <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>{buildName(rule, sampleName, v) || "(vacío)"}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: isMobile ? "12px 16px" : "16px 24px", borderTop: "1px solid var(--color-divider)", display: "flex", gap: 10, alignItems: "center" }}>
          {error ? <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span> : <span style={{ flex: 1 }} />}
          <button className="btn-secondary" onClick={onBack}>Atrás</button>
          <button className="btn-primary" onClick={generate} disabled={busy || !ruleValid}>
            {busy ? "Generando…" : "Generar vista previa"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Centro de revisión ───────────────────────────────── */

function ReviewCenter({ job, setJob, isMobile, descTemplates, imageTemplates, onClose }: {
  job: Job; setJob: (j: Job) => void; isMobile: boolean;
  descTemplates: TemplateOpt[]; imageTemplates: TemplateOpt[]; onClose: () => void;
}) {
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; failed: number; skipped: number } | null>(null);

  const isDraft = job.status === "draft";
  const active = job.items.filter((i) => i.status !== "skipped");
  const counts = {
    sources: new Set(job.items.map((i) => i.sourceProductId)).size,
    ready: active.filter((i) => i.status === "ready").length,
    warning: active.filter((i) => i.status === "warning").length,
    error: active.filter((i) => i.status === "error").length,
    edited: active.filter((i) => i.status === "edited").length,
    created: job.items.filter((i) => i.status === "created").length,
    skipped: job.items.filter((i) => i.status === "skipped").length,
  };
  const toCreate = active.filter((i) => !i.targetProductId).length;
  const undecidedDups = active.filter((i) => !i.targetProductId && parseIssues(i.issues).some((x) => x.code === "name-exists") && !i.duplicateAction).length;
  const readyPct = active.length ? Math.round(((active.length - counts.error) / active.length) * 100) : 0;
  const canConfirm = isDraft && toCreate > 0 && counts.error === 0 && undecidedDups === 0;

  // Group by source product, preserving order.
  const groups: { sourceId: number; sourceName: string; items: Item[] }[] = [];
  for (const it of job.items) {
    const g = groups[groups.length - 1];
    if (g && g.sourceId === it.sourceProductId) g.items.push(it);
    else groups.push({ sourceId: it.sourceProductId, sourceName: it.sourceName, items: [it] });
  }
  // First group open by default.
  useEffect(() => { if (openGroup === null && groups[0]) setOpenGroup(groups[0].sourceId); }, [openGroup, groups]);

  async function patchItem(itemId: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/transformations/${job.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, ...patch }),
    });
    const j = await res.json();
    if (res.ok) setJob(j); else setError(j.error || "No se pudo guardar");
  }

  async function confirm() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/transformations/${job.id}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo confirmar");
      setJob(d.job);
      setResult({ created: d.created, failed: d.failed, skipped: d.skipped });
      if (d.created > 0) notifyPendingChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function discard() {
    if (!confirmDialog("¿Descartar este borrador? No se creó ningún producto.")) return;
    await fetch(`/api/transformations/${job.id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <div className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.40)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: isMobile ? 0 : "36px 24px" }}>
      <div className="anim-modal" style={{ width: "100%", maxWidth: isMobile ? "none" : 880, height: isMobile ? "100dvh" : "calc(100dvh - 72px)", background: "var(--color-surface)", borderRadius: isMobile ? 0 : "var(--radius-modal)", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header + resumen */}
        <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
                {isDraft ? "Centro de revisión" : `Transformación #${String(job.id).padStart(5, "0")}`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 2 }}>
                {counts.sources} {counts.sources === 1 ? "producto original" : "productos originales"} · {active.length} nuevos
                {counts.skipped > 0 && ` · ${counts.skipped} omitidos`}
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
          </div>
          {isDraft && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", color: "var(--color-subtle)", marginBottom: 4 }}>
                <span>{counts.ready} listos · {counts.edited} editados · {counts.warning} con avisos · {counts.error} con errores</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{readyPct}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "var(--color-surface-2)", overflow: "hidden" }}>
                <div style={{ width: `${readyPct}%`, height: "100%", borderRadius: 999, background: counts.error ? "var(--color-warning)" : "var(--color-success)", transition: "width 0.2s" }} />
              </div>
            </div>
          )}
        </div>

        {/* Grupos colapsables por producto original */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 12px" : "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g) => {
            const gStatuses = g.items.map((i) => i.status);
            const gErr = gStatuses.filter((s) => s === "error").length;
            const gWarn = gStatuses.filter((s) => s === "warning").length;
            const open = openGroup === g.sourceId;
            return (
              <div key={g.sourceId} className="card" style={{ overflow: "hidden", padding: 0 }}>
                {/* Cabecera del grupo */}
                <button onClick={() => setOpenGroup(open ? null : g.sourceId)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: open ? "var(--color-surface-2)" : "transparent", cursor: "pointer" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-subtle)", transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.12s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sourceName}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", flexShrink: 0 }}>{g.items.length} {g.items.length === 1 ? "variante" : "variantes"}</span>
                  {gErr > 0 && <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-danger)", flexShrink: 0 }}>{gErr} ✕</span>}
                  {gErr === 0 && gWarn > 0 && <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-warning)", flexShrink: 0 }}>{gWarn} ⚠</span>}
                </button>

                {open && (
                  <div style={{ borderTop: "1px solid var(--color-divider)" }}>
                    {/* Cada variante se edita de forma independiente: sus datos
                        propios y sus datos de producto (descripción, imagen,
                        colecciones, tags, SEO). */}
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {g.items.map((it) => (
                        <VariantRow
                          key={it.id}
                          item={it}
                          editable={isDraft && it.status !== "created"}
                          isMobile={isMobile}
                          descTemplates={descTemplates}
                          imageTemplates={imageTemplates}
                          onPatch={(p) => patchItem(it.id, p)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", borderTop: "1px solid var(--color-divider)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {result ? (
            <span style={{ flex: 1, fontSize: "0.8125rem", color: result.failed ? "var(--color-warning)" : "var(--color-success)", fontWeight: 600 }}>
              ✓ {result.created} creados localmente{result.failed ? ` · ${result.failed} fallaron` : ""}{result.skipped ? ` · ${result.skipped} omitidos` : ""} — subilos a Tienda Nube con «Subir cambios»
            </span>
          ) : error ? (
            <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--color-danger)" }}>{error}</span>
          ) : (
            <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)" }}>
              {isDraft
                ? undecidedDups > 0
                  ? `⚠ Decidí qué hacer con ${undecidedDups} duplicado(s) antes de confirmar`
                  : "Los productos se crean ocultos; el original queda intacto."
                : "Registro de la operación — los estados son los del momento de la creación."}
            </span>
          )}
          {isDraft && !result && (
            <button className="btn-secondary" onClick={discard} style={{ color: "var(--color-danger)" }}>Descartar</button>
          )}
          {isDraft && toCreate > 0 && (
            <button className="btn-primary" onClick={confirm} disabled={busy || !canConfirm}>
              {busy ? "Creando…" : job.status === "partial" || counts.created > 0 ? `Reintentar ${toCreate} pendientes` : `Confirmar y crear ${toCreate} productos`}
            </button>
          )}
          {(!isDraft || result) && <button className="btn-primary" onClick={onClose}>Listo</button>}
        </div>
      </div>
    </div>
  );
}

function confirmDialog(msg: string) { return typeof window !== "undefined" ? window.confirm(msg) : false; }

/* ── Datos de producto de UNA variante (edición independiente) ── */

function DetailsForm({ common, editable, isMobile, descTemplates, imageTemplates, onChange }: {
  common: CommonData; editable: boolean; isMobile: boolean;
  descTemplates: TemplateOpt[]; imageTemplates: TemplateOpt[];
  onChange: (patch: Partial<CommonData>) => void;
}) {
  const [showCats, setShowCats] = useState(false);
  const [tags, setTags] = useState(common.tags.join(", "));
  const [seoTitle, setSeoTitle] = useState(common.seoTitle ?? "");
  const [seoDesc, setSeoDesc] = useState(common.seoDescription ?? "");
  const [imgUrl, setImgUrl] = useState(common.productImageUrl ?? "");
  const [catIds, setCatIds] = useState<Set<number>>(new Set(common.categoryIds));
  useEffect(() => { setTags(common.tags.join(", ")); setSeoTitle(common.seoTitle ?? ""); setSeoDesc(common.seoDescription ?? ""); setImgUrl(common.productImageUrl ?? ""); setCatIds(new Set(common.categoryIds)); }, [common]);

  const commitTags = () => { const arr = tags.split(",").map((t) => t.trim()).filter(Boolean); if (JSON.stringify(arr) !== JSON.stringify(common.tags)) onChange({ tags: arr }); };

  return (
    <div style={{ marginTop: 8, padding: "12px", borderRadius: "var(--radius-input)", background: "var(--color-surface-2)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        <label style={fieldLbl}>Plantilla de descripción
          <select className="input" disabled={!editable} value={common.descriptionTemplateId ?? ""} onChange={(e) => onChange({ descriptionTemplateId: e.target.value ? Number(e.target.value) : null })} style={{ background: "var(--color-surface)" }}>
            <option value="">Heredar del original</option>
            {descTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={fieldLbl}>Plantilla de imagen
          <select className="input" disabled={!editable} value={common.imageTemplateId ?? ""} onChange={(e) => onChange({ imageTemplateId: e.target.value ? Number(e.target.value) : null })} style={{ background: "var(--color-surface)" }}>
            <option value="">Heredar del original</option>
            {imageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ ...fieldLbl, gridColumn: isMobile ? undefined : "1 / -1" }}>Imagen del producto (URL)
          <input className="input" disabled={!editable} value={imgUrl} placeholder="https://…/producto.png" onChange={(e) => setImgUrl(e.target.value)} onBlur={() => { if ((imgUrl.trim() || null) !== (common.productImageUrl ?? null)) onChange({ productImageUrl: imgUrl.trim() || null }); }} style={{ background: "var(--color-surface)", fontSize: "0.8125rem" }} />
        </label>
        <label style={fieldLbl}>SEO · Título
          <input className="input" disabled={!editable} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} onBlur={() => { if ((seoTitle.trim() || null) !== (common.seoTitle ?? null)) onChange({ seoTitle: seoTitle.trim() || null }); }} style={{ background: "var(--color-surface)" }} />
        </label>
        <label style={fieldLbl}>SEO · Descripción
          <input className="input" disabled={!editable} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} onBlur={() => { if ((seoDesc.trim() || null) !== (common.seoDescription ?? null)) onChange({ seoDescription: seoDesc.trim() || null }); }} style={{ background: "var(--color-surface)" }} />
        </label>
        <label style={{ ...fieldLbl, gridColumn: isMobile ? undefined : "1 / -1" }}>Etiquetas <span style={{ fontWeight: 400, color: "var(--color-faint)" }}>(separadas por coma)</span>
          <input className="input" disabled={!editable} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={commitTags} style={{ background: "var(--color-surface)" }} />
        </label>
      </div>

      {/* Colecciones */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" }}>Colecciones <span style={{ fontWeight: 400, color: "var(--color-faint)" }}>· {catIds.size}</span></span>
          {editable && <button onClick={() => setShowCats((v) => !v)} style={{ border: "none", background: "transparent", color: "var(--color-brand)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>{showCats ? "Listo" : "Editar"}</button>}
        </div>
        {showCats && editable ? (
          <CollectionPicker
            selectedIds={catIds}
            onToggle={(id) => {
              setCatIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); onChange({ categoryIds: [...n] }); return n; });
            }}
          />
        ) : (
          <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>{catIds.size === 0 ? "Sin colecciones" : `${catIds.size} ${catIds.size === 1 ? "colección heredada/elegida" : "colecciones"}`}</div>
        )}
      </div>
    </div>
  );
}

/* ── Una variante, editable inline ─────────────────────── */

function VariantRow({ item, editable, isMobile, descTemplates, imageTemplates, onPatch }: {
  item: Item; editable: boolean; isMobile: boolean;
  descTemplates: TemplateOpt[]; imageTemplates: TemplateOpt[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const meta = STATUS_META[item.status] ?? STATUS_META.ready;
  const issues = parseIssues(item.issues);
  const isDup = issues.some((x) => x.code === "name-exists");
  const [showDetails, setShowDetails] = useState(false);
  const common = parseCommon(item.commonData);
  const detailCount =
    (common.descriptionTemplateId ? 1 : 0) + (common.imageTemplateId ? 1 : 0) +
    (common.productImageUrl ? 1 : 0) + common.categoryIds.length + common.tags.length +
    (common.seoTitle ? 1 : 0) + (common.seoDescription ? 1 : 0);
  const [d, setD] = useState({ name: item.name, price: String(item.price), promo: item.promotionalPrice != null ? String(item.promotionalPrice) : "", stock: item.stock != null ? String(item.stock) : "", sku: item.sku ?? "" });
  useEffect(() => { setD({ name: item.name, price: String(item.price), promo: item.promotionalPrice != null ? String(item.promotionalPrice) : "", stock: item.stock != null ? String(item.stock) : "", sku: item.sku ?? "" }); }, [item.id, item.name, item.price, item.promotionalPrice, item.stock, item.sku]);

  function commit() {
    const price = parseFloat(d.price.replace(",", "."));
    const promo = d.promo.trim() === "" ? null : parseFloat(d.promo.replace(",", "."));
    const stock = d.stock.trim() === "" ? null : Math.round(Number(d.stock));
    const changed = d.name !== item.name || price !== item.price || (promo ?? null) !== (item.promotionalPrice ?? null) || (stock ?? null) !== (item.stock ?? null) || (d.sku.trim() || null) !== (item.sku ?? null);
    if (!changed) return;
    onPatch({ name: d.name, price: isNaN(price) ? item.price : price, promotionalPrice: promo != null && isNaN(promo) ? item.promotionalPrice : promo, stock, sku: d.sku });
  }

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: 10, background: "var(--color-surface)", opacity: item.status === "skipped" ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ color: meta.color, fontWeight: 700, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-subtle)", fontWeight: 600 }}>Variante: {item.variantLabel}</span>
        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
        {editable && (item.status === "skipped"
          ? <button onClick={() => onPatch({ skipped: false })} style={miniBtn}>Incluir</button>
          : <button onClick={() => onPatch({ skipped: true })} style={{ ...miniBtn, color: "var(--color-muted)" }}>Omitir</button>)}
      </div>

      {issues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
          {issues.map((x, i) => (
            <div key={i} style={{ fontSize: "0.72rem", color: x.level === "error" ? "var(--color-danger)" : "var(--color-warning)", fontWeight: 500 }}>
              {x.level === "error" ? "✕" : "⚠"} {x.message}
            </div>
          ))}
        </div>
      )}

      {isDup && editable && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: "0.75rem", marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>¿Qué hacemos?</span>
          {(["create", "skip"] as const).map((a) => (
            <label key={a} style={{ display: "inline-flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" name={`dup-${item.id}`} checked={item.duplicateAction === a} onChange={() => onPatch({ duplicateAction: a })} />
              {a === "create" ? "Crear igualmente" : "Omitir"}
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        <label style={{ ...fieldLbl, gridColumn: isMobile ? "1 / -1" : undefined }}>Nombre
          <input className="input" disabled={!editable} value={d.name} onChange={(e) => setD((s) => ({ ...s, name: e.target.value }))} onBlur={commit} />
        </label>
        <label style={fieldLbl}>Precio
          <input className="input" inputMode="decimal" disabled={!editable} value={d.price} onChange={(e) => setD((s) => ({ ...s, price: e.target.value }))} onBlur={commit} style={{ fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label style={fieldLbl}>Promo
          <input className="input" inputMode="decimal" placeholder="—" disabled={!editable} value={d.promo} onChange={(e) => setD((s) => ({ ...s, promo: e.target.value }))} onBlur={commit} style={{ fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label style={fieldLbl}>Stock
          <input className="input" inputMode="numeric" placeholder="∞" disabled={!editable} value={d.stock} onChange={(e) => setD((s) => ({ ...s, stock: e.target.value }))} onBlur={commit} style={{ fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label style={fieldLbl}>SKU
          <input className="input" placeholder="—" disabled={!editable} value={d.sku} onChange={(e) => setD((s) => ({ ...s, sku: e.target.value }))} onBlur={commit} style={{ fontFamily: "var(--font-mono), monospace" }} />
        </label>
      </div>

      {/* Datos de producto de esta variante — descripción, imagen, colecciones, tags, SEO */}
      <button onClick={() => setShowDetails((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "8px 0 0", marginTop: 4 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-subtle)", transform: showDetails ? "none" : "rotate(-90deg)", transition: "transform 0.12s", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)" }}>Descripción, imagen, colecciones y SEO</span>
        {detailCount > 0 && <span className="pill pill-neutral" style={{ fontSize: "0.625rem" }}>{detailCount}</span>}
      </button>
      {showDetails && (
        <DetailsForm
          common={common}
          editable={editable}
          isMobile={isMobile}
          descTemplates={descTemplates}
          imageTemplates={imageTemplates}
          onChange={(patch) => onPatch({ common: patch })}
        />
      )}
    </div>
  );
}

const fieldLbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)" };
const miniBtn: React.CSSProperties = { border: "1px solid var(--color-border)", background: "transparent", borderRadius: 7, padding: "3px 9px", fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer", color: "var(--color-ink)", flexShrink: 0 };
