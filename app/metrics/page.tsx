import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getMetrics, getProjection, getInsights, getBreakdowns, getHeatmap, getFunnel, getCampaignEffectiveness, resolveRange } from "@/lib/metrics";
import MetricsClient from "./MetricsClient";

export const dynamic = "force-dynamic";

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const sp = await searchParams;
  const range = resolveRange(sp.range, sp.from, sp.to);
  const [data, projection, insights, breakdowns, heatmap, funnel, campaignEffects] = await Promise.all([
    getMetrics(range),
    getProjection(),
    getInsights(),
    getBreakdowns(range),
    getHeatmap(range),
    getFunnel(range),
    getCampaignEffectiveness(),
  ]);

  return (
    <MetricsClient
      preset={range.preset}
      fromDay={range.fromDay}
      toDay={range.toDay}
      granularity={range.granularity}
      current={data.current}
      previous={data.previous}
      series={data.series}
      topProducts={data.topProducts}
      bySource={data.bySource}
      projection={projection}
      insights={insights}
      breakdowns={breakdowns}
      heatmap={heatmap}
      funnel={funnel}
      campaignEffects={campaignEffects}
    />
  );
}
