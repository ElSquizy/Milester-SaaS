import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AgendaClient from "./AgendaClient";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");
  return <AgendaClient />;
}
