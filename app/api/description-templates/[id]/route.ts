import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PUT: update a template's name / skeleton / fields. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; skeleton?: string; fields?: string } = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.skeleton === "string") data.skeleton = body.skeleton;
  if (body.fields !== undefined) data.fields = typeof body.fields === "string" ? body.fields : JSON.stringify(body.fields);
  const t = await prisma.descriptionTemplate.update({ where: { id: Number(id) }, data });
  return NextResponse.json(t);
}

/** DELETE: remove a template. Products keep their rendered description; the link is cleared (SetNull). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.descriptionTemplate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
