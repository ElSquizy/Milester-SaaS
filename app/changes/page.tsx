import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ChangesClient from "./ChangesClient";

export const dynamic = "force-dynamic";

export default async function ChangesPage() {
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) redirect("/settings");
  return <ChangesClient />;
}
