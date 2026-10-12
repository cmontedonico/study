import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateUsage, computeCost } from "./pricing.ts";

const u = { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 };

test("computeCost applies cache multipliers per model", () => {
  assert.equal(computeCost("claude-sonnet-5-5", u), 2 + 0.2 + 2.5 + 10);
  assert.equal(computeCost("sonnet", u), 14.7); // alias resolves to the API id
});

test("computeCost is null for unknown models", () => {
  assert.equal(computeCost("mystery-1", u), null);
});

test("aggregateUsage sums tokens, prefers reported cost and skips unknown prices", () => {
  const totals = aggregateUsage([
    { model: "sonnet", input: 1000, cacheRead: 0, cacheWrite: 0, output: 100, costUsd: 0.5 },
    { model: "sonnet", input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0, costUsd: null },
    { model: "mystery", input: 10, cacheRead: 5, cacheWrite: 1, output: 2, costUsd: null },
  ]);
  assert.equal(totals.input, 1_001_010);
  assert.equal(totals.cacheRead, 5);
  assert.equal(totals.output, 102);
  assert.equal(totals.messages, 3);
  assert.equal(totals.costUsd, 2.5);
});

test("aggregateUsage has no cost when nothing is priced", () => {
  const totals = aggregateUsage([{ model: "x", input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: null }]);
  assert.equal(totals.costUsd, null);
});
