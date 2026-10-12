import { apiModelIds, isModelAlias } from "./models.ts";

/** USD per million tokens. */
export type ModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * Anthropic list prices (platform.claude.com pricing, as of 2026-10). Cache writes use the 5-minute
 * TTL rate (1.25x input). UNVERIFIED: haiku-5-5 cache read is assumed 0.1x input, and its prices are
 * the "up to 100K prompt" tier ($0.50 / $2.50 beyond). Edit prices here only.
 */
export const modelPrices: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

/** `input` is the fresh (non-cached) prompt tokens; cached tokens are counted separately. */
export type UsageTokens = { input: number; cacheRead: number; cacheWrite: number; output: number };

/** Resolves an alias ("sonnet") or concrete id to a concrete model id. */
export function resolveModelId(model: string): string {
  return isModelAlias(model) ? apiModelIds[model] : model;
}

/** Approximate USD cost, or null when the model has no known price. */
export function computeCost(model: string, usage: UsageTokens): number | null {
  const price = modelPrices[resolveModelId(model)];
  if (!price) return null;
  return (
    (usage.input * price.input +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  );
}

export type UsageRow = UsageTokens & { model: string; costUsd: number | null };

export type UsageTotals = UsageTokens & {
  messages: number;
  /** Null when no message has a known cost. Messages with unknown cost are skipped. */
  costUsd: number | null;
};

/** Sums rows; a row's own reported cost (CLI engine) wins over the price-table estimate. */
export function aggregateUsage(rows: UsageRow[]): UsageTotals {
  const totals: UsageTotals = {
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    messages: rows.length,
    costUsd: null,
  };
  for (const row of rows) {
    totals.input += row.input;
    totals.cacheRead += row.cacheRead;
    totals.cacheWrite += row.cacheWrite;
    totals.output += row.output;
    const cost = row.costUsd ?? computeCost(row.model, row);
    if (cost !== null) totals.costUsd = (totals.costUsd ?? 0) + cost;
  }
  return totals;
}
