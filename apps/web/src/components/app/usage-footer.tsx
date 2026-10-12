import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type Engine, type ThreadUsage } from "@/lib/api";

const compact = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Compact token count: 950, 12,4 mil, 1,2 M. */
export const formatTokens = (n: number) => compact.format(n);

/** Under one cent the cost would show as $0.00, so say so explicitly. */
export const formatCost = (usd: number) => (usd > 0 && usd < 0.005 ? "<$0.01" : money.format(usd));

export function usageSummary(usage: ThreadUsage, engine: Engine) {
  const input = usage.input + usage.cacheRead + usage.cacheWrite;
  const parts = [
    `${formatTokens(input + usage.output)} tokens`,
    `entrada ${formatTokens(input)}`,
    `salida ${formatTokens(usage.output)}`,
  ];
  if (usage.cacheRead || usage.cacheWrite) {
    parts.push(`caché ${formatTokens(usage.cacheRead)} leído / ${formatTokens(usage.cacheWrite)} escrito`);
  }
  if (usage.costUsd !== null) {
    parts.push(engine === "cli" ? `≈ ${formatCost(usage.costUsd)} equivalente API` : `≈ ${formatCost(usage.costUsd)}`);
  }
  return parts.join(" · ");
}

/** Discreet totals line under the composer. Refetches whenever a response finishes streaming. */
export function UsageFooter({ threadId, engine, status }: { threadId: string; engine: Engine; status: string }) {
  const [usage, setUsage] = useState<ThreadUsage | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    api
      .threadUsage(threadId)
      .then((u) => !cancelled && setUsage(u))
      .catch(() => {}); // purely informational
    return () => {
      cancelled = true;
    };
  }, [threadId, status]);

  if (!usage || usage.messages === 0) return null;
  const line = (
    <p className="mt-1.5 text-center text-xs text-muted-foreground tabular-nums">{usageSummary(usage, engine)}</p>
  );
  if (usage.costUsd === null) return line;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{line}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {engine === "cli"
          ? "Estimación a precios de lista de la API. Con el motor CLI (suscripción) no se cobra por token."
          : "Estimación a precios de lista de la API de Anthropic, según los tokens de esta conversación."}
      </TooltipContent>
    </Tooltip>
  );
}
