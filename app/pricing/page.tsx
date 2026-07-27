import { getPricingSettings } from "@/lib/pricing";
import PricingClient from "./PricingClient";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const settings = await getPricingSettings();
  return <PricingClient initialSettings={settings} />;
}
