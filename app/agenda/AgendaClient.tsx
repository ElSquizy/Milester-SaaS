"use client";
import { useEffect, useMemo, useState } from "react";
import CalendarView from "./CalendarView";
import HorariosView from "./HorariosView";
import Modal from "@/components/Modal";

type Employee = { id: number; name: string; role: string | null; color: string; active: boolean; openTasks: number };
type Assignee = { id: number; name: string; color: string } | null;
type Task = { id: number; title: string; note: string | null; dueDate: string | null; priority: string; status: string; assigneeId: number | null; assignee: Assignee };

const STATUSES = [
  { v: "pending", label: "Pendiente", color: "var(--color-warning)" },
  { v: "doing", label: "Haciendo", color: "var(--color-info)" },
  { v: "done", label: "Hecho", color: "var(--color-success)" },
] as const;
const PRIORITY: Record<string, { label: string; fg: string; bg: string }> = {
  alta: { label: "Alta", fg: "var(--color-danger)", bg: "var(--color-danger-bg)" },
  media: { label: "Media", fg: "var(--color-warning)", bg: "var(--color-warning-bg)" },
  baja: { label: "Baja", fg: "var(--color-subtle)", bg: "var(--color-surface-2)" },
};
const COLORS = ["#2563EB", "#8B5CF6", "#16A34A", "#DC2626", "#EA580C", "#0D9488", "#DB2777", "#CA8A04"];

function dueMeta(iso: string | null, done: boolean): { label: string; color: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.floor((d.getTime() - Date.now()) / 86400000);
  const fmt = d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  if (done) return { label: fmt, color: "var(--color-subtle)" };
  if (days < 0) return { label: `${fmt} · vencida`, color: "var(--color-danger)" };
  if (days === 0) return { label: "Hoy", color: "var(--color-warning)" };
  if (days === 1) return { label: "Mañana", color: "var(--color-warning)" };
  return { label: fmt, color: "var(--color-muted)" };
}

