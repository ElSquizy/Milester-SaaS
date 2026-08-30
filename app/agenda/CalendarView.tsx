"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, format, isSameMonth, isToday } from "date-fns";
import { es } from "date-fns/locale";
import Modal from "./Modal";

// Cada evento del calendario trae su `day` (YYYY-MM-DD) y un `type`.
type CalEvent = {
  day: string; type: "task" | "campaign-end" | "campaign-start" | "launch" | "note" | "holiday";
  title: string;
  id?: number; note?: string | null; date?: string; campaignId?: number;
  task?: { id: number; title: string; note: string | null; dueDate: string | null; priority: string; status: string; assigneeId: number | null; assignee: { id: number; name: string; color: string } | null };
};

const TYPE: Record<CalEvent["type"], { color: string; label: string }> = {
  "task": { color: "var(--color-success)", label: "Tarea" },
  "campaign-end": { color: "#EA580C", label: "Fin de oferta" },
  "campaign-start": { color: "var(--color-info)", label: "Arranca campaña" },
  "launch": { color: "#8B5CF6", label: "Lanzamiento" },
  "note": { color: "var(--color-subtle)", label: "Nota" },
  "holiday": { color: "var(--color-danger)", label: "Feriado" },
};

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export default function CalendarView({ onEditTask, refreshKey }: { onEditTask?: (task: NonNullable<CalEvent["task"]>) => void; refreshKey?: number }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventModal, setEventModal] = useState<null | { id?: number; title: string; date: string; type: string; note: string }>(null);

  // Rango de la grilla como STRINGS (estables por valor) — con objetos Date recreados
  // en cada render el fetch entraba en bucle.
  const from = ymd(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }));
  const to = ymd(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }));
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [from, to], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then((r) => r.json()).then((d) => setEvents(d.events || [])).finally(() => setLoading(false));
  }, [from, to, refreshKey]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) { const a = m.get(e.day) || []; a.push(e); m.set(e.day, a); }
    return m;
  }, [events]);

  function clickEvent(e: CalEvent) {
    if (e.type === "task" && e.task && onEditTask) onEditTask(e.task);
    else if (e.type === "launch" || e.type === "note") setEventModal({ id: e.id, title: e.title, date: e.date || e.day, type: e.type, note: e.note || "" });
    // campañas y feriados: informativos (el título ya lo dice)
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header del calendario */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setMonth(addMonths(month, -1))} style={navBtn}>‹</button>
        <span style={{ fontSize: "1rem", fontWeight: 700, textTransform: "capitalize", minWidth: 150 }}>{format(month, "MMMM yyyy", { locale: es })}</span>
        <button onClick={() => setMonth(addMonths(month, 1))} style={navBtn}>›</button>
        <button onClick={() => setMonth(startOfMonth(new Date()))} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8125rem" }}>Hoy</button>
        {loading && <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>cargando…</span>}
        <button className="btn-primary" onClick={() => setEventModal({ title: "", date: ymd(new Date()), type: "launch", note: "" })} style={{ marginLeft: "auto", padding: "7px 13px" }}>+ Evento</button>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {(["launch", "campaign-end", "task", "holiday"] as const).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.6875rem", color: "var(--color-subtle)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: TYPE[t].color }} />{TYPE[t].label}
          </span>
        ))}
      </div>

      {/* Grilla */}
      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)", padding: "2px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {days.map((d) => {
            const key = ymd(d);
            const inMonth = isSameMonth(d, month);
            const today = isToday(d);
            const list = byDay.get(key) || [];
            return (
              <div key={key}
                onClick={() => setEventModal({ title: "", date: key, type: "launch", note: "" })}
                title="Agregar evento"
                style={{
                  minHeight: 92, borderRadius: 10, padding: 6, cursor: "pointer",
                  background: today ? "var(--color-brand-light)" : "var(--color-surface-2)",
                  border: today ? "1px solid var(--color-brand)" : "1px solid transparent",
                  opacity: inMonth ? 1 : 0.5, display: "flex", flexDirection: "column", gap: 3, overflow: "hidden",
                }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: today ? 700 : 500, color: today ? "var(--color-brand)" : "var(--color-muted)", fontVariantNumeric: "tabular-nums", alignSelf: "flex-end" }}>{format(d, "d")}</span>
                {list.slice(0, 3).map((e, i) => {
                  const meta = TYPE[e.type];
                  const clickable = e.type === "task" || e.type === "launch" || e.type === "note";
                  return (
                    <button key={i}
                      onClick={(ev) => { ev.stopPropagation(); clickEvent(e); }}
                      title={e.title}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, width: "100%", textAlign: "left",
                        border: "none", borderRadius: 5, padding: "2px 5px", cursor: clickable ? "pointer" : "default",
                        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, minWidth: 0,
                      }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.625rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: e.type === "task" && e.task?.status === "done" ? "line-through" : "none" }}>{e.title}</span>
                    </button>
                  );
                })}
                {list.length > 3 && <span style={{ fontSize: "0.5625rem", color: "var(--color-subtle)", paddingLeft: 4 }}>+{list.length - 3} más</span>}
              </div>
            );
          })}
        </div>
      </div>

      {eventModal && (
        <EventModal init={eventModal} onClose={() => setEventModal(null)} onSaved={() => { setEventModal(null); load(); }} />
      )}
    </div>
  );
}

function EventModal({ init, onClose, onSaved }: {
  init: { id?: number; title: string; date: string; type: string; note: string };
  onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(init.title);
  const [date, setDate] = useState(init.date);
  const [type, setType] = useState(init.type);
  const [note, setNote] = useState(init.note);
  const [busy, setBusy] = useState(false);
  const editing = init.id != null;

  async function save() {
    if (!title.trim() || !date) return;
    setBusy(true);
    const body = { title, date, type, note };
    await fetch(editing ? `/api/calendar-events/${init.id}` : "/api/calendar-events", {
      method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(false); onSaved();
  }
  async function remove() {
    if (!editing || !confirm("¿Eliminar este evento?")) return;
    setBusy(true); await fetch(`/api/calendar-events/${init.id}`, { method: "DELETE" }); setBusy(false); onSaved();
  }

  return (
    <Modal title={editing ? "Editar evento" : "Nuevo evento"} onClose={onClose} maxWidth={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={fieldWrap}><span style={fieldLbl}>Título</span>
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Lanzamiento GTA VI" /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={fieldWrap}><span style={fieldLbl}>Fecha</span>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label style={fieldWrap}><span style={fieldLbl}>Tipo</span>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="launch">Lanzamiento</option><option value="note">Nota</option>
              </select></label>
          </div>
          <label style={fieldWrap}><span style={fieldLbl}>Nota (opcional)</span>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ resize: "vertical" }} /></label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <button className="btn-primary" onClick={save} disabled={busy || !title.trim() || !date}>{busy ? "…" : editing ? "Guardar" : "Crear"}</button>
            {editing && <button className="btn-secondary" onClick={remove} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>}
            <button className="btn-secondary" onClick={onClose} disabled={busy} style={{ marginLeft: "auto" }}>Cancelar</button>
          </div>
        </div>
    </Modal>
  );
}

const navBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "1.125rem", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const fieldLbl: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" };
