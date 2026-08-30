"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, format, isToday } from "date-fns";
import { es } from "date-fns/locale";
import Modal from "./Modal";

type Emp = { id: number; name: string; color: string };
type Shift = { id: number; employeeId: number; start: string; end: string; note: string | null; day: string; employee: { id: number; name: string; color: string } };
type HeatCell = { weekday: number; hour: number; orders: number; revenue: number };
type Seg = { key: string; shift: Shift; startM: number; endM: number; tail: boolean };

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
/** Duración en minutos (soporta turno que cruza medianoche). */
const durMin = (start: string, end: string) => { const a = toMin(start), b = toMin(end); return (b > a ? b : b + 1440) - a; };
const fmtHours = (min: number) => { const h = min / 60; return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`; };

const ROW_H = 30; // px por hora
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function HorariosView({ employees }: { employees: Emp[] }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEmp, setActiveEmp] = useState<number | null>(employees[0]?.id ?? null);
  const [showHeat, setShowHeat] = useState(true);
  const [modal, setModal] = useState<null | { shift?: Shift; employeeId?: number; date?: string; start?: string; end?: string }>(null);

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

  // Heatmap de ventas (últimos 90 días) — se carga una vez.
  useEffect(() => {
    fetch(`/api/sales-heatmap?days=90`).then((r) => r.json()).then((d) => setHeat(Array.isArray(d?.cells) ? d.cells : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeEmp == null || !employees.some((e) => e.id === activeEmp)) setActiveEmp(employees[0]?.id ?? null);
  }, [employees, activeEmp]);

  // Segmentos de turno por columna-día. Un turno que cruza la medianoche se
  // parte en dos: hasta las 24:00 en su día, y desde las 00:00 arriba en el día
  // siguiente (así no se "cae" por debajo de la grilla).
  const segmentsByDay = useMemo(() => {
    const m = new Map<number, Seg[]>();
    const push = (idx: number, seg: Seg) => { if (idx < 0 || idx > 6) return; const a = m.get(idx) || []; a.push(seg); m.set(idx, a); };
    const idxOf = new Map(days.map((d, i) => [ymd(d), i]));
    for (const s of shifts) {
      const idx = idxOf.get(s.day);
      if (idx === undefined) continue;
      const startM = toMin(s.start), endRaw = toMin(s.end);
      if (endRaw > startM) { push(idx, { key: `${s.id}`, shift: s, startM, endM: endRaw, tail: false }); continue; }
      // Cruza medianoche: parte principal hasta 24:00 + cola en el día siguiente.
      push(idx, { key: `${s.id}a`, shift: s, startM, endM: 1440, tail: false });
      if (endRaw > 0) push(idx + 1, { key: `${s.id}b`, shift: s, startM: 0, endM: endRaw, tail: true });
    }
    return m;
  }, [shifts, days]);

  // Horas semanales por empleado.
  const weeklyMin = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of shifts) m.set(s.employeeId, (m.get(s.employeeId) || 0) + durMin(s.start, s.end));
    return m;
  }, [shifts]);
  const totalWeekMin = useMemo(() => [...weeklyMin.values()].reduce((a, b) => a + b, 0), [weeklyMin]);

  // Heat: max de órdenes para normalizar la intensidad. weekday %w: 0=domingo.
  const heatMap = useMemo(() => {
    const m = new Map<string, number>(); let max = 0;
    for (const c of heat) { m.set(`${c.weekday}:${c.hour}`, c.orders); if (c.orders > max) max = c.orders; }
    return { get: (wd: number, hr: number) => m.get(`${wd}:${hr}`) || 0, max };
  }, [heat]);

  const today = ymd(new Date());
  const todays = shifts.filter((s) => s.day === today).sort((a, b) => toMin(a.start) - toMin(b.start));

  if (employees.length === 0) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--color-muted)", fontSize: "0.875rem" }}>
          Agregá empleados (pestaña Tareas → botón «Equipo») para cargar sus turnos.
        </div>
      </div>
    );
  }

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

      {/* Empleados + horas semanales. El chip activo define a quién asignás al hacer clic en la grilla. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)", marginRight: 2 }}>Asignar a</span>
        {employees.map((e) => {
          const on = e.id === activeEmp;
          const mins = weeklyMin.get(e.id) || 0;
          return (
            <button key={e.id} onClick={() => setActiveEmp(e.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                border: on ? `1.5px solid ${e.color}` : "1.5px solid var(--color-border)",
                background: on ? `color-mix(in srgb, ${e.color} 12%, var(--color-surface))` : "var(--color-surface)",
                fontSize: "0.8125rem", fontWeight: on ? 700 : 500, color: "var(--color-ink)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color }} />
              {e.name}
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-muted)", fontWeight: 600 }}>· {fmtHours(mins)}</span>
            </button>
          );
        })}
        {totalWeekMin > 0 && (
          <span style={{ marginLeft: "auto", fontSize: "0.8125rem", color: "var(--color-muted)" }}>
            Total semana: <b style={{ color: "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{fmtHours(totalWeekMin)}</b>
          </span>
        )}
      </div>

      {/* Navegación de semana + toggle heat */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setWeekStart((w) => addWeeks(w, -1))} style={navBtn}>‹</button>
        <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>
          {format(days[0], "d 'de' MMM", { locale: es })} – {format(days[6], "d 'de' MMM", { locale: es })}
        </span>
        <button onClick={() => setWeekStart((w) => addWeeks(w, 1))} style={navBtn}>›</button>
        <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8125rem" }}>Esta semana</button>
        <button className="btn-primary" onClick={() => setModal({ employeeId: activeEmp ?? undefined, date: today >= from && today <= to ? today : from, start: "09:00", end: "18:00" })} style={{ padding: "6px 12px", fontSize: "0.8125rem" }}>+ Turno</button>
        {loading && <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)" }}>cargando…</span>}
        <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.8125rem", color: "var(--color-muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} />
          <span style={{ width: 11, height: 11, borderRadius: 3, background: "rgba(234,88,12,0.45)" }} />
          Ventas históricas
        </label>
      </div>

      {/* Grilla horaria: filas = horas, columnas = Lun→Dom */}
      <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 620 }}>
        <div style={{ minWidth: 760 }}>
          {/* Header de días (sticky) */}
          <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)", position: "sticky", top: 0, zIndex: 3, background: "var(--color-surface)", borderBottom: "1px solid var(--color-divider)" }}>
            <div />
            {days.map((d) => {
              const t = isToday(d);
              return (
                <div key={ymd(d)} style={{ padding: "8px 6px", textAlign: "center", background: t ? "var(--color-brand-light)" : "transparent", borderLeft: "1px solid var(--color-divider)" }}>
                  <div style={{ fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: t ? "var(--color-brand)" : "var(--color-subtle)" }}>{format(d, "EEE", { locale: es })}</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: t ? 700 : 500, color: t ? "var(--color-brand)" : "var(--color-ink)", fontVariantNumeric: "tabular-nums" }}>{format(d, "d")}</div>
                </div>
              );
            })}
          </div>

          {/* Cuerpo: columna de horas + 7 columnas-día */}
          <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)" }}>
            {/* Etiquetas de hora */}
            <div>
              {HOURS.map((h) => (
                <div key={h} style={{ height: ROW_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 2, fontSize: "0.6875rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--color-divider)" }}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {/* Columnas por día */}
            {days.map((d, dayIdx) => {
              const wd = d.getDay(); // 0=domingo … coincide con %w del heatmap
              const segs = (segmentsByDay.get(dayIdx) || []).slice().sort((a, b) => a.startM - b.startM);
              const lanes = assignLanes(segs);
              return (
                <div key={ymd(d)} style={{ position: "relative", borderLeft: "1px solid var(--color-divider)", background: isToday(d) ? "color-mix(in srgb, var(--color-brand) 3%, transparent)" : "transparent" }}>
                  {/* Celdas-hora (fondo heat + click para crear) */}
                  {HOURS.map((h) => {
                    const orders = heatMap.get(wd, h);
                    const alpha = showHeat && heatMap.max > 0 && orders > 0 ? 0.08 + 0.4 * (orders / heatMap.max) : 0;
                    return (
                      <div key={h} title={activeEmp ? `Agregar turno · ${String(h).padStart(2, "0")}:00` : "Elegí un empleado arriba"}
                        onClick={() => activeEmp && setModal({ employeeId: activeEmp, date: ymd(d), start: `${String(h).padStart(2, "0")}:00`, end: `${String((h + 1) % 24).padStart(2, "0")}:00` })}
                        style={{ height: ROW_H, borderTop: "1px solid var(--color-divider)", cursor: activeEmp ? "pointer" : "default", background: alpha > 0 ? `rgba(234,88,12,${alpha})` : "transparent" }} />
                    );
                  })}
                  {/* Bloques de turno (segmentos: la cola de un turno nocturno cae en este día) */}
                  {segs.map((seg) => {
                    const s = seg.shift;
                    const top = (seg.startM / 60) * ROW_H;
                    const height = Math.max(16, ((seg.endM - seg.startM) / 60) * ROW_H - 2);
                    const lane = lanes.laneOf.get(seg.key) || 0;
                    const width = `calc((100% - 4px) / ${lanes.count})`;
                    return (
                      <button key={seg.key} onClick={(ev) => { ev.stopPropagation(); setModal({ shift: s }); }}
                        title={`${s.employee.name} · ${s.start}–${s.end}${s.note ? ` · ${s.note}` : ""}`}
                        style={{ position: "absolute", top, left: `calc(2px + ${lane} * ${width})`, width, height, overflow: "hidden",
                          border: `1px solid color-mix(in srgb, ${s.employee.color} 55%, transparent)`, borderLeft: `3px solid ${s.employee.color}`,
                          borderRadius: 6, borderTopLeftRadius: seg.tail ? 0 : 6, borderTopRightRadius: seg.tail ? 0 : 6,
                          background: `color-mix(in srgb, ${s.employee.color} 20%, var(--color-surface))`, color: "var(--color-ink)",
                          padding: "2px 5px", cursor: "pointer", textAlign: "left", fontSize: "0.6875rem", lineHeight: 1.2 }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seg.tail ? "↳ " : ""}{s.employee.name}</div>
                        <div style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>{s.start}–{s.end}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--color-subtle)", marginTop: 8 }}>
        Clic en una franja para asignar el turno al empleado seleccionado. El sombreado naranja marca las horas de más ventas (últimos 90 días) — así ves si estás cubriendo la demanda.
      </p>

      {modal && (
        <ShiftModal init={modal} employees={employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

/** Asigna "carriles" a los segmentos que se solapan en una columna-día (para mostrarlos lado a lado). */
function assignLanes(segs: Seg[]): { laneOf: Map<string, number>; count: number } {
  const laneOf = new Map<string, number>();
  const laneEnds: number[] = []; // fin (min) del último segmento de cada carril
  for (const seg of segs) {
    let lane = laneEnds.findIndex((e) => e <= seg.startM);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(seg.endM); } else laneEnds[lane] = seg.endM;
    laneOf.set(seg.key, lane);
  }
  return { laneOf, count: Math.max(1, laneEnds.length) };
}

function ShiftModal({ init, employees, onClose, onSaved }: {
  init: { shift?: Shift; employeeId?: number; date?: string; start?: string; end?: string };
  employees: Emp[]; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!init.shift;
  const [employeeId, setEmployeeId] = useState<string>(String(init.shift?.employeeId ?? init.employeeId ?? employees[0]?.id ?? ""));
  const [date, setDate] = useState(init.shift?.day ?? init.date ?? "");
  const [start, setStart] = useState(init.shift?.start ?? init.start ?? "09:00");
  const [end, setEnd] = useState(init.shift?.end ?? init.end ?? "18:00");
  const [note, setNote] = useState(init.shift?.note ?? "");
  const [busy, setBusy] = useState(false);

  const valid = employeeId && date && HM.test(start) && HM.test(end);
  const preview = valid ? fmtHours(durMin(start, end)) : null;

  async function save() {
    if (!valid) return;
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
    <Modal title={editing ? "Editar turno" : "Nuevo turno"} onClose={onClose} maxWidth={440}>
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
          {preview && <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>Duración: <b style={{ color: "var(--color-ink)" }}>{preview}</b></div>}
          <label style={fw}><span style={fl}>Nota (opcional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Cierre" /></label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
            <button className="btn-primary" onClick={save} disabled={busy || !valid}>{busy ? "…" : editing ? "Guardar" : "Crear"}</button>
            {editing && <button className="btn-secondary" onClick={remove} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>}
            <button className="btn-secondary" onClick={onClose} disabled={busy} style={{ marginLeft: "auto" }}>Cancelar</button>
          </div>
        </div>
    </Modal>
  );
}

const navBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", fontSize: "1.125rem", color: "var(--color-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
const fw: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const fl: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" };