export default function AgendaClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "board">("list");
  const [fAssignee, setFAssignee] = useState<string>(""); // "" | "none" | id
  const [fStatus, setFStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [taskModal, setTaskModal] = useState<null | Task | "new">(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [tab, setTab] = useState<"tareas" | "calendario" | "horarios">("tareas");
  const [calKey, setCalKey] = useState(0);

  async function loadAll() {
    const [emps, tks] = await Promise.all([
      fetch("/api/employees").then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
    ]);
    setEmployees(emps); setTasks(tks); setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  async function reloadTasks() { setTasks(await fetch("/api/tasks").then((r) => r.json())); }

  // Filtrado en cliente (rápido, sin round-trips).
  const filtered = useMemo(() => tasks.filter((t) => {
    if (fAssignee === "none" && t.assigneeId != null) return false;
    if (fAssignee && fAssignee !== "none" && String(t.assigneeId) !== fAssignee) return false;
    if (fStatus && t.status !== fStatus) return false;
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [tasks, fAssignee, fStatus, q]);

  async function patchTask(id: number, data: Partial<Task>) {
    // Optimista para el drag/checkbox.
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    await fetch(`/api/tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    reloadTasks(); loadEmployeesCount();
  }
  async function loadEmployeesCount() { setEmployees(await fetch("/api/employees").then((r) => r.json())); }

  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 14px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.03em" }}>Agenda</h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
              {openCount} {openCount === 1 ? "tarea abierta" : "tareas abiertas"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Pestañas de la sección */}
            <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", borderRadius: "var(--radius-control)", padding: 3 }}>
              {([["tareas", "Tareas"], ["calendario", "Calendario"], ["horarios", "Horarios"]] as const).map(([tb, label]) => (
                <button key={tb} onClick={() => setTab(tb)} style={{ padding: "6px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: tab === tb ? 600 : 500, background: tab === tb ? "var(--color-surface)" : "transparent", color: tab === tb ? "var(--color-brand)" : "var(--color-subtle)", boxShadow: tab === tb ? "var(--shadow-card)" : "none" }}>
                  {label}
                </button>
              ))}
            </div>
            {tab === "tareas" && (
              <>
                <div style={{ display: "flex", gap: 3, background: "var(--color-surface-2)", borderRadius: "var(--radius-control)", padding: 3 }}>
                  {(["list", "board"] as const).map((v) => (
                    <button key={v} onClick={() => setView(v)} style={{ padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: "0.8125rem", fontWeight: view === v ? 600 : 500, background: view === v ? "var(--color-surface)" : "transparent", color: view === v ? "var(--color-ink)" : "var(--color-subtle)", boxShadow: view === v ? "var(--shadow-card)" : "none" }}>
                      {v === "list" ? "Lista" : "Tablero"}
                    </button>
                  ))}
                </div>
                <button className="btn-primary" onClick={() => setTaskModal("new")} style={{ padding: "8px 14px" }}>+ Nueva tarea</button>
              </>
            )}
          </div>
        </div>

        {/* Equipo (chips-filtro) — solo en Tareas */}
        {tab === "tareas" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setFAssignee("")} style={chip(fAssignee === "", null)}>Todas</button>
          {employees.filter((e) => e.active).map((e) => (
            <button key={e.id} onClick={() => setFAssignee(fAssignee === String(e.id) ? "" : String(e.id))} style={chip(fAssignee === String(e.id), e.color)}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
              {e.name}{e.openTasks > 0 && <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>· {e.openTasks}</span>}
            </button>
          ))}
          <button onClick={() => setFAssignee(fAssignee === "none" ? "" : "none")} style={chip(fAssignee === "none", null)}>Sin asignar</button>
          <button onClick={() => setTeamOpen(true)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: "var(--radius-pill)", border: "1px solid var(--color-border)", background: "var(--color-surface)", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)", cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Equipo
          </button>
          {view === "list" && (
            <>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.8125rem", color: "var(--color-ink)", cursor: "pointer" }}>
                <option value="">Todos los estados</option>
                {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-2)", fontSize: "0.8125rem", width: 160 }} />
            </>
          )}
        </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px 60px" }}>
        {tab === "horarios" ? (
          <HorariosView employees={employees.filter((e) => e.active)} />
        ) : tab === "calendario" ? (
          <CalendarView refreshKey={calKey} onEditTask={(t) => setTaskModal(t as Task)} />
        ) : loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Cargando…</div>
        ) : tasks.length === 0 ? (
          <EmptyState onNew={() => setTaskModal("new")} hasTeam={employees.length > 0} onTeam={() => setTeamOpen(true)} />
        ) : view === "list" ? (
          <ListView tasks={filtered} onToggleDone={(t) => patchTask(t.id, { status: t.status === "done" ? "pending" : "done" })} onEdit={(t) => setTaskModal(t)} />
        ) : (
          <BoardView tasks={filtered} onMove={(id, status) => patchTask(id, { status })} onEdit={(t) => setTaskModal(t)} />
        )}
      </div>

      {taskModal && (
        <TaskModal
          task={taskModal === "new" ? null : taskModal}
          employees={employees.filter((e) => e.active)}
          onClose={() => setTaskModal(null)}
          onSaved={() => { setTaskModal(null); reloadTasks(); loadEmployeesCount(); setCalKey((k) => k + 1); }}
        />
      )}
      {teamOpen && <TeamModal employees={employees} onClose={() => setTeamOpen(false)} onChanged={loadAll} />}
    </div>
  );
}

function EmptyState({ onNew, hasTeam, onTeam }: { onNew: () => void; hasTeam: boolean; onTeam: () => void }) {
  return (
    <div className="card" style={{ maxWidth: 460, margin: "40px auto", padding: "40px 28px", textAlign: "center" }}>
      <div style={{ fontSize: "1.0625rem", fontWeight: 600, marginBottom: 6 }}>Organizá el trabajo del equipo</div>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
        Creá tareas, asignalas a tu equipo y seguí su estado en lista o tablero.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {!hasTeam && <button className="btn-secondary" onClick={onTeam}>Agregar empleados</button>}
        <button className="btn-primary" onClick={onNew}>+ Nueva tarea</button>
      </div>
    </div>
  );
}

function TaskRow({ task, onToggleDone, onEdit }: { task: Task; onToggleDone: () => void; onEdit: () => void }) {
  const done = task.status === "done";
  const due = dueMeta(task.dueDate, done);
  const pr = PRIORITY[task.priority];
  const st = STATUSES.find((s) => s.v === task.status)!;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: "1px solid var(--color-divider)" }}>
      <button onClick={onToggleDone} aria-label={done ? "Marcar pendiente" : "Marcar hecha"}
        style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 6, border: `1.5px solid ${done ? "var(--color-success)" : "var(--color-border)"}`, background: done ? "var(--color-success)" : "transparent", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>{done ? "✓" : ""}</button>
      <button onClick={onEdit} style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: done ? "var(--color-subtle)" : "var(--color-ink)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
        {task.note && <div style={{ fontSize: "0.75rem", color: "var(--color-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.note}</div>}
      </button>
      {due && <span style={{ fontSize: "0.75rem", color: due.color, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>{due.label}</span>}
      <span style={{ fontSize: "0.625rem", fontWeight: 700, padding: "2px 7px", borderRadius: "var(--radius-pill)", background: pr.bg, color: pr.fg, flexShrink: 0 }}>{pr.label}</span>
      {task.assignee
        ? <span title={task.assignee.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: "0.75rem", color: "var(--color-muted)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: task.assignee.color }} />{task.assignee.name}</span>
        : <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", flexShrink: 0 }}>—</span>}
      {!done && <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color, flexShrink: 0 }} title={st.label} />}
    </div>
  );
}

function ListView({ tasks, onToggleDone, onEdit }: { tasks: Task[]; onToggleDone: (t: Task) => void; onEdit: (t: Task) => void }) {
  if (tasks.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "var(--color-subtle)", fontSize: "0.875rem" }}>Sin tareas para este filtro</div>;
  return (
    <div className="card" style={{ maxWidth: 860, margin: "0 auto", overflow: "hidden", padding: 0 }}>
      {tasks.map((t, i) => (
        <div key={t.id} style={{ borderTop: i === 0 ? "none" : undefined }}>
          <TaskRow task={t} onToggleDone={() => onToggleDone(t)} onEdit={() => onEdit(t)} />
        </div>
      ))}
    </div>
  );
}

function BoardView({ tasks, onMove, onEdit }: { tasks: Task[]; onMove: (id: number, status: string) => void; onEdit: (t: Task) => void }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="kanban-board">
      {STATUSES.map((s) => {
        const col = tasks.filter((t) => t.status === s.v);
        return (
          <div key={s.v}
            onDragOver={(e) => { e.preventDefault(); setOver(s.v); }}
            onDragLeave={() => setOver((o) => (o === s.v ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData("text/task")); if (id) onMove(id, s.v); }}
            style={{ background: over === s.v ? "var(--color-brand-light)" : "var(--color-surface-2)", borderRadius: "var(--radius-card)", padding: 10, minHeight: 120, transition: "background 0.12s", border: over === s.v ? "1px dashed var(--color-brand)" : "1px solid transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px 10px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)" }}>{s.label}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{col.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {col.map((t) => (
                <BoardCard key={t.id} task={t} onEdit={() => onEdit(t)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const pr = PRIORITY[task.priority];
  const due = dueMeta(task.dueDate, task.status === "done");
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task", String(task.id))}
      onClick={onEdit}
      className="card"
      style={{ padding: "10px 12px", cursor: "grab", boxShadow: "var(--shadow-card)" }}>
      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-ink)", marginBottom: 6, lineHeight: 1.3 }}>{task.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.5625rem", fontWeight: 700, padding: "2px 6px", borderRadius: "var(--radius-pill)", background: pr.bg, color: pr.fg }}>{pr.label}</span>
        {due && <span style={{ fontSize: "0.6875rem", color: due.color, fontWeight: 500 }}>{due.label}</span>}
        {task.assignee && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6875rem", color: "var(--color-muted)" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: task.assignee.color }} />{task.assignee.name}</span>}
      </div>
    </div>
  );
}

function TaskModal({ task, employees, onClose, onSaved }: { task: Task | null; employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  const [priority, setPriority] = useState(task?.priority ?? "media");
  const [status, setStatus] = useState(task?.status ?? "pending");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId != null ? String(task.assigneeId) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const body = { title, note, dueDate: dueDate || null, priority, status, assigneeId: assigneeId ? Number(assigneeId) : null };
    const url = task ? `/api/tasks/${task.id}` : "/api/tasks";
    await fetch(url, { method: task ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); onSaved();
  }
  async function remove() {
    if (!task || !confirm("¿Eliminar esta tarea?")) return;
    setBusy(true);
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setBusy(false); onSaved();
  }

  return (
    <Modal onClose={onClose} title={task ? "Editar tarea" : "Nueva tarea"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Título">
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Cargar preventa de GTA VI" />
        </Field>
        <Field label="Nota (opcional)">
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ resize: "vertical" }} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Vencimiento"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Asignar a">
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Sin asignar</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </Field>
          <Field label="Estado">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button className="btn-primary" onClick={save} disabled={busy || !title.trim()}>{busy ? "…" : task ? "Guardar" : "Crear"}</button>
          {task && <button className="btn-secondary" onClick={remove} disabled={busy} style={{ color: "var(--color-danger)" }}>Eliminar</button>}
          <button className="btn-secondary" onClick={onClose} disabled={busy} style={{ marginLeft: "auto" }}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

function TeamModal({ employees, onClose, onChanged }: { employees: Employee[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role, color }) });
    setName(""); setRole(""); setBusy(false); onChanged();
  }
  async function toggleActive(e: Employee) { await fetch(`/api/employees/${e.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !e.active }) }); onChanged(); }
  async function remove(e: Employee) { if (!confirm(`¿Eliminar a ${e.name}? Sus tareas quedan sin asignar.`)) return; await fetch(`/api/employees/${e.id}`, { method: "DELETE" }); onChanged(); }

  return (
    <Modal onClose={onClose} title="Equipo">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {employees.length === 0 && <div style={{ fontSize: "0.8125rem", color: "var(--color-subtle)", padding: "6px 0" }}>Todavía no cargaste empleados.</div>}
        {employees.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "var(--color-surface-2)", opacity: e.active ? 1 : 0.55 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-ink)" }}>{e.name}{!e.active && " (inactivo)"}</div>
              {e.role && <div style={{ fontSize: "0.6875rem", color: "var(--color-subtle)" }}>{e.role}</div>}
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--color-subtle)", fontVariantNumeric: "tabular-nums" }}>{e.openTasks} abiertas</span>
            <button onClick={() => toggleActive(e)} className="btn-secondary" style={{ padding: "4px 9px", fontSize: "0.6875rem" }}>{e.active ? "Desactivar" : "Activar"}</button>
            <button onClick={() => remove(e)} title="Eliminar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-subtle)", padding: 2 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 14 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--color-subtle)", marginBottom: 10 }}>Agregar empleado</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 160 }} /></Field>
          <Field label="Rol (opcional)"><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ventas" style={{ width: 130 }} /></Field>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-muted)", marginBottom: 5 }}>Color</div>
            <div style={{ display: "flex", gap: 5 }}>
              {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--color-ink)" : "2px solid transparent", cursor: "pointer" }} />)}
            </div>
          </div>
          <button className="btn-primary" onClick={add} disabled={busy || !name.trim()}>Agregar</button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function chip(active: boolean, color: string | null): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
    padding: "6px 11px", borderRadius: "var(--radius-pill)", fontSize: "0.75rem", fontWeight: 600,
    border: "1px solid " + (active ? (color ?? "var(--color-brand)") : "var(--color-border)"),
    background: active ? "var(--color-brand-light)" : "var(--color-surface)",
    color: active ? "var(--color-ink)" : "var(--color-muted)",
  };
}
