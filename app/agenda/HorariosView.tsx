"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, format, isToday } from "date-fns";
import { es } from "date-fns/locale";

type Emp = { id: number; name: string; color: string };
type Shift = { id: number; employeeId: number; start: string; end: string; note: string | null; day: string; employee: { id: number; name: string; color: string } };

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export default function HorariosView({ employees }: { employees: Emp[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { shift?: Shift; employeeId?: number; date?: string }>(null);

  const from = ymd(weekStart);
  const to = ymd(endOfWeek(weekStart, { weekStartsOn: 1 }));
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }),
    [from, to], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/shifts?from=${from}&to=${to}`).then((r) => r.json()).then((d) => setShifts(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const byKey = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) { const k = `${s.employeeId}:${s.day}`; const a = m.get(k) || []; a.push(s); m.set(k, a); }
    return m;
  }, [shifts]);

  const today = ymd(new Date());
  const todays = shifts.filter((s) => s.day === today);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Quién trabaja hoy */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)" }}>Hoy trabajan</span>
        {todays.length === 0 ? (
          <span style={{ fontSize: "0.8125rem", color: "var(--color-subtle)" }}>Nadie tiene turno hoy.</span>
        ) : todays.map((s) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: "var(--radius-pill)", background: "var(--color-surface-2)", fontSize: "0.8125rem" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.employee.color }} />
            <b style={{ fontWeight: 600, color: "var(--color-ink)" }}>{s.employee.name}</b>
            <span style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{s.start}–{s.end}</span>
          </span>
        ))}
      </div>

      {/* Navegación de semana */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={() => setWeekStart((w) => addWeeks(w, -1))} style={navBtn}>‹</button>
        <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
          {format(days[0], "d 'de' MMM", { locale: es })} – {format(days[6], "d 'de' MMM", { locale: es })}
        </span>
        <button onClick={() => setWeekStart((w) => addWeeks(w, 1))} style={navBtn}>›</button>
        <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8125rem" }}>Esta semana</button>
        {loading && <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>cargando…</span>}
      </div>

      {employees.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--color-muted)", fontSize: "0.875rem" }}>
          Agregá empleados (pestaña Tareas → botón «Equipo») para cargar sus turnos.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <div style={{ minWidth: 780 }}>
            {/* Header de días */}
            <div style={{ display: "grid", gridTemplateColumns: "140px repeat(7, 1fr)", borderBottom: "1px solid var(--color-divider)" }}>
              <div style={{ padding: "10px 12px" }} />
              {days.map((d) => {
                const t = isToday(d);
                return (
                  <div key={ymd(d)} style={{ padding: "10px 8px", textAlign: "center", background: t ? "var(--color-brand-light)" : "transparent" }}>
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: t ? "var(--color-brand)" : "var(--color-subtle)" }}>{format(d, "EEE", { locale: es })}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: t ? 700 : 500, color: t ? "var(--color-brand)" : "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{format(d, "d")}</div>
                  </div>
                );
              })}
            </div>
            {/* Filas por empleado */}
            {employees.map((e, ri) => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "140px repeat(7, 1fr)", borderTop: ri === 0 ? "none" : "1px solid var(--color-divider)" }}>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderRight: "1px solid var(--color-divider)" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                </div>
                {days.map((d) => {
                  const key = `${e.id}:${ymd(d)}`;
                  const list = byKey.get(key) || [];
                  return (
                    <div key={key} onClick={() => setModal({ employeeId: e.id, date: ymd(d) })} title="Agregar turno"
                      style={{ padding: 6, minHeight: 52, cursor: "pointer", borderLeft: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", background: isToday(d) ? "color-mix(in srgb, var(--color-brand) 4%, transparent)" : "transparent" }}>
                      {list.map((s) => (
                        <button key={s.id} onClick={(ev) => { ev.stopPropagation(); setModal({ shift: s }); }}
                          title={s.note || `${s.start}–${s.end}`}
                          style={{ border: "none", borderRadius: 6, padding: "3px 7px", cursor: "pointer", background: `color-mix(in srgb, ${e.color} 16%, transparent)`, color: "var(--color-ink)", fontSize: "0.6875rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "left", whiteSpace: "nowrap" }}>
                          {s.start}–{s.end}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <ShiftModal init={modal} employees={employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

function ShiftModal({ init, employees, onClose, onSaved }: {
  init: { shift?: Shift; employeeId?: number; date?: string };
  employees: Emp[]; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!init.shift;
  const [employeeId, setEmployeeId] = useState<string>(String(init.shift?.employeeId ?? init.employeeId ?? employees[0]?.id ?? ""));
  const [date, setDate] = useState(init.shift?.day ?? init.date ?? "");
  const [start, setStart] = useState(init.shift?.start ?? "09:00");
  const [end, setEnd] = useState(init.shift?.end ?? "18:00");
  const [note, setNote] = useState(init.shift?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!employeeId || !date || !start || !end) return;
    setBusy(true);
    const body = { employeeId: Number(employeeId), date, start, end, note };
    await fetch(editing ? `/api/shifts/${init.shift!.id}` : "/api/shifts", {
      method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(false); onSaved();
  }
  async function remove() {
    if (!editing || !confirm("¿Eliminar este turno?")) return;
    setBusy(true); await fetch(`/api/shifts/${init.shift!.id}`, { method: "DELETE" }); setBusy(false); onSaved();
  }

  return (
    <div onClick={onClose} className="anim-in" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-modal" style={{ width: "100%", maxWidth: 440, background: "var(--color-surface)", borderRadius: "var(--radius-modal)", boxShadow: "var(--shadow-float)", padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{editing ? "Editar turno" : "Nuevo turno"}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "var(--color-surface-2)", cursor: "pointer", color: "var(--color-muted)" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={fw}><span style={fl}>Empleado</span>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label style={fw}><span style={fl}>Fecha</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={fw}><span style={fl}>Desde</span><input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label style={fw}><span style={fl}>Hasta</span><input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label style={fw}><span style={fl}>Nota (opcional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Cierre" /></label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <button className="btn-primary" onClick={save} disabled={busy || !employeeId || !date}>{busy ? "…" : editing ? "Guardar" : "Crear"}</button>
            {editing && <button className="btn-secondary" onClick={remove} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>}
            <button className="btn-secondary" onClick={onClose} disabled={busy} style={{ marginLeft: "auto" }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "1.125rem", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
const fw: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const fl: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" };
