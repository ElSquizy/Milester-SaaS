import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET: empleados (activos primero, por nombre) con su nº de tareas abiertas. */
export async function GET() {
  const employees = await prisma.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, role: true, color: true, active: true,
      _count: { select: { tasks: { where: { status: { not: "done" } } } } },
    },
  });
  return NextResponse.json(employees.map((e) => ({ ...e, openTasks: e._count.tasks })));
}

/** POST: alta de empleado. Body { name, role?, color? }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const e = await prisma.employee.create({
    data: {
      name,
      role: typeof body.role === "string" && body.role.trim() ? body.role.trim() : null,
      ...(typeof body.color === "string" && body.color ? { color: body.color } : {}),
    },
  });
  return NextResponse.json(e);
}
