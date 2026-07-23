import { getPricingConfig } from "@/lib/pricing";
import PricingClient from "./PricingClient";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const config = await getPricingConfig();
  return <PricingClient initialConfig={config} />;
}
